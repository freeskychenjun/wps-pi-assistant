// 娴嬭瘯锛氭妧鑳藉姞杞?+ 宸ュ叿璋冪敤锛坆ash / read锛?// 鐢ㄦ硶锛歯ode test-skills.js "浣犵殑闂"
const http = require("http");

const BRIDGE = "http://127.0.0.1:3987";
const prompt = process.argv[2] || "鐢?bash 杩愯 node -v锛屾妸鐗堟湰鍙峰憡璇夋垜";

function post(urlPath, obj) {
    return new Promise((resolve, reject) => {
        const data = Buffer.from(JSON.stringify(obj), "utf8");
        const req = http.request(BRIDGE + urlPath, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8", "Content-Length": data.length }
        }, (res) => {
            let b = "";
            res.on("data", (c) => b += c);
            res.on("end", () => { try { resolve(JSON.parse(b)); } catch (e) { resolve({ raw: b }); } });
        });
        req.on("error", reject);
        req.end(data);
    });
}

(async () => {
    const ctx = await post("/context", { docKey: (process.argv[3] || "skilltest") });
    console.log("[context]", JSON.stringify(ctx).slice(0, 120));

    const events = [];
    const req = http.get(BRIDGE + "/events", (res) => {
        res.setEncoding("utf8");
        let buf = "";
        res.on("data", (chunk) => {
            buf += chunk;
            for (;;) {
                const i = buf.indexOf("\n\n");
                if (i === -1) break;
                const raw = buf.slice(0, i).trim();
                buf = buf.slice(i + 2);
                if (!raw.startsWith("data:")) continue;
                let ev; try { ev = JSON.parse(raw.slice(5).trim()); } catch { continue; }
                if (ev.type === "tool") { console.log("  鈿?tool:", ev.name); events.push("tool:" + ev.name); }
                if (ev.type === "delta") process.stdout.write(ev.delta);
                if (ev.type === "done") { console.log("\n[done] events=" + events.join(",")); req.destroy(); process.exit(0); }
                if (ev.type === "error") { console.log("\n[error]", ev.error); req.destroy(); process.exit(1); }
            }
        });
    });
    setTimeout(() => { console.log("\n[timeout]"); process.exit(2); }, 180000);

    await new Promise((r) => setTimeout(r, 500));
    const p = await post("/prompt", { message: prompt, docKey: (process.argv[3] || "skilltest") });
    console.log("[prompt]", JSON.stringify(p), "\n---");
})();

