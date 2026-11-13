/**
 * pi 扩展：把「任务窗格里的文档读取能力」暴露成 agent 工具（只读）。
 *
 * 链路：
 *   agent 调 doc_info / doc_read / doc_find
 *     → 本扩展 HTTP POST http://127.0.0.1:3987/docreq
 *     → bridge 把请求转给「正在编辑该文档的那个任务窗格」（SSE docreq）
 *     → 面板用 WPS JSAPI 读实时内容，POST /docresult 回来
 *     → 工具把文本交给模型
 *
 * 只读：不写文档、不改文件。对文档的修改仍然只能由模型输出 wps-* 代码块，
 * 交给面板执行（这样修订/撤销/接管标记都还走原来那条路）。
 *
 * 由 bridge.js 以 `-e pi-doc-tools.js` 显式加载；工具名必须同时出现在
 * bridge.js 的 TOOL_ALLOW 里，否则会被 --tools 白名单挡掉。
 */
import http from "node:http";

const BRIDGE_HOST = "127.0.0.1";
const BRIDGE_PORT = 3987;
const TIMEOUT_MS = 35000;

function bridgePost(pathname, payload) {
	return new Promise((resolve, reject) => {
		const body = JSON.stringify(payload || {});
		const req = http.request(
			{
				host: BRIDGE_HOST,
				port: BRIDGE_PORT,
				path: pathname,
				method: "POST",
				headers: {
					"Content-Type": "application/json; charset=utf-8",
					"Content-Length": Buffer.byteLength(body),
				},
			},
			(res) => {
				let data = "";
				res.setEncoding("utf8");
				res.on("data", (c) => {
					data += c;
				});
				res.on("end", () => {
					try {
						resolve(JSON.parse(data));
					} catch {
						reject(new Error("桥接返回了非 JSON 内容：" + String(data).slice(0, 200)));
					}
				});
			},
		);
		req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error("读文档超时（" + TIMEOUT_MS + "ms）")));
		req.on("error", (e) => reject(e));
		req.write(body);
		req.end();
	});
}

/**
 * 请求任务窗格读文档。失败时抛出「模型能读懂、也知道下一步怎么问用户」的错误。
 */
async function askPane(req) {
	let j;
	try {
		j = await bridgePost("/docreq", { req });
	} catch (e) {
		throw new Error(
			"读文档失败：连不上桥接（127.0.0.1:3987）。请让用户确认 start-bridge.cmd 已启动。原因：" +
				(e && e.message ? e.message : e),
		);
	}
	if (!j || !j.ok) {
		throw new Error("读文档失败：" + ((j && j.error) || "任务窗格没有响应"));
	}
	const text = String(j.text || "").trim();
	if (!text) throw new Error("读文档失败：任务窗格返回了空内容");
	return text;
}

function fail(message) {
	return { content: [{ type: "text", text: message }], details: {}, isError: true };
}

export default function docToolsExtension(pi) {
	pi.registerTool({
		name: "doc_info",
		label: "文档概览",
		description:
			"读取用户当前 WPS 文档的概览：文件名、段落/字符规模、全部表格清单（序号、行列数、首行内容）、" +
			"光标所在位置、脚注/公式/未处理修订数量。用户提到文档结构、表格、全文范围等需要定位的信息时先调它。",
		promptSnippet: "读取当前 WPS 文档的概览与表格清单",
		promptGuidelines: [
			"用户提到表格、章节、全文结构而消息里的【当前文档】摘要不够时，用 doc_info 先拿到表格清单和光标位置。",
		],
		parameters: { type: "object", properties: {}, additionalProperties: false },
		async execute() {
			try {
				return { content: [{ type: "text", text: await askPane({ kind: "info" }) }], details: {} };
			} catch (e) {
				return fail(e.message);
			}
		},
	});

	pi.registerTool({
		name: "doc_read",
		label: "读取文档内容",
		description:
			"读取当前 WPS 文档的具体内容（只读）。what 取值：selection=光标所在段落/选中的内容（光标在表格里时返回整张表）；" +
			"paragraph=某一段（index 省略则光标所在段）；paragraphs=一段范围（start/end，段号为 1 起）；" +
			'table=某张表格的整表（index 为表格序号，1 起，可用 startRow/endRow 限定行）；outline=标题大纲；all=全文（受 maxChars 限制）。' +
			'表格返回的每行以 " | " 分隔单元格，行首带行号，空单元格为空字符串。',
		promptSnippet: "按需读取当前 WPS 文档的段落/选区/表格/大纲/全文",
		promptGuidelines: [
			"需要确认原文、逐字锚点、表格数值或空单元格位置时，用 doc_read 读，不要凭空编造 find 字符串。",
			"doc_read what=table 时先用 doc_info 查表格序号；大表格用 startRow/endRow 分次读。",
		],
		parameters: {
			type: "object",
			properties: {
				what: {
					type: "string",
					enum: ["selection", "paragraph", "paragraphs", "table", "outline", "all"],
					description: "读取哪一部分",
				},
				index: { type: "number", description: "表格序号（what=table）或段落序号（what=paragraph），1 起；省略表示光标处" },
				start: { type: "number", description: "起始段号（what=paragraphs），1 起，默认 1" },
				end: { type: "number", description: "结束段号（what=paragraphs），含在范围内" },
				startRow: { type: "number", description: "起始行（what=table），1 起" },
				endRow: { type: "number", description: "结束行（what=table），含在范围内" },
				maxChars: { type: "number", description: "返回文本上限，默认 8000，最大 30000" },
			},
			required: ["what"],
			additionalProperties: false,
		},
		async execute(_toolCallId, params) {
			try {
				return {
					content: [{ type: "text", text: await askPane({ kind: "read", ...params }) }],
					details: {},
				};
			} catch (e) {
				return fail(e.message);
			}
		},
	});

	pi.registerTool({
		name: "doc_find",
		label: "检索文档",
		description:
			"在当前 WPS 文档里检索一段文字（只读），返回命中的段落号或「表 n 第 r 行第 c 列」，以及命中处的上下文。" +
			"用于确认某句话/某个数值在不在文档里、在第几段第几张表。",
		promptSnippet: "在当前 WPS 文档里检索文字，返回段落号/表格单元格位置",
		promptGuidelines: [
			"改文前如果想确认某个片段在文档里唯一或定位到具体位置，用 doc_find 检索，别猜。",
		],
		parameters: {
			type: "object",
			properties: {
				query: { type: "string", description: "要检索的文字（原样匹配，区分大小写）" },
				scope: { type: "string", enum: ["all", "paragraphs", "tables"], description: "检索范围，默认 all" },
				maxHits: { type: "number", description: "最多返回多少条命中，默认 10" },
			},
			required: ["query"],
			additionalProperties: false,
		},
		async execute(_toolCallId, params) {
			try {
				return {
					content: [{ type: "text", text: await askPane({ kind: "find", ...params }) }],
					details: {},
				};
			} catch (e) {
				return fail(e.message);
			}
		},
	});
}
