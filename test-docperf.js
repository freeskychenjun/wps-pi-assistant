// 文档读取性能探针：直接打 bridge /docreq，测面板真实读取耗时（不需要 LLM）
// 用法：先起 bridge、在 WPS 里打开一份大文档（如 python make-p8-big.py 生成的 test-p8-big.docx），再 node test-docperf.js
const http = require("http");
const DOC_KEY = process.env.DOC_KEY || "D:\\DSH工作区\\wps-pi-plugin\\test-p8-big.docx";

function post(path, obj, timeoutMs) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(obj);
        const t0 = Date.now();
        const req = http.request({
            host: "127.0.0.1", port: 3987, path, method: "POST", timeout: timeoutMs || 40000,
            headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
        }, (res) => {
            let b = "";
            res.on("data", (c) => (b += c));
            res.on("end", () => resolve({ ms: Date.now() - t0, code: res.statusCode, body: b }));
        });
        req.on("error", reject);
        req.on("timeout", () => { req.destroy(new Error("timeout")); });
        req.write(data);
        req.end();
    });
}

const cases = [
    ["find 乐平枢纽", { kind: "find", query: "乐平枢纽", docKey: DOC_KEY }],
    ["find 水位 (默认上限)", { kind: "find", query: "水位", docKey: DOC_KEY }],
    ["find 水位 maxHits=50", { kind: "find", query: "水位", maxHits: 50, docKey: DOC_KEY }],
    ["find 不存在的词", { kind: "find", query: "zzz不存在zzz", docKey: DOC_KEY }],
    ["read all (默认8000)", { kind: "read", what: "all", docKey: DOC_KEY }],
    ["read all maxChars=30000", { kind: "read", what: "all", maxChars: 30000, docKey: DOC_KEY }],
    ["read table 15", { kind: "read", what: "table", index: 15, docKey: DOC_KEY }],
    ["read paragraphs 645-660", { kind: "read", what: "paragraphs", start: 645, end: 660, docKey: DOC_KEY }],
    ["info", { docKey: DOC_KEY }]
];

(async () => {
    // 确保心跳
    await post("/pane", { docKey: DOC_KEY });
    for (const [name, payload] of cases) {
        try {
            const r = await post("/docreq", { req: payload });
            let parsed = null;
            try { parsed = JSON.parse(r.body); } catch (e) {}
            const text = (parsed && parsed.text) || "";
            const lines = text ? text.split("\n").length : 0;
            console.log(`${name}: ${r.ms}ms code=${r.code} ok=${parsed && parsed.ok} chars=${text.length} lines=${lines}`);
            if (text) console.log("   head: " + text.split("\n").slice(0, 2).join(" ⏎ ").slice(0, 160));
            if (parsed && parsed.error) console.log("   error: " + parsed.error);
        } catch (e) {
            console.log(`${name}: FAILED ${e.message}`);
        }
    }
})();
