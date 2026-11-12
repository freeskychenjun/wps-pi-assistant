// 验证：工具调用是否被记录、/context 是否把 tools 带回来
const http = require("http");

function post(path, obj) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(obj || {});
        const req = http.request({
            host: "127.0.0.1", port: 3987, path: path, method: "POST",
            headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
        }, (res) => {
            let d = "";
            res.on("data", (c) => d += c);
            res.on("end", () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error(d)); } });
        });
        req.on("error", reject);
        req.end(body);
    });
}

function waitDone(timeoutMs) {
    return new Promise((resolve) => {
        const req = http.request({ host: "127.0.0.1", port: 3987, path: "/events" }, (res) => {
            let buf = "";
            const timer = setTimeout(() => { req.destroy(); resolve("timeout"); }, timeoutMs);
            res.on("data", (c) => {
                buf += c.toString();
                let i;
                while ((i = buf.indexOf("\n\n")) >= 0) {
                    const chunk = buf.slice(0, i).trim();
                    buf = buf.slice(i + 2);
                    const line = chunk.replace(/^data:\s*/, "");
                    let ev; try { ev = JSON.parse(line); } catch { continue; }
                    if (ev.type === "tool") console.log("  ⚙ tool:", ev.name);
                    if (ev.type === "delta") process.stdout.write(ev.delta);
                    if (ev.type === "done") { clearTimeout(timer); req.destroy(); resolve("done"); }
                    if (ev.type === "error") { clearTimeout(timer); req.destroy(); resolve("error: " + ev.error); }
                }
            });
        });
        req.end();
    });
}

(async () => {
    const docKey = process.argv[2] || "tooltest";
    const msg = process.argv[3] || "用 bash 运行 node -v，把版本号告诉我";
    const done = waitDone(180000);
    await new Promise((r) => setTimeout(r, 300));
    console.log("[prompt]", JSON.stringify(await post("/prompt", { docKey, message: msg })));
    console.log("\n[wait]", await done);
    const ctx = await post("/context", { docKey });
    console.log("\n[context] msgs=" + (ctx.messages || []).length + " tools=" + JSON.stringify(ctx.tools));
    console.log("[prune-dry]", JSON.stringify(await post("/prune", { days: 30, keepPerDoc: 20, dryRun: true })));
    process.exit(0);
})();
