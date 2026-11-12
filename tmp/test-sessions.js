// 会话管理接口自测：/new-chat /sessions /switch-session /migrate
const BASE = "http://127.0.0.1:3987";

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return r.json();
}
async function get(path) {
  const r = await fetch(BASE + path);
  return r.json();
}
const short = (f) => (f ? String(f).split(/[\\/]/).pop() : "");

(async () => {
  const K = "selftest2";

  let j = await post("/new-chat", { docKey: K });
  console.log("1 new-chat:", j.ok, short(j.file));
  const a = j.file;

  j = await post("/new-chat", { docKey: K });
  console.log("2 new-chat:", j.ok, short(j.file));
  const b = j.file;

  j = await get("/sessions?docKey=" + encodeURIComponent(K));
  console.log("3 sessions:", j.sessions.length, j.sessions.map((s) => (s.current ? "*" : "") + short(s.file)).join(", "));

  j = await post("/switch-session", { docKey: K, file: a });
  console.log("4 switch to A:", j.ok, "msgs=", (j.messages || []).length);

  j = await get("/sessions?docKey=" + encodeURIComponent(K));
  console.log("5 sessions after switch:", j.sessions.map((s) => (s.current ? "*" : "") + short(s.file)).join(", "));

  j = await post("/migrate", { from: K, to: K + "-moved" });
  console.log("6 migrate:", j.ok, "count=", j.count);

  j = await get("/sessions?docKey=" + encodeURIComponent(K));
  console.log("7 old key sessions:", j.sessions.length);
  j = await get("/sessions?docKey=" + encodeURIComponent(K + "-moved"));
  console.log("8 new key sessions:", j.sessions.length, j.sessions.map((s) => (s.current ? "*" : "") + short(s.file)).join(", "));

  // 清理测试键
  j = await post("/migrate", { from: K + "-moved", to: "trash-" + Date.now() });
  console.log("9 cleanup:", j.ok);
})().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
