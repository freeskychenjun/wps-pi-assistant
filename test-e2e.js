// E2E 测试客户端：向桥接发中文 prompt（Node 天然 UTF-8），观察 SSE 事件
const http = require("http");

function post(path, obj) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(obj), "utf8");
    const req = http.request({
      host: "127.0.0.1", port: 3987, path, method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Length": body.length }
    }, (res) => {
      let out = "";
      res.on("data", c => out += c);
      res.on("end", () => resolve(out));
    });
    req.on("error", reject);
    req.write(body); req.end();
  });
}

function sse() {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port: 3987, path: "/events" }, (res) => {
      let buf = "";
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const raw = buf.slice(0, i); buf = buf.slice(i + 2);
          if (!raw.startsWith("data: ")) continue;
          let d; try { d = JSON.parse(raw.slice(6)); } catch { continue; }
          if (d.type === "delta") { text += d.delta; process.stdout.write(d.delta); }
          else if (d.type === "done") {
            console.log("\n\n=== done，共 " + (d.text || "").length + " 字 ===");
            console.log("--- 原文 ---\n" + (d.text || ""));
            const m = (d.text || "").match(/```wps-edits\s*([\s\S]*?)```/);
            console.log("--- wps-edits 块 ---\n" + (m ? m[1].trim() : "(未找到)"));
            res.destroy(); req.destroy(); resolve();
          }
          else if (d.type === "error") { console.error("\n[错误] " + d.error); res.destroy(); req.destroy(); resolve(); }
          else if (d.type === "status") console.log("[状态] " + d.text);
        }
      });
    });
    req.on("error", (e) => { console.error("SSE 连接失败: " + e.message); resolve(); });
  });
}

(async () => {
  const prompt = process.argv[2] || "文档第一段的文字是「[AI改写]」。请把它改成「AI 助手已接入 WPS」，并给出编辑指令。";
  console.log("[config] 启动 pi（默认模型）…");
  console.log(await post("/config", { noTools: true }));
  const evPromise = sse();
  await new Promise(r => setTimeout(r, 600));   // 等 SSE 连上
  console.log("[prompt] " + prompt);
  console.log(await post("/prompt", { message: prompt }));
  await evPromise;
  process.exit(0);
})();
