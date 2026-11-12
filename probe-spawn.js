const { spawn } = require("child_process");
const p = spawn("pi", ["--mode", "rpc", "--no-session", "--no-builtin-tools"], { shell: true, env: Object.assign({}, process.env) });
p.stdout.on("data", d => console.log("[out]", d.toString().slice(0, 200)));
p.stderr.on("data", d => console.log("[err]", d.toString().slice(0, 500)));
p.on("exit", (code, sig) => { console.log("EXIT code=" + code + " sig=" + sig); process.exit(0); });
p.on("error", e => { console.log("ERR " + e.message); process.exit(1); });
setTimeout(() => {
  console.log("still alive after 3s, pid=" + p.pid);
  p.stdin.write(JSON.stringify({ type: "prompt", message: "只回复两个字：在的" }) + "\n");
  setTimeout(() => { console.log("killing"); p.kill(); process.exit(0); }, 25000);
}, 3000);
