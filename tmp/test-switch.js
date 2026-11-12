// 会话切换端到端：造一条有内容的会话 → 新对话 → 列表 → 切回 → 校验历史
const BASE = "http://127.0.0.1:3987";
const K = "selftest3";
const short = (f) => (f ? String(f).split(/[\\/]/).pop().slice(-16) : "");

async function post(p, b) {
  const r = await fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b || {}) });
  return r.json();
}
const get = async (p) => (await fetch(BASE + p)).json();

function sseCollect(timeoutMs) {
  return new Promise((resolve) => {
    const ctrl = new AbortController();
    let buf = "";
    let text = "";
    const t = setTimeout(() => { ctrl.abort(); resolve(text); }, timeoutMs);
    fetch(BASE + "/events", { signal: ctrl.signal }).then(async (res) => {
      const rd = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop();
        for (const p of parts) {
          const line = p.replace(/^data: /, "");
          if (!line) continue;
          let ev;
          try { ev = JSON.parse(line); } catch { continue; }
          if (ev.type === "delta") text += ev.delta || "";
          if (ev.type === "done") { clearTimeout(t); ctrl.abort(); resolve(text); return; }
          if (ev.type === "error") { clearTimeout(t); ctrl.abort(); resolve("ERR:" + (ev.error || "")); return; }
        }
      }
    }).catch(() => {});
  });
}

(async () => {
  // 1. 新会话 A
  let j = await post("/new-chat", { docKey: K });
  const A = j.file;
  console.log("1 new-chat A:", short(A));

  // 2. 发一条消息让文件落盘
  const sse = sseCollect(120000);
  await new Promise((r) => setTimeout(r, 500));
  j = await post("/prompt", { docKey: K, message: "请只回复：会话A的第一条" });
  console.log("2 prompt:", j.ok);
  const txt = await sse;
  console.log("   reply:", String(txt).slice(0, 60).replace(/\n/g, " "));

  // 3. 新会话 B
  j = await post("/new-chat", { docKey: K });
  const B = j.file;
  console.log("3 new-chat B:", short(B));

  // 4. 列表
  j = await get("/sessions?docKey=" + encodeURIComponent(K));
  console.log("4 sessions:", j.sessions.length, j.sessions.map((s) => (s.current ? "*" : "") + (s.exists ? "" : "empty:") + short(s.file)).join(" | "));
  console.log("   titles:", j.sessions.map((s) => s.title).join(" | "));

  // 5. 切回 A
  j = await post("/switch-session", { docKey: K, file: A });
  console.log("5 switch A:", j.ok, "msgs=", (j.messages || []).length, JSON.stringify((j.messages || []).map((m) => m.role)));

  // 6. 列表确认 current 变 A
  j = await get("/sessions?docKey=" + encodeURIComponent(K));
  console.log("6 current is A:", j.sessions.find((s) => s.current) && short(j.sessions.find((s) => s.current).file) === short(A));

  // 7. 清理
  j = await post("/migrate", { from: K, to: "trash-" + Date.now() });
  console.log("7 cleanup:", j.ok, j.moved);
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
