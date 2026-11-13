// 全文体检回归探针：先向 bridge 注册面板（/pane），再请求 kind=lint（/docreq）
// 用法（需先在 WPS 里打开样本文档、侧栏在线）：
//   node test-lint.js
//   $env:DOC_KEY="D:\path\to\doc.docx"; node test-lint.js
// 期望：elapsed 几十毫秒、ok=true，并列出「高 x / 中 y / 低 z」的问题清单
const http = require("http");

const PORT = 3987;
const DOC_KEY = process.env.DOC_KEY || "D:\\DSH工作区\\wps-pi-plugin\\test-lint.docx";

function post(path, obj) {
	return new Promise((resolve, reject) => {
		const body = Buffer.from(JSON.stringify(obj), "utf8");
		const req = http.request(
			{
				host: "127.0.0.1",
				port: PORT,
				path,
				method: "POST",
				headers: {
					"Content-Type": "application/json; charset=utf-8",
					"Content-Length": body.length,
				},
			},
			(res) => {
				let d = "";
				res.setEncoding("utf8");
				res.on("data", (c) => (d += c));
				res.on("end", () => resolve(d));
			},
		);
		req.on("error", reject);
		req.setTimeout(40000, () => req.destroy(new Error("timeout")));
		req.write(body);
		req.end();
	});
}

(async () => {
	await post("/pane", { docKey: DOC_KEY });
	const t0 = Date.now();
	const raw = await post("/docreq", { req: { kind: "lint", docKey: DOC_KEY, maxItems: 80 } });
	const ms = Date.now() - t0;
	let j;
	try {
		j = JSON.parse(raw);
	} catch {
		console.log("非 JSON 返回：", String(raw).slice(0, 300));
		return;
	}
	console.log(`elapsed=${ms}ms ok=${j.ok}`);
	const text = j.text || j.error || "";
	console.log(text);
	const head = /体检：.*/.exec(text);
	const n = (text.match(/^\[[高中低]\]/gm) || []).length;
	console.log(`--- 共 ${n} 条${head ? "：" + head[0] : ""}`);
})();
