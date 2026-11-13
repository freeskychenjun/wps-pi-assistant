// bridge.js — pi-assistant 桥接进程（P2：会话持久化 + 每文档独立 session）
// 职责：HTTP/SSE 服务 + pi rpc 子进程管理 + 配置→启动参数 + 文档↔session 映射
// API：
//   GET  /health   → {ok, piRunning, model, provider, lastError, currentDoc}
//   GET  /events   → SSE：{type:"status"|"delta"|"done"|"error"|"history", ...}
//   POST /config   → {provider?, model?, apiKey?} 重启 pi（清空当前文档绑定）
//   POST /context  → {docKey} 切到该文档的 session，返回历史 [{role,text}]
//   POST /prompt   → {message, docKey} 切 session 后发消息
//   POST /stop     → 中止当前流
//   POST /pane     → {docKey} 任务窗格心跳（登记「这个文档现在有活面板」）
//   POST /docreq   → {req} agent 通过 pi-doc-tools.js 请求读文档，桥接转给面板并等结果
//   POST /docresult→ {id, ok, text, error} 面板回传读取结果
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { spawn, execSync } = require("child_process");
const { StringDecoder } = require("string_decoder");

const PORT = 3987;
const PROMPT_FILE = path.join(__dirname, "doc-assistant-prompt.md");
const SESS_DIR = path.join(__dirname, "sessions");
const MAP_FILE = path.join(__dirname, "sessions-map.json");
const TOOL_LOG = path.join(__dirname, "tool-log.json");   // 每个会话的工具调用记录 {会话文件: [{i: 第几条回复, tools: [...]}]}
const CFG_FILE = path.join(__dirname, "bridge-config.json");   // 配置持久化（重启桥接不用再等面板重发）
const SKILLS_DIR = path.join(process.env.USERPROFILE || "C:\\Users\\Administrator", ".claude", "skills");
// 允许 agent 使用的工具：只读文件系统 + 执行命令，不含 write/edit（改文档一律走 wps-* 指令块）
// doc_info/doc_read/doc_find 来自 -e pi-doc-tools.js，必须列在这里，否则会被白名单挡掉
const TOOL_ALLOW = "read,bash,ls,find,grep,doc_info,doc_read,doc_find";
const DOC_TOOLS_EXT = path.join(__dirname, "pi-doc-tools.js");

let piProc = null;
let sseClients = [];
let fullText = "";
let currentModel = null;
let currentProvider = null;
let lastError = null;
let currentDocKey = null;      // 当前 pi session 绑定的文档
let turnDocKey = null;         // 本轮 prompt 属于哪个文档（SSE 事件带出去，供多文档隔离）
let lastCfg = {};              // 记住配置，自动重启时用
let currentSessionFile = null; // 当前 pi 会话文件（工具调用记录按它归档）
let turnTools = [];            // 本轮 prompt 里调用过的工具名
let assistantIdx = 0;          // 当前会话里已有多少条 assistant 回复（= 本轮回复的序号）
let reqSeq = 0;
const pending = new Map();     // rpc 请求 id → {resolve, timer}

try { fs.mkdirSync(SESS_DIR, { recursive: true }); } catch {}

function loadCfg() {
    try { return JSON.parse(fs.readFileSync(CFG_FILE, "utf8")); } catch { return {}; }
}
function saveCfg(cfg) {
    try { fs.writeFileSync(CFG_FILE, JSON.stringify(cfg || {}, null, 2), "utf8"); } catch {}
}
lastCfg = loadCfg();

function loadMap() {
    try { return JSON.parse(fs.readFileSync(MAP_FILE, "utf8")); } catch { return {}; }
}
function saveMap(m) {
    try { fs.writeFileSync(MAP_FILE, JSON.stringify(m, null, 2), "utf8"); } catch {}
}

// ---------- 工具调用记录（历史里显示「⚙ bash、read」用） ----------
let toolLog = {};
try { toolLog = JSON.parse(fs.readFileSync(TOOL_LOG, "utf8")); } catch { toolLog = {}; }
function saveToolLog() {
    try { fs.writeFileSync(TOOL_LOG, JSON.stringify(toolLog, null, 2), "utf8"); } catch {}
}
function toolsForSession(file) {
    return (file && toolLog[file]) ? toolLog[file] : [];
}
// 一轮回复结束：把本轮用到的工具挂到「第几条回复」上
function recordTurnTools(hadText) {
    const tools = turnTools.slice(0);
    turnTools = [];
    if (currentSessionFile && tools.length) {
        const arr = toolLog[currentSessionFile] || (toolLog[currentSessionFile] = []);
        arr.push({ i: assistantIdx, tools: tools });
        saveToolLog();
    }
    if (hadText) assistantIdx++;
}
// 切会话后重置计数（assistantIdx = 已有回复条数）
async function setSessionCtx(file) {
    currentSessionFile = file || null;
    turnTools = [];
    assistantIdx = 0;
    if (!file) return;
    try {
        const msgs = await historyFor();
        assistantIdx = msgs.filter((m) => m.role === "assistant").length;
    } catch {}
}

// ---------- 旧会话清理 ----------
// 规则：每个文档最多留 keepPerDoc 条（当前那条永远保留），且超过 days 天的自动清掉
function pruneSessions(opts) {
    const o = opts || {};
    const days = Number(o.days) > 0 ? Number(o.days) : 30;
    const keepPerDoc = Number(o.keepPerDoc) >= 0 ? Number(o.keepPerDoc) : 20;
    const dryRun = !!o.dryRun;
    const map = loadMap();
    const now = Date.now();
    const keep = new Set();
    for (const k of Object.keys(map)) {
        const e = docEntry(map, k);
        if (e.current) keep.add(e.current);
    }
    const doomed = new Set();
    for (const k of Object.keys(map)) {
        const e = docEntry(map, k);
        const items = e.list.map((f) => {
            let t = 0;
            try { t = fs.statSync(f).mtimeMs; } catch {}
            return { f: f, t: t };
        });
        items.sort((a, b) => b.t - a.t);
        items.forEach((it, idx) => {
            if (keep.has(it.f)) return;
            const tooOld = it.t > 0 && (now - it.t) > days * 86400000;
            const tooMany = idx >= keepPerDoc;
            const missing = it.t === 0;   // 文件已经不在了，顺手从列表里摘掉
            if (tooOld || tooMany || missing) doomed.add(it.f);
        });
    }
    let deleted = 0;
    let freed = 0;
    if (!dryRun) {
        for (const f of doomed) {
            let sz = 0;
            try { sz = fs.statSync(f).size; } catch {}
            try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
            deleted++;
            freed += sz;
            if (toolLog[f]) delete toolLog[f];
        }
        for (const k of Object.keys(map)) {
            const e = docEntry(map, k);
            e.list = e.list.filter((f) => !doomed.has(f));
            if (e.current && doomed.has(e.current)) e.current = e.list[0] || null;
            if (e.list.length || e.current) setDocEntry(map, k, e);
            else delete map[k];
        }
        saveMap(map);
        saveToolLog();
    }
    return {
        ok: true, dryRun: dryRun, days: days, keepPerDoc: keepPerDoc,
        candidates: doomed.size, deleted: deleted, freedKB: Math.round(freed / 1024)
    };
}

// 映射表统一成 { docKey: { current: "会话文件", list: ["会话文件", ...] } }
// 兼容早期的扁平格式 { docKey: "会话文件" }
function docEntry(map, docKey) {
    let e = map[docKey];
    if (!e) return { current: null, list: [] };
    if (typeof e === "string") return { current: e, list: [e] };
    const cur = e.current || null;
    let list = Array.isArray(e.list) ? e.list.slice(0) : [];
    if (cur && list.indexOf(cur) < 0) list.unshift(cur);
    return { current: cur, list: list };
}
function setDocEntry(map, docKey, entry) {
    map[docKey] = { current: entry.current || null, list: entry.list || [] };
}

// 从会话文件里取标题（第一条用户需求）与更新时间
function sessionMeta(file) {
    let title = "(空会话)";
    let updatedAt = 0;
    try { updatedAt = fs.statSync(file).mtimeMs; } catch {}
    try {
        const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
        for (const ln of lines) {
            if (!ln.trim()) continue;
            let o;
            try { o = JSON.parse(ln); } catch { continue; }
            if (o.type !== "message" || !o.message || o.message.role !== "user") continue;
            let txt = "";
            const c = o.message.content;
            if (typeof c === "string") txt = c;
            else if (Array.isArray(c)) txt = c.filter((x) => x && x.type === "text").map((x) => x.text).join("\n");
            const i = txt.indexOf("【用户需求】");
            if (i >= 0) txt = txt.slice(i + 6);
            txt = txt.replace(/\s+/g, " ").trim();
            if (txt) { title = txt.slice(0, 40); break; }
        }
    } catch {}
    return { title: title, updatedAt: updatedAt };
}

// 列出某文档的全部会话（当前会话排最前）
function listDocSessions(docKey) {
    const map = loadMap();
    const e = docEntry(map, docKey);
    const out = [];
    for (const f of e.list) {
        // 刚 new_session 出来的会话文件要等第一条消息才落盘，这里照样列出来（exists=false 供前端置灰）
        const exists = fs.existsSync(f);
        const m = exists ? sessionMeta(f) : { title: "(空对话)", updatedAt: 0 };
        out.push({ file: f, title: m.title, updatedAt: m.updatedAt, current: f === e.current, exists: exists });
    }
    out.sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0) || b.updatedAt - a.updatedAt);
    return out;
}

function broadcast(obj) {
    const line = "data: " + JSON.stringify(obj) + "\n\n";
    sseClients = sseClients.filter((c) => {
        try { c.res.write(line); return true; } catch { return false; }
    });
}

// ---------- 文档读取：agent 工具 → 面板（WPS JSAPI） → 回传 ----------
// 面板每 5 秒 POST /pane 报一次 docKey，这里记住「哪些文档现在有活面板」
const paneDocs = new Map();       // docKey → 最近心跳时间
const docReadPending = new Map(); // 请求 id → {resolve, timer}
const DOC_READ_TIMEOUT = 25000;   // 面板读一次文档最多等多久

function paneAlive(docKey) {
    const t = paneDocs.get(docKey);
    return !!t && Date.now() - t < 60000;
}

// 把一次读取请求转给对应文档的面板，等面板回传（或超时）
function requestDoc(req) {
    return new Promise((resolve) => {
        const docKey = req.docKey || turnDocKey || currentDocKey || "";
        if (!docKey) {
            return resolve({ ok: false, error: "还不知道当前是哪个文档：请先让用户发一条消息（面板会带上文档路径）。" });
        }
        if (!paneAlive(docKey)) {
            return resolve({
                ok: false,
                error: "这份文档的任务窗格没有连着桥接（docKey=" + docKey + "）。请让用户确认 WPS 里这份文档右侧的 AI 面板是打开的。"
            });
        }
        const id = "d" + ++reqSeq;
        const timer = setTimeout(() => {
            docReadPending.delete(id);
            resolve({ ok: false, error: "任务窗格 " + Math.round(DOC_READ_TIMEOUT / 1000) + " 秒内没有回话（WPS 可能正忙或弹了对话框）。" });
        }, DOC_READ_TIMEOUT);
        docReadPending.set(id, { resolve, timer });
        broadcast({ type: "docreq", id: id, docKey: docKey, req: req });
    });
}

// Windows 下 shell:true 会多一层 cmd.exe，必须按进程树杀，否则 pi 变孤儿继续输出
function killPi() {
    if (!piProc) return;
    const proc = piProc;
    piProc = null;
    currentDocKey = null;
    for (const [, p] of pending) { clearTimeout(p.timer); p.resolve(null); }
    pending.clear();
    for (const [, p] of docReadPending) { clearTimeout(p.timer); p.resolve({ ok: false, error: "pi 正在重启，读取中断。" }); }
    docReadPending.clear();
    try {
        if (process.platform === "win32") {
            execSync("taskkill /PID " + proc.pid + " /T /F", { stdio: "ignore" });
        } else {
            proc.kill("SIGKILL");
        }
    } catch {
        try { proc.kill(); } catch {}
    }
}

function attachJsonl(stream, onLine) {
    const decoder = new StringDecoder("utf8");
    let buffer = "";
    stream.on("data", (chunk) => {
        buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);
        for (;;) {
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

// 发命令并等对应 response（id 关联），超时返回 null
function rpc(cmd, timeoutMs) {
    return new Promise((resolve) => {
        if (!piProc) return resolve(null);
        const id = "b" + ++reqSeq;
        const timer = setTimeout(() => { pending.delete(id); resolve(null); }, timeoutMs || 20000);
        pending.set(id, { resolve, timer });
        try {
            piProc.stdin.write(JSON.stringify(Object.assign({ id }, cmd)) + "\n");
        } catch (e) {
            clearTimeout(timer); pending.delete(id); resolve(null);
        }
    });
}

function buildArgs(cfg) {
    const args = [
        "--mode", "rpc",
        "--no-extensions",        // 去掉 coding agent 的插件噪声
        "-e", DOC_TOOLS_EXT,      // 显式加载本地扩展：doc_info/doc_read/doc_find（只读文档）
        "--skill", SKILLS_DIR,    // 加载 DSH/Claude 技能目录（改文档仍只走 wps-* 指令）
        "--tools", TOOL_ALLOW,    // 只开只读 + 执行类工具，不开 write/edit
        "--no-prompt-templates",
        "--no-themes",
        "--no-context-files",     // 不读 AGENTS.md/CLAUDE.md
        "--system-prompt", PROMPT_FILE,
        "--session-dir", SESS_DIR
    ];
    if (cfg.provider) args.push("--provider", cfg.provider);
    if (cfg.model) args.push("--model", cfg.model);
    return args;
}

function startPi(cfg) {
    cfg = cfg || {};
    lastCfg = cfg;
    if (cfg.provider || cfg.model || cfg.apiKey) saveCfg(cfg);
    killPi();
    fullText = "";
    lastError = null;
    currentModel = cfg.model || null;
    currentProvider = cfg.provider || null;

    const env = Object.assign({}, process.env);
    if (cfg.apiKey) {
        const keyMap = {
            anthropic: "ANTHROPIC_API_KEY",
            openai: "OPENAI_API_KEY",
            google: "GEMINI_API_KEY",
            "google-vertex": "GEMINI_API_KEY",
            "openai-compatible": "OPENAI_API_KEY",
            deepseek: "DEEPSEEK_API_KEY"
        };
        const k = keyMap[cfg.provider];
        if (k) env[k] = cfg.apiKey;
        else env.PI_API_KEY = cfg.apiKey;
    }

    const proc = spawn("pi", buildArgs(cfg), { shell: true, env, cwd: __dirname });
    piProc = proc;

    broadcast({ type: "status", text: "pi 启动中 " + (cfg.model || "(默认模型)") });

    attachJsonl(proc.stdout, (line) => {
        let ev;
        try { ev = JSON.parse(line); } catch { return; }
        if (ev.type === "response" && ev.id && pending.has(ev.id)) {
            const p = pending.get(ev.id);
            pending.delete(ev.id);
            clearTimeout(p.timer);
            return p.resolve(ev);
        }
        if (ev.type === "message_start" && ev.message && ev.message.role === "assistant") {
            // 工具循环里会有多条 assistant 消息：只保留最后一条的文本，避免多轮文本串在一起
            fullText = "";
        } else if (ev.type === "message_update" && ev.assistantMessageEvent && ev.assistantMessageEvent.type === "text_delta") {
            fullText += ev.assistantMessageEvent.delta;
            broadcast({ type: "delta", delta: ev.assistantMessageEvent.delta, docKey: turnDocKey });
        } else if (ev.type === "tool_execution_start") {
            if (ev.toolName) turnTools.push(ev.toolName);
            broadcast({ type: "tool", name: ev.toolName, docKey: turnDocKey });
        } else if (ev.type === "agent_end") {
            recordTurnTools(!!(fullText && fullText.trim()));
            broadcast({ type: "done", text: fullText, docKey: turnDocKey });
            fullText = "";
        } else if (ev.type === "response" && ev.success === false && !ev.id) {
            lastError = ev.error || "未知错误";
            broadcast({ type: "error", error: lastError, docKey: turnDocKey });
        } else if (ev.type === "auto_retry_end" && ev.success === false) {
            lastError = ev.finalError || "重试失败";
            broadcast({ type: "error", error: lastError, docKey: turnDocKey });
        }
    });

    proc.stderr.on("data", (c) => process.stderr.write("[pi] " + c));

    proc.on("exit", (code) => {
        if (piProc === proc) {
            piProc = null;
            currentDocKey = null;
            broadcast({ type: "status", text: "pi 进程退出 (code=" + code + ")" + (lastError ? " 错误: " + lastError : "") });
        }
    });
    proc.on("error", (e) => {
        lastError = e.message;
        broadcast({ type: "error", error: "启动 pi 失败: " + e.message });
    });

    return proc;
}

async function ensurePi() {
    if (piProc) return true;
    startPi(lastCfg);
    // 用 get_state 探活（pi 就绪后可响应）
    for (let i = 0; i < 20; i++) {
        const r = await rpc({ type: "get_state" }, 3000);
        if (r && r.success) return true;
        await new Promise((res) => setTimeout(res, 500));
    }
    return false;
}

// 切到指定文档的 session（无则新建），并把历史消息返回给前端
async function useDocSession(docKey) {
    docKey = docKey || "untitled";
    if (currentDocKey === docKey) return null;
    const map = loadMap();
    const e = docEntry(map, docKey);
    if (e.current && fs.existsSync(e.current)) {
        const r = await rpc({ type: "switch_session", sessionPath: e.current });
        if (r && r.success && !(r.data && r.data.cancelled)) {
            currentDocKey = docKey;
            await setSessionCtx(e.current);
            return null;
        }
    }
    const nr = await rpc({ type: "new_session" });
    if (!nr || !nr.success) return "切换会话失败";
    const st = await rpc({ type: "get_state" });
    const file = st && st.data && st.data.sessionFile;
    if (file) {
        const m = loadMap();
        const ne = docEntry(m, docKey);
        ne.current = file;
        if (ne.list.indexOf(file) < 0) ne.list.unshift(file);
        setDocEntry(m, docKey, ne);
        saveMap(m);
    }
    currentDocKey = docKey;
    await setSessionCtx(file);
    return null;
}

async function historyFor() {
    const r = await rpc({ type: "get_messages" });
    const msgs = (r && r.data && r.data.messages) || [];
    const out = [];
    for (const m of msgs) {
        if (m.role !== "user" && m.role !== "assistant") continue;
        let text = "";
        if (typeof m.content === "string") text = m.content;
        else if (Array.isArray(m.content)) {
            text = m.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
        }
        if (!text.trim()) continue;
        // 用户消息去掉自动附带的大段上下文，只留需求部分
        if (m.role === "user") {
            const i = text.indexOf("【用户需求】");
            if (i >= 0) text = text.slice(i + 6).trim();
        }
        out.push({ role: m.role, text: text.slice(0, 4000) });
    }
    return out;
}

// ---------- 静态文件托管（加载项 UI） ----------
const ADDIN_DIR = path.join(__dirname, "pi-assistant");
const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".ico": "image/x-icon",
    ".xml": "text/xml; charset=utf-8"
};

// ---------- 技能清单（侧栏斜杠命令用） ----------
let skillsCache = { at: 0, list: [] };

function readSkillMeta(dir) {
    let txt = "";
    try { txt = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8"); } catch { return null; }
    const fm = txt.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
    const head = fm ? fm[1] : "";
    const pick = (k) => {
        const m = head.match(new RegExp("^" + k + ":\\s*(.*)$", "m"));
        if (!m) return "";
        let v = m[1].trim();
        // YAML 块标量（description: > / |）——取后续缩进行拼成一句
        if (/^[>|][+-]?$/.test(v)) {
            const idx = head.indexOf(m[0]) + m[0].length;
            const lines = [];
            for (const ln of head.slice(idx).split(/\r?\n/)) {
                if (!ln.trim()) { lines.push(""); continue; }
                if (/^\s+\S/.test(ln)) lines.push(ln.trim());
                else break;
            }
            v = lines.join(" ").trim();
        }
        return v.replace(/^["']|["']$/g, "");
    };
    const name = path.basename(dir);
    let desc = pick("description").replace(/\s+/g, " ").slice(0, 200);
    if (!desc) {
        // frontmatter 里没有 description 时，退而取正文第一句
        const body = fm ? txt.slice(txt.indexOf(fm[0]) + fm[0].length) : txt;
        const line = body.split(/\r?\n/).map((s) => s.trim()).find((s) => s && !s.startsWith("#"));
        desc = (line || "").slice(0, 200);
    }
    return { name: name, description: desc };
}

function listSkills(force) {
    const now = Date.now();
    if (!force && skillsCache.list.length && now - skillsCache.at < 60000) return skillsCache.list;
    const out = [];
    try {
        for (const d of fs.readdirSync(SKILLS_DIR)) {
            const full = path.join(SKILLS_DIR, d);
            try { if (!fs.statSync(full).isDirectory()) continue; } catch { continue; }
            const m = readSkillMeta(full);
            if (m) out.push(m);
        }
    } catch (e) {}
    out.sort((a, b) => a.name.localeCompare(b.name));
    skillsCache = { at: now, list: out };
    return out;
}

function serveAddin(req, res) {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/" || p === "/addin" || p === "/addin/") p = "/addin/index.html";
    if (p.startsWith("/addin/")) p = p.slice("/addin".length);
    // /.debugTemp/* 是 wpsjs debug 专供的调试 SDK，生产模式不需要：返回空脚本避免 404
    if (p.startsWith("/.debugTemp/")) {
        res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
        return res.end("// debug sdk stub\n");
    }
    const full = path.normalize(path.join(ADDIN_DIR, p));
    if (!full.startsWith(ADDIN_DIR)) { res.writeHead(403); return res.end("forbidden"); }
    fs.readFile(full, (err, buf) => {
        if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("not found: " + p); }
        res.writeHead(200, {
            "Content-Type": MIME[path.extname(full).toLowerCase()] || "application/octet-stream",
            "Cache-Control": "no-cache, no-store, must-revalidate"
        });
        res.end(buf);
    });
}

const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

    // 静态托管插件目录：生产模式下 WPS 直接从本进程加载加载项，不再依赖 vite dev server
    if (req.method === "GET" && (req.url === "/" || req.url.startsWith("/addin") || req.url.startsWith("/.debugTemp"))) {
        return serveAddin(req, res);
    }

    if (req.url === "/events") {
        res.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*"
        });
        const client = { res };
        sseClients.push(client);
        res.write("data: " + JSON.stringify({
            type: "status",
            text: piProc ? "已连接（pi 运行中）" : "已连接（pi 未启动）",
            piRunning: !!piProc,
            model: currentModel
        }) + "\n\n");
        req.on("close", () => { sseClients = sseClients.filter((c) => c !== client); });
        return;
    }

    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", async () => {
        let data = {};
        try { data = body ? JSON.parse(body) : {}; } catch {}
        const json = (code, obj) => {
            res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify(obj));
        };
        try {
            if (req.url === "/log" && req.method === "POST") {
                try {
                    fs.appendFileSync(path.join(__dirname, "debug.log"),
                        "[" + new Date().toISOString() + "] " + (data.text || "") + "\n", "utf8");
                } catch {}
                return json(200, { ok: true });
            }
            if (req.url === "/health") {
                return json(200, { ok: true, piRunning: !!piProc, model: currentModel, provider: currentProvider, lastError, currentDoc: currentDocKey });
            }
            if (req.url === "/doclog" && req.method === "POST") {
                // 面板上报当前 docKey，方便排查「会话串了/丢了」类问题
                try {
                    fs.appendFileSync(path.join(__dirname, "debug.log"),
                        "[" + new Date().toISOString() + "] docKey=" + (data.docKey || "") + "\n", "utf8");
                } catch {}
                return json(200, { ok: true });
            }
            // 面板心跳：登记「这份文档现在有活面板」，agent 读文档时用来定位
            if (req.url === "/pane" && req.method === "POST") {
                const k = data.docKey || "";
                if (k) {
                    const now = Date.now();
                    paneDocs.set(k, now);
                    for (const [key, t] of paneDocs) if (now - t > 600000) paneDocs.delete(key);
                }
                return json(200, { ok: true });
            }
            // agent 工具（pi-doc-tools.js）请求读文档：转给面板并等回传
            if (req.url === "/docreq" && req.method === "POST") {
                const reqObj = data.req || {};
                const r = await requestDoc(reqObj);
                try {
                    fs.appendFileSync(path.join(__dirname, "debug.log"),
                        "[" + new Date().toISOString() + "] docreq kind=" + (reqObj.kind || "")
                        + " what=" + (reqObj.what || "") + " ok=" + (r.ok !== false)
                        + " chars=" + ((r.text || "").length)
                        + (r.error ? " error=" + r.error : "") + "\n", "utf8");
                } catch {}
                return json(200, { ok: r.ok !== false, text: r.text || "", error: r.error || "" });
            }
            // 面板回传读取结果：唤醒等着的工具调用
            if (req.url === "/docresult" && req.method === "POST") {
                const p = docReadPending.get(data.id);
                if (p) { clearTimeout(p.timer); docReadPending.delete(data.id); p.resolve(data); }
                return json(200, { ok: true });
            }
            if (req.url === "/skills") {                const list = listSkills(req.url.indexOf("force=1") >= 0);
                return json(200, { ok: true, count: list.length, skills: list });
            }
            if (req.url === "/config" && req.method === "POST") {
                startPi(data);
                return json(200, { ok: true });
            }
            if (req.url === "/context" && req.method === "POST") {
                if (data.docKey && data.docKey !== currentDocKey) {
                    try {
                        fs.appendFileSync(path.join(__dirname, "debug.log"),
                            "[" + new Date().toISOString() + "] docKey=" + data.docKey + "\n", "utf8");
                    } catch {}
                }
                const ok = await ensurePi();
                if (!ok) return json(503, { ok: false, error: "pi 启动失败" });
                const err = await useDocSession(data.docKey);
                if (err) return json(500, { ok: false, error: err });
                const msgs = await historyFor();
                return json(200, { ok: true, messages: msgs, tools: toolsForSession(currentSessionFile) });
            }
            // 该文档另起一条新会话（旧会话保留在列表里）
            if (req.url === "/new-chat" && req.method === "POST") {
                const ok = await ensurePi();
                if (!ok) return json(503, { ok: false, error: "pi 启动失败" });
                const docKey = data.docKey || "untitled";
                const nr = await rpc({ type: "new_session" });
                if (!nr || !nr.success) return json(500, { ok: false, error: "新建会话失败" });
                const st = await rpc({ type: "get_state" });
                const file = st && st.data && st.data.sessionFile;
                if (file) {
                    const m = loadMap();
                    const e = docEntry(m, docKey);
                    e.current = file;
                    if (e.list.indexOf(file) < 0) e.list.unshift(file);
                    setDocEntry(m, docKey, e);
                    saveMap(m);
                }
                currentDocKey = docKey;
                await setSessionCtx(file);
                return json(200, { ok: true, file: file });
            }
            // 列出该文档的全部历史会话
            if (req.url.startsWith("/sessions") && req.method === "GET") {
                const q = new URL("http://x" + req.url).searchParams;
                const docKey = q.get("docKey") || "untitled";
                return json(200, { ok: true, sessions: listDocSessions(docKey) });
            }
            // 切到该文档的某条历史会话
            if (req.url === "/switch-session" && req.method === "POST") {
                const ok = await ensurePi();
                if (!ok) return json(503, { ok: false, error: "pi 启动失败" });
                const docKey = data.docKey || "untitled";
                const file = data.file;
                if (!file || !fs.existsSync(file)) return json(400, { ok: false, error: "会话文件不存在" });
                const r = await rpc({ type: "switch_session", sessionPath: file });
                if (!r || !r.success) return json(500, { ok: false, error: "切换失败" });
                const m = loadMap();
                const e = docEntry(m, docKey);
                e.current = file;
                if (e.list.indexOf(file) < 0) e.list.unshift(file);
                setDocEntry(m, docKey, e);
                saveMap(m);
                currentDocKey = docKey;
                await setSessionCtx(file);
                const msgs = await historyFor();
                return json(200, { ok: true, messages: msgs, tools: toolsForSession(currentSessionFile) });
            }
            // 文档从「未保存」变成「已保存」时迁移会话：把旧 docKey 的会话挂到新路径上
            if (req.url === "/migrate" && req.method === "POST") {
                const from = data.from || "";
                const to = data.to || "";
                if (!from || !to) return json(400, { ok: false, error: "参数不全" });
                const m = loadMap();
                const fe = docEntry(m, from);
                const te = docEntry(m, to);
                for (const f of fe.list) if (te.list.indexOf(f) < 0) te.list.unshift(f);
                if (fe.current) te.current = fe.current;
                if (!te.list.length) return json(200, { ok: true, moved: 0 });
                setDocEntry(m, to, te);
                delete m[from];
                saveMap(m);
                if (currentDocKey === from) currentDocKey = to;
                return json(200, { ok: true, moved: te.list.length });
            }
            if (req.url === "/prompt" && req.method === "POST") {
                const ok = await ensurePi();
                if (!ok) {
                    broadcast({ type: "error", error: "pi 启动失败，请检查 pi 是否可用" });
                    return json(500, { ok: false });
                }
                const err = await useDocSession(data.docKey);
                if (err) {
                    broadcast({ type: "error", error: err });
                    return json(500, { ok: false });
                }
                fullText = "";
                turnDocKey = data.docKey || null;
                const promptMsg = data.message || "";
                try {
                    fs.appendFileSync(path.join(__dirname, "debug.log"),
                        "[" + new Date().toISOString() + "] prompt docKey=" + (turnDocKey || "")
                        + " chars=" + promptMsg.length
                        + " ctx=" + (promptMsg.indexOf("【当前文档】") >= 0 ? "yes" : "no") + "\n", "utf8");
                } catch {}
                try {
                    piProc.stdin.write(JSON.stringify({ type: "prompt", message: promptMsg }) + "\n");
                } catch (e) {
                    broadcast({ type: "error", error: "发送失败: " + e.message, docKey: turnDocKey });
                    return json(500, { ok: false });
                }
                return json(200, { ok: true });
            }
            if (req.url === "/stop" && req.method === "POST") {
                if (piProc) {
                    try { piProc.stdin.write(JSON.stringify({ type: "abort" }) + "\n"); } catch {}
                }
                return json(200, { ok: true });
            }
            if (req.url === "/prune" && req.method === "POST") {
                const pr = pruneSessions(data);
                try {
                    fs.appendFileSync(path.join(__dirname, "debug.log"),
                        "[" + new Date().toISOString() + "] prune dryRun=" + !!data.dryRun
                        + " candidates=" + pr.candidates + " deleted=" + pr.deleted + "\n");
                } catch {}
                return json(200, pr);
            }
            if (req.url === "/shutdown" && req.method === "POST") {
                killPi();
                json(200, { ok: true });
                setTimeout(() => process.exit(0), 200);
                return;
            }
            res.writeHead(404); res.end();
        } catch (e) {
            try { json(500, { ok: false, error: e.message }); } catch {}
        }
    });
});

server.listen(PORT, "127.0.0.1", () => {
    console.log("bridge listening on 127.0.0.1:" + PORT);
    // 启动时先「演练」一次清理，把可清理的数量写进 debug.log（不自动删，等用户在面板里点）
    try {
        const dry = pruneSessions({ days: 30, keepPerDoc: 20, dryRun: true });
        fs.appendFileSync(path.join(__dirname, "debug.log"),
            "[" + new Date().toISOString() + "] prune-dryrun candidates=" + dry.candidates + "\n", "utf8");
    } catch {}
    // 配置已持久化：桥接重启后直接拉起 pi，不用等面板重新发 /config
    if (lastCfg && (lastCfg.model || lastCfg.provider)) {
        console.log("[bridge] auto-start pi: " + (lastCfg.provider || "") + "/" + (lastCfg.model || ""));
        startPi(lastCfg);
    }
});
