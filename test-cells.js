// Debug harness: dump cell -> applyCells -> dump -> undo -> dump
const http = require("http");
const DOC_KEY = process.env.DOC_KEY || require("path").join(__dirname, "test-p8-merged.docx");

function post(path, obj) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(obj);
        const req = http.request({
            host: "127.0.0.1", port: 3987, path, method: "POST", timeout: 60000,
            headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
        }, (res) => {
            let b = "";
            res.on("data", (c) => (b += c));
            res.on("end", () => resolve(b));
        });
        req.on("error", reject);
        req.write(data);
        req.end();
    });
}

async function req(payload) {
    const b = await post("/docreq", { req: Object.assign({ docKey: DOC_KEY }, payload) });
    return JSON.parse(b);
}

const COLOR = ["P50", "P75", "P80", "P90", "P95"];
const VALUES = ["213", "165", "155", "131", "114"];

async function dump(tag) {
    for (const col of [3, 4]) {
        const d = await req({ kind: "dev_cell", table: 1, row: 5, col });
        console.log(`-- ${tag} cell(5,${col}) ok=${d.ok} ${d.error || ""}`);
        console.log((d.text || "").split("\n").map((l) => "   " + l).join("\n"));
    }
}

(async () => {
    await post("/pane", { docKey: DOC_KEY });
    await dump("BEFORE");

    const cells = VALUES.map((v, i) => ({ table: 1, row: 5, col: 3 + i, text: v }));
    const w = await req({ kind: "dev_cells", cells });
    console.log("\n== APPLY ok=" + w.ok + "\n" + (w.text || w.error));
    await dump("AFTER WRITE");

    const u = await req({ kind: "dev_undo" });
    console.log("\n== UNDO ok=" + u.ok + " " + (u.error || ""));
    await dump("AFTER UNDO");
})();
