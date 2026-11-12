// P0-3: pi --mode rpc 最小客户端验证
const { spawn } = require("child_process");
const { StringDecoder } = require("string_decoder");

// --no-builtin-tools: 保留扩展工具但禁内置(bash/read/edit/write)，文档写入只走桥接层
const agent = spawn("pi", ["--mode", "rpc", "--no-session", "--no-builtin-tools"], { shell: true });

let text = "";
const t0 = Date.now();

function attachJsonlReader(stream, onLine) {
    const decoder = new StringDecoder("utf8");
    let buffer = "";
    stream.on("data", (chunk) => {
        buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);
        while (true) {
            const i = buffer.indexOf("\n");
            if (i === -1) break;
            let line = buffer.slice(0, i);
            buffer = buffer.slice(i + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (line.trim()) onLine(line);
        }
    });
    stream.on("end", () => {
        buffer += decoder.end();
        if (buffer.trim()) onLine(buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer);
    });
}

attachJsonlReader(agent.stdout, (line) => {
    let ev;
    try { ev = JSON.parse(line); } catch { return; }
    if (ev.type === "message_update" && ev.assistantMessageEvent) {
        const d = ev.assistantMessageEvent;
        if (d.type === "text_delta") { text += d.delta; process.stdout.write(d.delta); }
    } else if (ev.type === "agent_end") {
        console.log(`\n--- agent_end @ ${((Date.now() - t0) / 1000).toFixed(1)}s, 共 ${text.length} 字 ---`);
        agent.kill();
        process.exit(0);
    } else if (ev.type === "response" && ev.success === false) {
        console.error("RPC 错误:", ev.error);
        agent.kill();
        process.exit(1);
    }
});

agent.stderr.on("data", (c) => process.stderr.write("[pi stderr] " + c));
agent.on("error", (e) => { console.error("spawn 失败:", e.message); process.exit(1); });

agent.stdin.write(JSON.stringify({ id: "req-1", type: "prompt", message: "这是一次连通性测试。请只回复四个字：链路畅通。不要使用任何工具。" }) + "\n");
console.log("[client] prompt 已发送，等待流式回复...");

setTimeout(() => { console.error("[client] 60s 超时"); agent.kill(); process.exit(1); }, 60000);
