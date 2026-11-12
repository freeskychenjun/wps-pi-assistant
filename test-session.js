// 会话持久化 E2E：/context → /prompt → /context（历史）→ 重启后再 /context
const http = require("http");

function post(path, obj) {
    return new Promise((resolve, reject) => {
        const body = Buffer.from(JSON.stringify(obj), "utf8");
        const req = http.request({
            host: "127.0.0.1", port: 3987, path, method: "POST",
            headers: { "Content-Type": "application/json", "Content-Length": body.length }
        }, (res) => {
            let b = "";
            res.on("data", (c) => (b += c));
            res.on("end", () => { try { resolve(JSON.parse(b)); } catch { resolve({ raw: b }); } });
        });
        req.on("error", reject);
        req.write(body); req.end();
    });
}

function get(path) {
    return new Promise((resolve, reject) => {
        http.get({ host: "127.0.0.1", port: 3987, path }, (res) => {
            let b = "";
            res.on("data", (c) => (b += c));
            res.on("end", () => { try { resolve(JSON.parse(b)); } catch { resolve({ raw: b }); } });
        }).on("error", reject);
    });
}

function sseOnce(ms) {
    return new Promise((resolve) => {
        const out = [];
        const req = http.get({ host: "127.0.0.1", port: 3987, path: "/events" }, (res) => {
            res.setEncoding("utf8");
            res.on("data", (chunk) => {
                for (const line of chunk.split("\n")) {
                    if (!line.startsWith("data: ")) continue;
                    try {
                        const ev = JSON.parse(line.slice(6));
                        out.push(ev);
                        if (ev.type === "done") { req.destroy(); return resolve(out); }
                        if (ev.type === "error") { req.destroy(); return resolve(out); }
                    } catch {}
                }
            });
        });
        setTimeout(() => { try { req.destroy(); } catch {} resolve(out); }, ms);
    });
}

(async () => {
    const DOC = "测试文档A";
    console.log("[1] 切到文档 session …");
    let r = await post("/context", { docKey: DOC });
    console.log("    ok=", r.ok, "历史条数=", (r.messages || []).length);

    console.log("[2] 发 prompt …");
    const sseP = sseOnce(90000);
    r = await post("/prompt", { message: "请只回复：第一轮回复", docKey: DOC });
    console.log("    prompt ok=", r.ok);
    const evs = await sseP;
    const done = evs.filter((e) => e.type === "done").pop();
    console.log("    回复=", done ? JSON.stringify(done.text) : "(无)");

    console.log("[3] 再取历史（同一 session）…");
    r = await post("/context", { docKey: DOC });
    console.log("    ok=", r.ok, "历史条数=", (r.messages || []).length);
    for (const m of r.messages || []) console.log("     -", m.role + ":", m.text.slice(0, 40));

    console.log("[4] health:", JSON.stringify(await get("/health")));
})();
