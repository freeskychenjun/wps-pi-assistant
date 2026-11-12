// pi-assistant P1：聊天面板 + 文档上下文 + wps-edits 修订执行
var BRIDGE = "http://127.0.0.1:3987";
var MAX_CTX = 6000;      // 附带上下文最大字符数（防爆 context）

function $(id) { return document.getElementById(id); }

function addMsg(cls, text) {
    var h = $("emptyHint");
    if (h && h.style.display !== "none") h.style.display = "none";
    var d = document.createElement("div");
    d.className = "msg " + cls;
    d.textContent = text;
    var box = $("chatBox");
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
    return d;
}

// 输入框随内容长高（上限由 CSS max-height 控制）
function autoGrow(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 132) + "px";
}

// 输入框变化：自动长高 + 斜杠命令面板
function onInputChange(el) {
    autoGrow(el);
    renderCmdMenu();
}

// ---------- 斜杠命令（技能直调） ----------
var SKILLS = null;        // [{name, description}]
var cmdItems = [];        // 当前面板里的条目
var cmdSel = 0;           // 当前高亮项

function escHtml(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function loadSkills(cb) {
    if (SKILLS) { cb(SKILLS); return; }
    fetch(BRIDGE + "/skills")
        .then(function (r) { return r.json(); })
        .then(function (j) { SKILLS = (j && j.skills) || []; cb(SKILLS); })
        .catch(function () { SKILLS = []; cb(SKILLS); });
}

function findSkill(name) {
    if (!SKILLS) return null;
    var q = String(name || "").toLowerCase();
    for (var i = 0; i < SKILLS.length; i++) {
        if (SKILLS[i].name.toLowerCase() === q) return SKILLS[i];
    }
    return null;
}

// 当前输入是否处于「只打了斜杠 + 过滤词」的状态；是则返回过滤词，否则 null
function cmdQuery() {
    var v = $("userInput").value;
    if (v.charAt(0) !== "/") return null;
    var rest = v.slice(1);
    if (/\s/.test(rest)) return null;
    return rest.toLowerCase();
}

function hideCmdMenu() {
    var m = $("cmdMenu");
    if (m) m.style.display = "none";
    cmdItems = [];
    cmdSel = 0;
}

function renderCmdMenu() {
    var q = cmdQuery();
    var menu = $("cmdMenu");
    if (!menu) return;
    if (q === null) { hideCmdMenu(); return; }
    loadSkills(function (list) {
        cmdItems = [];
        for (var i = 0; i < list.length; i++) {
            var s = list[i];
            var hit = !q || s.name.toLowerCase().indexOf(q) >= 0 ||
                (s.description || "").toLowerCase().indexOf(q) >= 0;
            if (hit) cmdItems.push(s);
            if (cmdItems.length >= 40) break;
        }
        if (!cmdItems.length) {
            menu.innerHTML = '<div class="empty">没有匹配的技能（输入 / 看全部，或直接说需求）</div>';
            menu.style.display = "block";
            return;
        }
        if (cmdSel >= cmdItems.length) cmdSel = 0;
        var html = "";
        for (var k = 0; k < cmdItems.length; k++) {
            html += '<div class="item' + (k === cmdSel ? " sel" : "") + '" data-i="' + k + '">' +
                '<span class="nm">/' + escHtml(cmdItems[k].name) + '</span>' +
                '<span class="ds">' + escHtml(cmdItems[k].description || "") + '</span></div>';
        }
        menu.innerHTML = html;
        menu.style.display = "block";
        var sel = menu.querySelector(".item.sel");
        if (sel && sel.scrollIntoView) { try { sel.scrollIntoView(false); } catch (e) {} }
    });
}

function moveCmdSel(delta) {
    if (!cmdItems.length) return;
    cmdSel = (cmdSel + delta + cmdItems.length) % cmdItems.length;
    var menu = $("cmdMenu");
    var items = menu.querySelectorAll(".item");
    for (var i = 0; i < items.length; i++) {
        items[i].className = "item" + (i === cmdSel ? " sel" : "");
    }
    if (items[cmdSel] && items[cmdSel].scrollIntoView) { try { items[cmdSel].scrollIntoView(false); } catch (e) {} }
}

function acceptCmd() {
    if (!cmdItems.length) return false;
    var s = cmdItems[cmdSel];
    var input = $("userInput");
    input.value = "/" + s.name + " ";
    hideCmdMenu();
    autoGrow(input);
    try { input.focus(); } catch (e) {}
    return true;
}

// 斜杠命令说明（/help）
function showCmdHelp() {
    addMsg("sys",
        "斜杠命令：\n" +
        "/skills  列出全部技能\n" +
        "/技能名  后面跟需求，直接指定该技能（如 /datum-conversion 把外洲站水位换算到 85 基准面）\n" +
        "/new  本文档另起一条新对话（旧对话保留）\n" +
        "/sessions  查看本文档的历史对话并切换\n" +
        "/help  本说明\n" +
        "输入 / 会弹出可过滤的技能列表，↑↓ 选择、Tab/Enter 补全、Esc 关闭。");
}

function showSkillList() {
    loadSkills(function (list) {
        if (!list.length) { addMsg("sys", "⚠ 没读到技能清单（检查 ~/.claude/skills 是否存在）"); return; }
        var names = [];
        for (var i = 0; i < list.length; i++) names.push("/" + list[i].name);
        addMsg("sys", "可用技能 " + list.length + " 个（点名字或直接输入斜杠补全）：\n" + names.join("　"));
    });
}

function toggleCfg() {
    var box = $("cfgBox");
    var open = box.style.display === "none";
    box.style.display = open ? "block" : "none";
    $("cfgToggle").textContent = open ? "▾ 模型配置" : "▸ 模型配置";
}

// ---------- 配置 ----------
function getCfg() {
    var raw = null;
    try { raw = window.Application.PluginStorage.getItem("pi_config"); } catch (e) {}
    return raw ? JSON.parse(raw) : {};
}

function saveCfg() {
    var cfg = {
        provider: $("cfgProvider").value.trim(),
        model: $("cfgModel").value.trim(),
        apiKey: $("cfgKey").value.trim()
    };
    try { window.Application.PluginStorage.setItem("pi_config", JSON.stringify(cfg)); } catch (e) {}
    $("cfgMsg").textContent = "启动中…";
    fetch(BRIDGE + "/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) })
        .then(function () { $("cfgMsg").textContent = "已启动 ✓"; })
        .catch(function (e) { $("cfgMsg").textContent = "桥接连不上: " + e; });
}

// ---------- 文档上下文 ----------
// 修订标记字符（WPS/Word 内部用）需清掉，否则 agent 的 find 无法逐字匹配
function cleanText(t) {
    if (!t) return "";
    return t.replace(/[\r\u0007\u000b\u000c]/g, "\n").replace(/\n+$/, "");
}

// 光标是否在表格内（Information(12) = wdWithInTable）
function cursorInTable(sel) {
    try { return !!sel.Information(12); } catch (e) { return false; }
}

// 把光标所在的整张表读成 TSV（单元格内换行压成空格），让 agent 看到表格结构
function getTableContext(sel) {
    var tbl = sel.Tables.Item(1);
    var rows = tbl.Rows.Count;
    var cols = 0;
    try { cols = tbl.Columns.Count; } catch (e0) {}
    var lines = [];
    for (var r = 1; r <= rows; r++) {
        var cells = tbl.Rows.Item(r).Cells;
        var arr = [];
        for (var c = 1; c <= cells.Count; c++) {
            var t = cleanText(cells.Item(c).Range.Text).replace(/\n/g, " ").trim();
            arr.push(t);
        }
        lines.push(arr.join(" | "));
        if (!cols) cols = arr.length;
    }
    return {
        label: "当前表格（" + rows + " 行 × " + cols + " 列，行内单元格以 | 分隔）",
        text: lines.join("\n")
    };
}

// 文档结构摘要（表格/脚注/公式/未处理修订）
function docStructure(doc) {
    var parts = [];
    try { if (doc.Tables.Count) parts.push(doc.Tables.Count + " 个表格"); } catch (e1) {}
    try { if (doc.Footnotes.Count) parts.push(doc.Footnotes.Count + " 条脚注"); } catch (e2) {}
    try { if (doc.OMaths && doc.OMaths.Count) parts.push(doc.OMaths.Count + " 个公式"); } catch (e3) {}
    try { if (doc.Revisions.Count) parts.push(doc.Revisions.Count + " 处未处理修订"); } catch (e4) {}
    return parts.join("、");
}

// 脚注正文（只读附带，便于 agent 理解引用内容）
function footnotesText(doc) {
    var arr = [];
    try {
        var n = doc.Footnotes.Count;
        for (var i = 1; i <= n; i++) {
            var t = cleanText(doc.Footnotes.Item(i).Range.Text).trim();
            if (t) arr.push("[" + i + "] " + t);
        }
    } catch (e) {}
    return arr.join("\n");
}

function getContext(mode) {
    var app = window.Application;
    var doc = app.ActiveDocument;
    if (!doc || mode === "none") return null;
    try {
        var sel = app.Selection;
        // 光标在表格里：段落/选区模式都升级成整表，单个单元格文本对 agent 没意义
        if ((mode === "paragraph" || mode === "selection" || mode === "table") && cursorInTable(sel)) {
            var tc = getTableContext(sel);
            tc.text = tc.text.slice(0, MAX_CTX);
            return tc;
        }
        if (mode === "selection") {
            var t = cleanText(sel && sel.Text);
            if (!t.trim()) return { label: "选区（空）", text: "" };
            return { label: "选区", text: t.slice(0, MAX_CTX) };
        }
        if (mode === "paragraph") {
            var p = sel.Paragraphs.Item(1);
            var txt = cleanText(p.Range.Text);
            return { label: "当前段落", text: txt.slice(0, MAX_CTX) };
        }
        if (mode === "doc") {
            var full = cleanText(doc.Content.Text);
            var cnt = "";
            try { cnt = "，" + doc.Paragraphs.Count + " 段"; } catch (e2) {}
            var body = full.slice(0, MAX_CTX);
            var fn = footnotesText(doc);
            if (fn) body += "\n\n【脚注】\n" + fn;
            return { label: "全文" + cnt, text: body, truncated: full.length > MAX_CTX };
        }
    } catch (e) {
        return { label: "上下文读取失败", text: "", error: e.message };
    }
    return null;
}

function buildMessage(userText, ctx) {
    if (!ctx || !ctx.text) return userText;
    var s = "【当前文档上下文 · " + ctx.label + (ctx.truncated ? "，已截断" : "") + "】\n";
    s += "<<<\n" + ctx.text + "\n>>>\n\n";
    try {
        var st = docStructure(window.Application.ActiveDocument);
        if (st) s += "【文档结构】" + st + "\n\n";
    } catch (e) {}
    s += "【用户需求】\n" + userText;
    return s;
}

// ---------- 文档标识（会话持久化用） ----------
// 已保存文档用全路径；未保存文档用窗口句柄，避免多个「文字文稿1」共用同一条会话
function getDocKey() {
    try {
        var doc = window.Application.ActiveDocument;
        if (!doc) return "untitled";
        var full = null;
        try { full = doc.FullName; } catch (e) {}
        if (full && full.length) return full;
        var hw = null;
        try { hw = doc.Windows.Item(1).Hwnd; } catch (e2) {}
        if (hw) return "hwnd:" + hw;
        return "未命名:" + doc.Name;
    } catch (e) { return "untitled"; }
}

var lastDocKey = null;

// 切文档 → 切 session 并恢复历史
function syncDoc(force) {
    var k = getDocKey();
    if (!force && k === lastDocKey) return;
    var prev = lastDocKey;
    lastDocKey = k;
    try { updateUndoBtn(); } catch (e) {}
    // 未保存文档刚被保存：把旧会话（hwnd:/未命名: 键）迁移到新路径，避免「保存即失忆」
    var isTemp = function (key) { return !!key && (key.indexOf("hwnd:") === 0 || key.indexOf("未命名:") === 0); };
    var pre = (isTemp(prev) && !isTemp(k))
        ? fetch(BRIDGE + "/migrate", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ from: prev, to: k })
          }).then(function (r) { return r.json(); }).catch(function () { return null; })
        : Promise.resolve(null);
    pre.then(function (mj) {
        if (mj && mj.ok && mj.moved) addMsg("sys", "已把保存前的对话接到本文档（" + mj.moved + " 条会话）");
        return fetch(BRIDGE + "/context", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ docKey: k })
        }).then(function (r) { return r.json(); });
    })
      .then(function (j) {
          if (!j || !j.ok) { addMsg("sys", "⚠ 会话切换失败：" + ((j && j.error) || "")); return; }
          renderHistory(j.messages || [], j.tools || []);
      })
      .catch(function () {});
}

// 空态提示（chatBox 会被 renderHistory 清空，这里留一份模板以便还原）
var EMPTY_HINT = '<div class="hint" id="emptyHint">'
    + '<div class="hintIcon">✎</div>'
    + '<div>把光标放到要改的段落，直接说要改什么</div>'
    + '<div class="hintEg">「改得更正式一些」<br>「精简到 15 字以内」<br>「在表后说明后加一段：复核人：陈鋆」</div>'
    + '</div>';

function renderHistory(msgs, tools) {
    var box = $("chatBox");
    box.innerHTML = "";
    if (!msgs.length) { box.innerHTML = EMPTY_HINT; return; }
    var tl = tools || [];
    addMsg("sys", "—— 以下是本文档之前的对话 ——");
    var aiIdx = -1;
    for (var i = 0; i < msgs.length; i++) {
        var role = msgs[i].role === "user" ? "user" : "ai";
        var txt = msgs[i].text;
        // 历史里 assistant 消息带原始代码块，渲染时统一剥掉（与实时渲染一致）
        if (role === "ai") txt = stripBlocks(txt);
        if (!txt) continue;
        var el = addMsg(role, txt);
        if (role === "ai") {
            aiIdx++;
            // 这一轮调用过工具的话，气泡下面补一行灰字（与实时显示的「⚙ 调用工具」呼应）
            var hit = null;
            for (var k = 0; k < tl.length; k++) { if (tl[k] && tl[k].i === aiIdx) { hit = tl[k]; break; } }
            if (hit && hit.tools && hit.tools.length) {
                var tag = document.createElement("div");
                tag.className = "tooltag";
                tag.textContent = "⚙ 用过 " + hit.tools.join("、");
                el.appendChild(tag);
            }
        }
    }
    addMsg("sys", "—— 以上为历史，继续说吧 ——");
}

// ---------- 会话管理（新对话 / 历史列表 / 切换） ----------
function newChat() {
    var k = getDocKey();
    fetch(BRIDGE + "/new-chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docKey: k })
    }).then(function (r) { return r.json(); })
      .then(function (j) {
          if (!j.ok) { addMsg("sys", "⚠ 新建对话失败：" + (j.error || "")); return; }
          lastDocKey = k;
          var box = $("chatBox");
          box.innerHTML = EMPTY_HINT;
          addMsg("sys", "已开始新对话；之前的对话点「历史」可以切回。");
      })
      .catch(function () { addMsg("sys", "⚠ 新建对话失败（桥接没响应）"); });
}

function showSessionList(note) {
    var k = getDocKey();
    fetch(BRIDGE + "/sessions?docKey=" + encodeURIComponent(k))
      .then(function (r) { return r.json(); })
      .then(function (j) {
          if (!j.ok) { addMsg("sys", "⚠ 读取会话列表失败"); return; }
          renderSessionList(j.sessions || [], note);
      })
      .catch(function () { addMsg("sys", "⚠ 读取会话列表失败（桥接没响应）"); });
}

function renderSessionList(list, note) {
    var box = $("chatBox");
    box.innerHTML = "";
    addMsg("sys", "本文档共 " + list.length + " 条对话，点一条切换");
    if (note) addMsg("sys", note);
    for (var i = 0; i < list.length; i++) {
        (function (it) {
            var d = document.createElement("div");
            var empty = it.exists === false;
            d.className = "sessitem" + (it.current ? " cur" : "") + (empty ? " dis" : "");
            var when = "";
            try { if (it.updatedAt) when = new Date(it.updatedAt).toLocaleString(); } catch (e) {}
            var meta = (when ? escHtml(when) : "还没有内容") + (it.current ? " · 当前对话" : "");
            d.innerHTML = '<div class="t">' + escHtml(it.title || "(空会话)") + '</div>' +
                '<div class="m">' + meta + '</div>';
            if (!empty) d.onclick = function () { switchSession(it.file); };
            box.appendChild(d);
        })(list[i]);
    }
    var back = document.createElement("div");
    back.className = "sessitem";
    back.innerHTML = '<div class="t">← 返回当前对话</div>';
    back.onclick = function () { syncDoc(true); };
    box.appendChild(back);

    var pr = document.createElement("div");
    pr.className = "sessitem";
    pr.innerHTML = '<div class="t">🧹 清理旧对话</div><div class="m">每份文档保留最近 20 条，超过 30 天的清掉（当前对话永远保留）</div>';
    pr.onclick = function () { pruneSessions(); };
    box.appendChild(pr);
}

// 清理旧会话：先演练报数量，再在聊天区出现一个「确认清理」卡片，点它才真删
// （不用 window.confirm：WPS 的 webview 对模态框支持不稳，容易点了没反应）
function pruneSessions() {
    fetch(BRIDGE + "/prune", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 30, keepPerDoc: 20, dryRun: true })
    }).then(function (r) { return r.json(); })
      .then(function (j) {
          if (!j.ok) { addMsg("sys", "⚠ 清理失败：" + (j.error || "")); return; }
          if (!j.candidates) { addMsg("sys", "🧹 没有可清理的旧对话（每份文档保留最近 20 条、30 天内）。"); return; }
          showPruneConfirm(j.candidates);
      })
      .catch(function () { addMsg("sys", "⚠ 清理失败（桥接没响应）"); });
}

function showPruneConfirm(n) {
    addMsg("sys", "🧹 可清理 " + n + " 条旧对话（超过 30 天，或超出每份文档保留 20 条的上限）。当前正在用的对话不会被删。");
    var box = $("chatBox");
    var row = document.createElement("div");
    row.className = "sessitem";
    row.innerHTML = '<div class="t">🧹 确认清理 ' + n + ' 条</div>'
        + '<div class="m">点这里执行；不想清理就点「历史」或「← 返回当前对话」离开</div>';
    row.onclick = function () {
        row.onclick = null;
        row.style.opacity = "0.45";
        doPrune();
    };
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
}

function doPrune() {
    fetch(BRIDGE + "/prune", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 30, keepPerDoc: 20, dryRun: false })
    }).then(function (r) { return r.json(); })
      .then(function (j) {
          if (!j.ok) { addMsg("sys", "⚠ 清理失败：" + (j.error || "")); return; }
          showSessionList("🧹 已清理 " + j.deleted + " 条旧对话，释放 " + (j.freedKB || 0) + " KB。");
      })
      .catch(function () { addMsg("sys", "⚠ 清理失败（桥接没响应）"); });
}

function switchSession(file) {
    var k = getDocKey();
    fetch(BRIDGE + "/switch-session", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docKey: k, file: file })
    }).then(function (r) { return r.json(); })
      .then(function (j) {
          if (!j.ok) { addMsg("sys", "⚠ 切换失败：" + (j.error || "")); return; }
          lastDocKey = k;
          renderHistory(j.messages || [], j.tools || []);
          addMsg("sys", "已切到这条对话，继续说吧。");
      })
      .catch(function () { addMsg("sys", "⚠ 切换失败（桥接没响应）"); });
}

// 剥掉所有编辑指令代码块，只留说明文字（历史渲染与流式预览共用）
function stripBlocks(txt) {
    var s = txt || "";
    s = parseEdits(s).clean;
    s = parseComments(s).clean;
    s = parseRows(s).clean;
    s = parseImages(s).clean;
    s = parseTables(s).clean;
    s = parseOps(s).clean;
    s = parseParas(s).clean;
    return s;
}

// 流式预览：代码块还没闭合时也只显示说明部分，别让用户盯着 JSON 看
function streamPreview(t) {
    var i = t.indexOf("```");
    var head = (i >= 0 ? t.slice(0, i) : t).replace(/\s+$/, "");
    return head || "…";
}

// ---------- 发送 ----------
function sendMsg() {
    try {
        var input = $("userInput");
        var text = input.value.trim();
        if (!text) return;
        var display = text;      // 气泡里显示用户原话
        var forceSkill = null;   // 斜杠命令指定的技能

        // ---- 斜杠命令 ----
        if (text.charAt(0) === "/") {
            var sp = text.indexOf(" ");
            var cmd = (sp < 0 ? text.slice(1) : text.slice(1, sp)).toLowerCase();
            var rest = sp < 0 ? "" : text.slice(sp + 1).trim();
            if (!cmd || cmd === "skills" || cmd === "技能") {
                hideCmdMenu(); input.value = ""; input.style.height = ""; showSkillList(); return;
            }
            if (cmd === "help" || cmd === "帮助") {
                hideCmdMenu(); input.value = ""; input.style.height = ""; showCmdHelp(); return;
            }
            if (cmd === "new" || cmd === "新对话") {
                hideCmdMenu(); input.value = ""; input.style.height = ""; newChat(); return;
            }
            if (cmd === "sessions" || cmd === "history" || cmd === "历史") {
                hideCmdMenu(); input.value = ""; input.style.height = ""; showSessionList(); return;
            }
            if (SKILLS === null) {
                // 技能清单还没拉到，先拉一次再重发（输入框内容先不动）
                loadSkills(function () { sendMsg(); });
                return;
            }
            var sk = findSkill(cmd);
            if (!sk) {
                addMsg("sys", "⚠ 没有技能「" + cmd + "」，按普通消息发送");
                text = rest || text;
            } else {
                forceSkill = sk;
                text = rest
                    ? "请使用技能 `" + sk.name + "` 完成下面的任务：\n" + rest
                    : "请先简要说明技能 `" + sk.name + "` 的用途，并给出一个在本机可用的用法示例。";
                addMsg("sys", "⚙ 已指定技能：" + sk.name);
            }
        }
        hideCmdMenu();

        var mode = $("ctxMode").value;
        var ctx = getContext(mode);
        if (ctx && ctx.error) { addMsg("sys", "⚠ 读文档失败：" + ctx.error); }

        input.value = "";
        input.style.height = "";
        var ctxNote = (ctx && ctx.text) ? "\n（附带" + ctx.label + "，共 " + ctx.text.length + " 字）" : "";
        addMsg("user", display + ctxNote);
        setTitleMark(true);
        setStatus(forceSkill ? ("正在使用技能 " + forceSkill.name + "…") : "pi 正在处理…");
        lastDocKey = getDocKey();

        fetch(BRIDGE + "/prompt", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: buildMessage(text, ctx), docKey: lastDocKey })
        }).then(function (r) { return r.json(); })
          .then(function (j) {
              if (!j.ok) {
                  addMsg("sys", "⚠ 发送失败：pi 未启动或会话切换失败");
                  setTitleMark(false); setStatus("");
              }
          })
          .catch(function (e) { addMsg("sys", "⚠ 桥接连不上：" + e); setTitleMark(false); setStatus(""); });
    } catch (e) {
        addMsg("sys", "⚠ 发送异常：" + e.message);
        setTitleMark(false); setStatus("");
    }
}

function stopPi() {
    fetch(BRIDGE + "/stop", { method: "POST" });
}

// ---------- wps-edits / wps-comments 解析与执行 ----------
function parseBlock(text, tag) {
    var re = new RegExp("```" + tag + "\\s*([\\s\\S]*?)```");
    var m = text.match(re);
    if (!m) return { data: null, clean: text };
    var clean = text.replace(new RegExp("```" + tag + "\\s*[\\s\\S]*?```"), "").trim();
    try {
        return { data: JSON.parse(m[1].trim()), clean: clean };
    } catch (e) {
        return { data: null, clean: clean + "\n⚠ " + tag + " 解析失败: " + e.message };
    }
}

function parseEdits(text) {
    var r = parseBlock(text, "wps-edits");
    return { edits: r.data ? (r.data.edits || []) : null, clean: r.clean };
}

function parseComments(text) {
    var r = parseBlock(text, "wps-comments");
    return { comments: r.data ? (r.data.comments || []) : null, clean: r.clean };
}

// 统计某段内 find 出现次数（用于唯一性告警）
function countOccur(t, find) {
    var n = 0, i = 0;
    for (;;) {
        var k = t.indexOf(find, i);
        if (k < 0) break;
        n++; i = k + find.length;
    }
    return n;
}

// WPS 改完 Range 后不主动重绘，需用选区 Select 触发一次刷新（模板注释里的已知 bug）
function nudgeRepaint() {
    try {
        var r = window.Application.Selection.Range;
        if (r) r.Select();
    } catch (e) {}
}

function applyEdits(edits) {
    var app = window.Application;
    var doc = app.ActiveDocument;
    if (!doc) return "⚠ 没有打开的文档";
    var report = [];
    var revBefore = 0;
    try { doc.TrackRevisions = true; revBefore = doc.Revisions.Count; } catch (e) {}
    var applied = [];   // 实际落地的 {find, replace}，供文本级回滚

    for (var i = 0; i < edits.length; i++) {
        var ed = edits[i];
        if (typeof ed.find !== "string" || !ed.find) { report.push("✗ 第" + (i + 1) + "条缺 find，跳过"); continue; }
        var mode = ed.mode || "replace";
        var hit = null, hitPara = 0, occ = 0;
        try {
            var paras = doc.Paragraphs;
            var n = paras.Count;
            for (var p = 1; p <= n; p++) {
                var rng = paras.Item(p).Range;
                var t = rng.Text || "";
                var c = countOccur(t, ed.find);
                if (c > 0) {
                    occ += c;
                    if (!hit) {
                        var idx = t.indexOf(ed.find);
                        hit = doc.Range(rng.Start + idx, rng.Start + idx + ed.find.length);
                        hitPara = p;
                    }
                }
            }
            if (!hit) { report.push("✗ 未找到「" + ed.find + "」，跳过"); continue; }
            var rep = (ed.replace === undefined || ed.replace === null) ? "" : String(ed.replace);
            if (mode === "insertAfter") {
                // 在 find 所在段落之后另起一段，写入 replace（段落数 +1，后续 find 会重新扫描，索引不会错）
                doc.Paragraphs.Item(hitPara).Range.InsertParagraphAfter();
                if (rep) doc.Paragraphs.Item(hitPara + 1).Range.InsertBefore(rep);
                applied.push({ find: ed.find, replace: rep, mode: "insertAfter" });
                report.push("✓ 在第" + hitPara + "段后插入新段落：" + (rep.length > 30 ? rep.slice(0, 30) + "…" : rep) + (ed.reason ? "　" + ed.reason : ""));
            } else if (mode === "delete") {
                hit.Text = "";
                applied.push({ find: ed.find, replace: "", mode: "replace" });
                report.push("✓ 第" + hitPara + "段：删除「" + (ed.find.length > 20 ? ed.find.slice(0, 20) + "…" : ed.find) + "」" + (ed.reason ? "　" + ed.reason : ""));
            } else {
                hit.Text = rep;
                applied.push({ find: ed.find, replace: rep, mode: "replace" });
                report.push("✓ 第" + hitPara + "段：" + (ed.reason || "") + (occ > 1 ? "　⚠ 原文出现 " + occ + " 次，只改了第一处" : ""));
            }
        } catch (e) {
            report.push("✗ 执行出错: " + e.message);
        }
    }
    // 记录本轮改动：优先用修订区间（能精确到 WPS 的修订条目），
    // 若 WPS 把改动并入已有修订导致 Revisions.Count 未增，则退回文本级回滚
    var revAfter = revBefore;
    try { revAfter = doc.Revisions.Count; } catch (e) {}
    var ent = ensureTurn();
    if (revAfter > revBefore) ent.rev = { from: revBefore + 1, to: revAfter };
    for (var q = 0; q < applied.length; q++) ent.edits.push(applied[q]);
    if (ent.rev) {
        report.push("（本次新增修订 " + (revAfter - revBefore) + " 条，可在「审阅」里逐条接受/拒绝）");
    } else if (applied.length) {
        report.push("（改动已并入已有修订范围；点「撤销上轮AI修订」可文本级还原）");
    }
    nudgeRepaint();
    return report.join("\n");
}

// ---------- 批注 ----------
function applyComments(comments) {
    var doc = window.Application.ActiveDocument;
    if (!doc) return "⚠ 没有打开的文档";
    var report = [];
    for (var i = 0; i < comments.length; i++) {
        var c = comments[i];
        if (!c.find || !c.text) { report.push("✗ 第" + (i + 1) + "条缺 find/text，跳过"); continue; }
        var hit = null, hitPara = 0;
        try {
            var paras = doc.Paragraphs, n = paras.Count;
            for (var p = 1; p <= n; p++) {
                var rng = paras.Item(p).Range;
                var t = rng.Text || "";
                var idx = t.indexOf(c.find);
                if (idx >= 0) {
                    hit = doc.Range(rng.Start + idx, rng.Start + idx + c.find.length);
                    hitPara = p;
                    break;
                }
            }
            if (!hit) { report.push("✗ 未找到「" + c.find + "」，跳过"); continue; }
            doc.Comments.Add(hit, c.text);
            ensureTurn().comments.push({ find: c.find, text: String(c.text) });
            report.push("💬 第" + hitPara + "段已加批注：" + c.text);
        } catch (e) {
            report.push("✗ 加批注失败：" + e.message);
        }
    }
    nudgeRepaint();
    return report.join("\n");
}

// ---------- 表格加行 ----------
function parseRows(text) {
    var r = parseBlock(text, "wps-rows");
    return { rows: r.data ? (r.data.rows || []) : null, clean: r.clean };
}

// 按文字定位到表格里的某个单元格（返回表、行号、列号、总行数）
function findCellByText(doc, text) {
    var tn = 0;
    try { tn = doc.Tables.Count; } catch (e) { return null; }
    for (var t = 1; t <= tn; t++) {
        var tbl;
        try { tbl = doc.Tables.Item(t); } catch (e1) { continue; }
        var rn = 0;
        try { rn = tbl.Rows.Count; } catch (e2) { continue; }
        for (var r = 1; r <= rn; r++) {
            var cells;
            try { cells = tbl.Rows.Item(r).Cells; } catch (e3) { continue; }
            var cn = 0;
            try { cn = cells.Count; } catch (e4) { continue; }
            for (var c = 1; c <= cn; c++) {
                var cell;
                try { cell = cells.Item(c); } catch (e5) { continue; }
                if (cleanText(cell.Range.Text).indexOf(text) >= 0) {
                    return { table: tbl, row: r, col: c, rows: rn };
                }
            }
        }
    }
    return null;
}

// rows: [{after:"锚点单元格文字", cells:["a","b","c"]}] —— 在锚点所在行之后插入新行
function applyRows(rows) {
    var doc = window.Application.ActiveDocument;
    if (!doc) return "⚠ 没有打开的文档";
    var report = [];
    try { doc.TrackRevisions = true; } catch (e) {}
    for (var i = 0; i < rows.length; i++) {
        var it = rows[i];
        if (!it.after || !it.cells || !it.cells.length) { report.push("✗ 第" + (i + 1) + "条缺 after/cells，跳过"); continue; }
        try {
            var pos = findCellByText(doc, it.after);
            if (!pos) { report.push("✗ 没找到包含「" + it.after + "」的表格单元格，跳过"); continue; }
            var tbl = pos.table;
            var newRow = null;
            if (pos.row < pos.rows) {
                newRow = tbl.Rows.Add(tbl.Rows.Item(pos.row + 1));   // 插在下一行之前 = 本行之后
            } else {
                try { newRow = tbl.Rows.Add(); }                     // 末尾追加
                catch (eA) { newRow = tbl.Rows.Add(tbl.Rows.Item(pos.rows)); }
            }
            var cn = 0;
            try { cn = newRow.Cells.Count; } catch (eB) {}
            var lim = Math.min(it.cells.length, cn || it.cells.length);
            for (var c = 0; c < lim; c++) {
                try { newRow.Cells.Item(c + 1).Range.Text = String(it.cells[c]); } catch (eC) {}
            }
            report.push("＋ 已在第" + pos.row + "行后插入新行：" + it.cells.join(" | "));
            ensureTurn().rows.push({ cells: it.cells.slice(0) });
        } catch (e) {
            report.push("✗ 插入表格行失败：" + e.message);
        }
    }
    nudgeRepaint();
    return report.join("\n");
}

// ---------- P4：插入图片 / 新建表格 / 表格结构操作 ----------
var PT_PER_CM = 28.3465;

// 按文字找到段落序号（1 起）；找不到返回 -1
function findParaIdx(doc, text) {
    var n = 0;
    try { n = doc.Paragraphs.Count; } catch (e) { return -1; }
    for (var i = 1; i <= n; i++) {
        var tx = "";
        try { tx = cleanText(doc.Paragraphs.Item(i).Range.Text); } catch (e1) { continue; }
        if (tx.indexOf(text) >= 0) return i;
    }
    return -1;
}

function parseImages(text) {
    var r = parseBlock(text, "wps-image");
    return { images: r.data ? (r.data.images || []) : null, clean: r.clean };
}
function parseTables(text) {
    var r = parseBlock(text, "wps-tables");
    return { tables: r.data ? (r.data.tables || []) : null, clean: r.clean };
}
function parseOps(text) {
    var r = parseBlock(text, "wps-tableops");
    return { ops: r.data ? (r.data.ops || []) : null, clean: r.clean };
}
function parseParas(text) {
    var r = parseBlock(text, "wps-paragraphs");
    return { paras: r.data ? (r.data.paragraphs || []) : null, clean: r.clean };
}

// paragraphs: [{after:"锚点段落文字", texts:["第一段","第二段"]}] —— 一次性在锚点后按顺序插入多段（写报告用）
function applyParas(paras) {
    var doc = window.Application.ActiveDocument;
    if (!doc) return "⚠ 没有打开的文档";
    var report = [];
    var revBefore = 0;
    try { doc.TrackRevisions = true; revBefore = doc.Revisions.Count; } catch (e) {}
    var n = 0;
    for (var i = 0; i < paras.length; i++) {
        var it = paras[i] || {};
        var texts = it.texts || [];
        if (!texts.length) { report.push("✗ 第" + (i + 1) + "条没有 texts，跳过"); continue; }
        var idx = it.after ? findParaIdx(doc, it.after) : -1;
        if (idx < 0) { report.push("✗ 未找到锚点段落「" + String(it.after || "").slice(0, 20) + "」，跳过"); continue; }
        var at = idx;
        var ok = 0;
        for (var k = 0; k < texts.length; k++) {
            try {
                doc.Paragraphs.Item(at).Range.InsertParagraphAfter();
                var np = doc.Paragraphs.Item(at + 1);
                if (texts[k]) np.Range.InsertBefore(String(texts[k]));
                at = at + 1;
                ok++; n++;
                ensureTurn().edits.push({ find: "", replace: String(texts[k] || ""), mode: "insertAfter" });
            } catch (e) {
                report.push("✗ 第 " + (k + 1) + " 段插入失败：" + e.message);
                break;
            }
        }
        report.push("✓ 在「" + (String(it.after || "").length > 16 ? String(it.after).slice(0, 16) + "…" : String(it.after)) + "」后插入 " + ok + " 段");
    }
    try { nudgeRepaint(); } catch (e) {}
    var revAfter = 0;
    try { revAfter = doc.Revisions.Count; } catch (e) {}
    if (revAfter > revBefore) {
        var ent = ensureTurn();
        if (!ent.rev) ent.rev = { from: revBefore + 1, to: revAfter };
    }
    return report.length ? report.join("\n") + (n ? "\n（本次插入 " + n + " 段，可在「审阅」里逐条接受/拒绝）" : "") : "⚠ 没有可插入的段落";
}

// images: [{after:"锚点段落文字", path:"D:\\a.png", width:12, height:8}]
function applyImages(imgs) {
    var doc = window.Application.ActiveDocument;
    if (!doc) return "⚠ 没有打开的文档";
    var report = [];
    for (var i = 0; i < imgs.length; i++) {
        var it = imgs[i] || {};
        if (!it.path) { report.push("✗ 第" + (i + 1) + "条缺 path，跳过"); continue; }
        try {
            var idx = it.after ? findParaIdx(doc, it.after) : -1;
            if (idx < 0) idx = doc.Paragraphs.Count;
            doc.Paragraphs.Item(idx).Range.InsertParagraphAfter();
            var np = doc.Paragraphs.Item(idx + 1);
            var rng = doc.Range(np.Range.Start, np.Range.Start);
            var shp = null;
            try { shp = doc.InlineShapes.AddPicture(it.path, false, true, rng); }
            catch (eA) { shp = doc.InlineShapes.AddPicture(it.path); }
            if (!shp) { report.push("✗ 插入图片失败：" + it.path); continue; }
            // 只给宽（或只给高）时按原始比例缩放另一边，避免图片被拉变形
            var ratio = 0;
            try { if (shp.Width) ratio = shp.Height / shp.Width; } catch (eR) {}
            if (it.width) { try { shp.Width = Number(it.width) * PT_PER_CM; } catch (eB) {} }
            if (it.height) { try { shp.Height = Number(it.height) * PT_PER_CM; } catch (eC) {} }
            if (it.width && !it.height && ratio) { try { shp.Height = shp.Width * ratio; } catch (eD) {} }
            if (it.height && !it.width && ratio) { try { shp.Width = shp.Height / ratio; } catch (eE) {} }
            var aw = "?", ah = "?";
            try { aw = (shp.Width / PT_PER_CM).toFixed(1); ah = (shp.Height / PT_PER_CM).toFixed(1); } catch (eF) {}
            report.push("🖼 已插入图片" + (it.after ? "（「" + it.after + "」之后）" : "（文末）") +
                "，尺寸 " + aw + " × " + ah + " cm");
        } catch (e) { report.push("✗ 插入图片失败：" + e.message); }
    }
    nudgeRepaint();
    return report.join("\n");
}

// tables: [{after:"锚点段落文字", header:["测站","水位"], data:[["a","1"]], rows, cols}]
function applyTables(tables) {
    var doc = window.Application.ActiveDocument;
    if (!doc) return "⚠ 没有打开的文档";
    var report = [];
    for (var i = 0; i < tables.length; i++) {
        var it = tables[i] || {};
        var data = it.data || [], header = it.header || [];
        var rows = Number(it.rows || (data.length + (header.length ? 1 : 0)) || 2);
        var cols = Number(it.cols || header.length || (data[0] ? data[0].length : 0) || 2);
        try {
            var idx = it.after ? findParaIdx(doc, it.after) : -1;
            if (idx < 0) idx = doc.Paragraphs.Count;
            doc.Paragraphs.Item(idx).Range.InsertParagraphAfter();
            var np = doc.Paragraphs.Item(idx + 1);
            var rng = doc.Range(np.Range.Start, np.Range.Start);
            var tbl = null;
            try { tbl = doc.Tables.Add(rng, rows, cols); }
            catch (eA) { try { tbl = doc.Tables.Add(rng, rows, cols, 1, 0); } catch (eB) { tbl = null; } }
            if (!tbl) { report.push("✗ 新建表格失败（JSAPI 不支持 Tables.Add？）"); continue; }
            var off = header.length ? 2 : 1;
            for (var r = 1; r <= rows; r++) {
                for (var c = 1; c <= cols; c++) {
                    var val = "";
                    if (r === 1 && header.length) val = header[c - 1] != null ? header[c - 1] : "";
                    else if (data[r - off]) val = data[r - off][c - 1] != null ? data[r - off][c - 1] : "";
                    try { tbl.Cell(r, c).Range.Text = String(val); } catch (eC) {}
                }
            }
            try {
                for (var c2 = 1; c2 <= cols; c2++) {
                    var hc = tbl.Cell(1, c2);
                    hc.Range.Font.Bold = true;
                    hc.Range.ParagraphFormat.Alignment = 1;
                    hc.VerticalAlignment = 1;
                }
            } catch (eD) {}
            report.push("▦ 已新建表格 " + rows + " 行 × " + cols + " 列" + (it.after ? "（「" + it.after + "」之后）" : "（文末）"));
        } catch (e) { report.push("✗ 新建表格失败：" + e.message); }
    }
    nudgeRepaint();
    return report.join("\n");
}

// ops: [{op:"merge", from:"A", to:"B"} | {op:"split", find, rows, cols}
//       {op:"insertColAfter", find, header, cells} | {op:"deleteRow"/"deleteCol", find}
//       {op:"formatHeader", find} | {op:"colWidth"/"rowHeight", find, cm} | {op:"repeatHeader", find}
//       {op:"autoFit", find}]
function applyOps(ops) {
    var doc = window.Application.ActiveDocument;
    if (!doc) return "⚠ 没有打开的文档";
    var report = [], structN = 0;
    function anchor(op) {
        var key = op.find || op.from;
        if (!key) return null;
        return findCellByText(doc, key);
    }
    for (var i = 0; i < ops.length; i++) {
        var op = ops[i] || {};
        try {
            if (op.op === "merge") {
                var p1 = findCellByText(doc, op.from), p2 = findCellByText(doc, op.to);
                if (!p1 || !p2) { report.push("✗ 合并：锚点「" + (p1 ? op.to : op.from) + "」没找到"); continue; }
                p1.table.Cell(p1.row, p1.col).Merge(p2.table.Cell(p2.row, p2.col));
                report.push("⛓ 已合并单元格：「" + op.from + "」→「" + op.to + "」");
                structN++; continue;
            }
            if (op.op === "split") {
                var ps = anchor(op);
                if (!ps) { report.push("✗ 拆分：锚点「" + (op.find || "") + "」没找到"); continue; }
                ps.table.Cell(ps.row, ps.col).Split(Number(op.rows || 1), Number(op.cols || 2));
                report.push("✂ 已拆分单元格「" + op.find + "」为 " + (op.rows || 1) + " 行 × " + (op.cols || 2) + " 列");
                structN++; continue;
            }
            if (op.op === "insertColAfter") {
                var pc = anchor(op);
                if (!pc) { report.push("✗ 插列：锚点「" + (op.find || "") + "」没找到"); continue; }
                var tb = pc.table, col = pc.col;
                try {
                    if (col < tb.Columns.Count) tb.Columns.Add(tb.Columns.Item(col + 1));
                    else tb.Columns.Add();
                } catch (eCol) { report.push("✗ 插入列失败：" + eCol.message); continue; }
                var cells = op.cells || [];
                var startRow = op.header ? 2 : 1;
                if (op.header) { try { tb.Cell(1, col + 1).Range.Text = String(op.header); } catch (eH) {} }
                for (var k = 0; k < cells.length; k++) {
                    try { tb.Cell(startRow + k, col + 1).Range.Text = String(cells[k]); } catch (eK) {}
                }
                report.push("➕ 已在「" + op.find + "」右侧插入 1 列" + (op.header ? "（表头：" + op.header + "）" : ""));
                structN++; continue;
            }
            if (op.op === "deleteRow") {
                var pr = anchor(op);
                if (!pr) { report.push("✗ 删行：锚点「" + (op.find || "") + "」没找到"); continue; }
                pr.table.Rows.Item(pr.row).Delete();
                report.push("➖ 已删除「" + op.find + "」所在行");
                structN++; continue;
            }
            if (op.op === "deleteCol") {
                var pd = anchor(op);
                if (!pd) { report.push("✗ 删列：锚点「" + (op.find || "") + "」没找到"); continue; }
                pd.table.Columns.Item(pd.col).Delete();
                report.push("➖ 已删除「" + op.find + "」所在列");
                structN++; continue;
            }
            if (op.op === "formatHeader") {
                var pf = anchor(op);
                var tbf = pf ? pf.table : (doc.Tables.Count ? doc.Tables.Item(1) : null);
                if (!tbf) { report.push("✗ 没有表格"); continue; }
                var cn = tbf.Columns.Count;
                for (var c3 = 1; c3 <= cn; c3++) {
                    try {
                        var hcell = tbf.Cell(1, c3);
                        if (op.bold !== false) hcell.Range.Font.Bold = true;
                        hcell.Range.ParagraphFormat.Alignment = 1;
                        hcell.VerticalAlignment = 1;
                    } catch (e3) {}
                }
                report.push("🅑 已把表头行设为加粗居中");
                structN++; continue;
            }
            if (op.op === "colWidth") {
                var pw = anchor(op);
                if (!pw) { report.push("✗ 列宽：锚点没找到"); continue; }
                try { pw.table.Columns.Item(pw.col).Width = Number(op.cm) * PT_PER_CM; }
                catch (eW) { try { pw.table.Columns.SetWidth(Number(op.cm) * PT_PER_CM, 0); } catch (eW2) { report.push("✗ 设置列宽失败：" + eW2.message); continue; } }
                report.push("📏 已把「" + op.find + "」列宽设为 " + op.cm + "cm");
                structN++; continue;
            }
            if (op.op === "rowHeight") {
                var ph = anchor(op);
                if (!ph) { report.push("✗ 行高：锚点没找到"); continue; }
                try {
                    ph.table.Rows.Item(ph.row).HeightRule = 1;
                    ph.table.Rows.Item(ph.row).Height = Number(op.cm) * PT_PER_CM;
                } catch (eHt) { report.push("✗ 设置行高失败：" + eHt.message); continue; }
                report.push("📏 已把「" + op.find + "」行高设为 " + op.cm + "cm");
                structN++; continue;
            }
            if (op.op === "repeatHeader") {
                var prh = anchor(op);
                var tbr = prh ? prh.table : (doc.Tables.Count ? doc.Tables.Item(1) : null);
                if (!tbr) { report.push("✗ 没有表格"); continue; }
                tbr.Rows.Item(1).HeadingFormat = true;
                report.push("🔁 已设置表头行跨页重复");
                structN++; continue;
            }
            if (op.op === "autoFit") {
                var paf = anchor(op);
                var tba = paf ? paf.table : (doc.Tables.Count ? doc.Tables.Item(1) : null);
                if (!tba) { report.push("✗ 没有表格"); continue; }
                try { tba.AutoFitBehavior(2); } catch (eAf) { report.push("✗ 自适应失败：" + eAf.message); continue; }
                report.push("↔ 已把表格设为「根据内容自动调整」");
                structN++; continue;
            }
            report.push("✗ 不认识的表格操作「" + (op.op || "?") + "」，跳过");
        } catch (e) { report.push("✗ 表格操作「" + (op.op || "?") + "」失败：" + e.message); }
    }
    if (structN) {
        var e0 = ensureTurn();
        e0.struct = (e0.struct || 0) + structN;
    }
    nudgeRepaint();
    return report.join("\n");
}

// ---------- 撤销：多轮改动栈 ----------
// 每轮 AI 操作（修订/批注/加行）压一条记录，可连续点「撤销」逐轮回退
var undoStack = [];   // [{docKey, rev:{from,to}|null, edits:[], comments:[], rows:[]}]
var UNDO_MAX = 12;
var curTurn = null;

function beginTurn() { curTurn = null; }

function ensureTurn() {
    if (!curTurn) {
        curTurn = { docKey: getDocKey(), rev: null, edits: [], comments: [], rows: [] };
    }
    return curTurn;
}

function endTurn() {
    var t = curTurn;
    curTurn = null;
    if (!t) return;
    if (!t.rev && !t.edits.length && !t.comments.length && !t.rows.length && !t.struct) return;
    undoStack.push(t);
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    updateUndoBtn();
}

function topEntryForDoc() {
    var dk = getDocKey();
    for (var i = undoStack.length - 1; i >= 0; i--) {
        if (undoStack[i].docKey === dk) return i;
    }
    return -1;
}

function updateUndoBtn() {
    var b = $("undoBtn");
    if (!b) return;
    var dk = getDocKey(), n = 0;
    for (var i = 0; i < undoStack.length; i++) if (undoStack[i].docKey === dk) n++;
    b.disabled = n === 0;
    b.textContent = n > 1 ? "撤销上轮AI修订（可撤销 " + n + " 轮）" : "撤销上轮AI修订";
}

function undoLastTurn() {
    var doc = window.Application.ActiveDocument;
    if (!doc) { addMsg("sys", "⚠ 没有打开的文档"); return; }
    var idx = topEntryForDoc();
    if (idx < 0) { addMsg("sys", "⚠ 当前文档没有可撤销的 AI 改动"); return; }
    var ent = undoStack[idx];
    undoStack.splice(idx, 1);

    var reverted = 0, rowsDel = 0, cmtDel = 0, unrecoverable = 0;

    // 说明：不用「按修订序号 Reject」来回退——WPS 会把相邻改动合并进同一条修订，
    // 序号区间一旦被合并就会连带撤销其他轮次的改动（实测会误删上一轮插入的段落）。
    // 这里只用「文本级还原」：按本轮记录的 find/replace 反向改回，作用范围精确可控。

    // 1) 表格加行：删掉首格文字与记录一致的那一行
    for (var r = ent.rows.length - 1; r >= 0; r--) {
        try {
            var key = String(ent.rows[r].cells[0] || "");
            if (!key) continue;
            var pos = findCellByText(doc, key);
            if (pos) { pos.table.Rows.Item(pos.row).Delete(); rowsDel++; }
        } catch (e) {}
    }

    // 2) 批注：删掉批注文字与记录匹配的批注
    for (var c = ent.comments.length - 1; c >= 0; c--) {
        try {
            var cs = doc.Comments, cn = cs.Count;
            var want = String(ent.comments[c].text || "");
            for (var k = cn; k >= 1; k--) {
                var ctext = String(cs.Item(k).Range.Text || "");
                if (want && ctext.indexOf(want) >= 0) { cs.Item(k).Delete(); cmtDel++; break; }
            }
        } catch (e) {}
    }

    // 3) 文本级还原：按本轮记录的 find/replace 反向改回文字
    for (var k2 = ent.edits.length - 1; k2 >= 0; k2--) {
        var ed = ent.edits[k2];
        try {
            if (ed.mode === "insertAfter") {
                // 撤销插入：找到文字与插入内容一致的段落，清空其文字（保留段落标记）
                var pa = doc.Paragraphs, na = pa.Count;
                var wantP = String(ed.replace || "").replace(/[\r\n]/g, "");
                if (!wantP) continue;
                for (var q = 1; q <= na; q++) {
                    var rq = pa.Item(q).Range;
                    var tq = String(rq.Text || "").replace(/[\r\n]/g, "");
                    if (tq === wantP) {
                        doc.Range(rq.Start, Math.max(rq.Start, rq.End - 1)).Text = "";
                        reverted++;
                        break;
                    }
                }
                continue;
            }
            if (ed.mode === "delete" || ed.replace === "") { unrecoverable++; continue; }   // 删除类无法按文字定位还原
            var paras = doc.Paragraphs, n = paras.Count;
            for (var p = 1; p <= n; p++) {
                var rng = paras.Item(p).Range;
                var t = rng.Text || "";
                var ii = t.indexOf(ed.replace);
                if (ii >= 0) {
                    doc.Range(rng.Start + ii, rng.Start + ii + ed.replace.length).Text = ed.find;
                    reverted++;
                    break;
                }
            }
        } catch (e) {}
    }

    var parts = [];
    if (rowsDel) parts.push("删除表格行 " + rowsDel + " 行");
    if (cmtDel) parts.push("删除批注 " + cmtDel + " 条");
    if (reverted) parts.push("还原文本 " + reverted + " 处");
    if (unrecoverable) parts.push("删除类改动 " + unrecoverable + " 处需在「审阅」里手动拒绝");
    if (ent.struct) parts.push("表格结构改动 " + ent.struct + " 处需在 WPS 里按 Ctrl+Z 逐步回退");
    var left = 0;
    for (var z = 0; z < undoStack.length; z++) if (undoStack[z].docKey === ent.docKey) left++;
    addMsg("edit", parts.length
        ? "↩ 已撤销一轮 AI 改动（" + parts.join("，") + "）" + (left ? "　还可继续撤销 " + left + " 轮" : "")
        : "↩ 未能撤销（改动可能已被手动接受或删除）");
    updateUndoBtn();
    nudgeRepaint();
    setStatus("已撤销一轮 AI 改动");
}

// ---------- 接管标记：窗口标题前缀 + 状态栏 ----------
// WPS 12 标签页从右截断，标记必须放前缀
var titleOrig = null;
function setTitleMark(on) {
    try {
        var w = window.Application.ActiveWindow;
        if (!w) return;
        if (on) {
            if (titleOrig === null) titleOrig = w.Caption;
            if (String(w.Caption).indexOf("〔AI〕") !== 0) w.Caption = "〔AI〕" + titleOrig;
        } else if (titleOrig !== null) {
            try { if (String(w.Caption).indexOf("〔AI〕") === 0) w.Caption = titleOrig; } catch (e) {}
            titleOrig = null;
        }
    } catch (e) {}
}

function setStatus(txt) {
    try { window.Application.StatusBar = txt; } catch (e) {}
}

// ---------- 诊断（JSAPI 能力探测，只读） ----------
// silent=true 时只写 bridge 日志，不打扰聊天区（onload 自动跑一次，便于事后排错）
function runProbe(silent) {
    var out = [];
    function t(name, fn) {
        try {
            var v = fn();
            if (v === undefined) v = "undefined";
            out.push(name + " = " + (typeof v === "object" && v !== null ? JSON.stringify(v) : v));
        } catch (e) { out.push(name + " !ERR " + e.message); }
    }
    var app = window.Application, doc = app.ActiveDocument;
    if (!doc) { addMsg("sys", "没有打开的文档"); return; }
    t("app.Version", function () { return app.Version; });
    t("doc.Name", function () { return doc.Name; });
    t("doc.FullName", function () { return doc.FullName; });
    t("doc.Windows.Count", function () { return doc.Windows.Count; });
    t("doc.Windows.Item(1).Caption", function () { return doc.Windows.Item(1).Caption; });
    t("doc.Windows.Item(1).Hwnd", function () { return doc.Windows.Item(1).Hwnd; });
    t("doc.Tables.Count", function () { return doc.Tables.Count; });
    t("doc.Footnotes.Count", function () { return doc.Footnotes.Count; });
    t("doc.Endnotes.Count", function () { return doc.Endnotes.Count; });
    t("doc.Fields.Count", function () { return doc.Fields.Count; });
    t("doc.OMaths", function () { return typeof doc.OMaths + " count=" + (doc.OMaths ? doc.OMaths.Count : "n/a"); });
    t("doc.Content.OMaths", function () { return typeof doc.Content.OMaths; });
    t("doc.Revisions.Count", function () { return doc.Revisions.Count; });
    t("doc.Comments.Count", function () { return doc.Comments.Count; });
    t("doc.TrackRevisions", function () { return doc.TrackRevisions; });
    t("doc.Saved", function () { return doc.Saved; });
    t("sel.Information(12) 表格内", function () { return app.Selection.Information(12); });
    t("sel.Tables.Count", function () { return app.Selection.Tables.Count; });
    t("sel.Bookmarks.Count", function () { return app.Selection.Bookmarks.Count; });
    t("fn InsertParagraphAfter", function () { return typeof doc.Content.InsertParagraphAfter; });
    t("fn InsertAfter", function () { return typeof doc.Content.InsertAfter; });
    t("fn doc.Range", function () { return typeof doc.Range; });
    t("fn BuiltInDocumentProperties", function () { return typeof doc.BuiltInDocumentProperties; });
    t("fn Comments.Add", function () { return typeof doc.Comments.Add; });
    t("fn Range.Find", function () { return typeof doc.Content.Find; });
    t("fn Undo/Redo", function () { return typeof doc.Undo + "/" + typeof doc.UndoRecord; });
    t("app.ActiveWindow.Caption", function () { return app.ActiveWindow.Caption; });
    // —— P4：图片 / 新表格 / 表格结构 能力探测（只问 typeof，不动文档） ——
    t("doc.InlineShapes.Count", function () { return doc.InlineShapes.Count; });
    t("doc.Shapes.Count", function () { return doc.Shapes.Count; });
    t("fn InlineShapes.AddPicture", function () { return typeof doc.InlineShapes.AddPicture; });
    t("fn Shapes.AddPicture", function () { return typeof doc.Shapes.AddPicture; });
    t("fn Tables.Add", function () { return typeof doc.Tables.Add; });
    t("tbl.Rows.Add", function () {
        var tb = doc.Tables.Count ? doc.Tables.Item(1) : null;
        return tb ? typeof tb.Rows.Add : "no-table";
    });
    t("tbl.Columns.Add", function () {
        var tb = doc.Tables.Count ? doc.Tables.Item(1) : null;
        return tb ? typeof tb.Columns.Add : "no-table";
    });
    t("row.Delete / col.Delete", function () {
        var tb = doc.Tables.Count ? doc.Tables.Item(1) : null;
        if (!tb) return "no-table";
        return typeof tb.Rows.Item(1).Delete + "/" + typeof tb.Columns.Item(1).Delete;
    });
    t("cell.Merge", function () {
        var tb = doc.Tables.Count ? doc.Tables.Item(1) : null;
        if (!tb) return "no-table";
        return typeof tb.Cell(1, 1).Merge;
    });
    t("cell.Split", function () {
        var tb = doc.Tables.Count ? doc.Tables.Item(1) : null;
        if (!tb) return "no-table";
        return typeof tb.Cell(1, 1).Split;
    });
    t("row.HeadingFormat 表头重复", function () {
        var tb = doc.Tables.Count ? doc.Tables.Item(1) : null;
        if (!tb) return "no-table";
        return typeof tb.Rows.Item(1).HeadingFormat + "=" + tb.Rows.Item(1).HeadingFormat;
    });
    t("rows.SetHeight / cols.SetWidth", function () {
        var tb = doc.Tables.Count ? doc.Tables.Item(1) : null;
        if (!tb) return "no-table";
        return typeof tb.Rows.SetHeight + "/" + typeof tb.Columns.SetWidth;
    });
    t("cell.VerticalAlignment", function () {
        var tb = doc.Tables.Count ? doc.Tables.Item(1) : null;
        if (!tb) return "no-table";
        return typeof tb.Cell(1, 1).VerticalAlignment + "=" + tb.Cell(1, 1).VerticalAlignment;
    });
    t("cell.Range.ParagraphFormat", function () {
        var tb = doc.Tables.Count ? doc.Tables.Item(1) : null;
        if (!tb) return "no-table";
        return typeof tb.Cell(1, 1).Range.ParagraphFormat + "/align=" + tb.Cell(1, 1).Range.ParagraphFormat.Alignment;
    });
    t("tbl.Borders", function () {
        var tb = doc.Tables.Count ? doc.Tables.Item(1) : null;
        if (!tb) return "no-table";
        return typeof tb.Borders;
    });
    t("tbl.Style", function () {
        var tb = doc.Tables.Count ? doc.Tables.Item(1) : null;
        if (!tb) return "no-table";
        try { return String(tb.Style); } catch (e) { return "ERR " + e.message; }
    });
    t("app.Selection.InlineShapes.Count", function () { return app.Selection.InlineShapes.Count; });
    t("tbl.AutoFitBehavior", function () {
        var tb = doc.Tables.Count ? doc.Tables.Item(1) : null;
        if (!tb) return "no-table";
        return typeof tb.AutoFitBehavior;
    });
    // 布局度量（判断窗格 webview 视口是否比可见区域大，导致底部被裁）
    t("layout.innerWH", function () { return window.innerWidth + "x" + window.innerHeight; });
    t("layout.clientWH", function () { return document.documentElement.clientWidth + "x" + document.documentElement.clientHeight; });
    t("layout.bodyH", function () { return document.body.clientHeight + "/" + document.body.scrollHeight; });
    t("layout.dpr", function () { return window.devicePixelRatio; });
    t("layout.chatH", function () { var c = $("chatBox"); return c ? c.clientHeight + "/" + c.scrollHeight : "none"; });
    t("layout.composerBottom", function () {
        var f = document.querySelector(".composer");
        if (!f) return "none";
        var r = f.getBoundingClientRect();
        return "top=" + Math.round(r.top) + " bottom=" + Math.round(r.bottom) + " h=" + Math.round(r.height);
    });
    t("layout.undoBottom", function () {
        var b = $("undoBtn");
        if (!b) return "none";
        var r = b.getBoundingClientRect();
        return "top=" + Math.round(r.top) + " bottom=" + Math.round(r.bottom);
    });
    t("dom.cmdMenu", function () { return $("cmdMenu") ? ("yes display=" + $("cmdMenu").style.display) : "MISSING"; });
    t("dom.emptyHint", function () { return $("emptyHint") ? "yes" : "MISSING"; });
    t("dom.onInputChange", function () { return typeof onInputChange; });
    t("dom.htmlVer", function () { return (document.querySelector('meta[name="ver"]') || {}).content || "no-meta"; });
    var txt = out.join("\n");
    if (!silent) addMsg("sys", "—— 诊断 ——\n" + txt);
    try {
        fetch(BRIDGE + "/log", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: "PROBE" + (silent ? "(auto)" : "") + "\n" + txt })
        });
    } catch (e) {}
}

// ---------- SSE ----------
var aiBuf = "";
var aiDiv = null;
var es = null;

function connectSSE() {
    if (es) { try { es.close(); } catch (e) {} }
    es = new EventSource(BRIDGE + "/events");
    es.onopen = function () { $("connState").textContent = "已连接"; $("connState").className = "badge ok"; };
    es.onerror = function () { $("connState").textContent = "桥接未运行"; $("connState").className = "badge err"; };
    es.onmessage = function (e) {
        var d;
        try { d = JSON.parse(e.data); } catch (err) { return; }
        // 多文档隔离：桥接是单 pi 进程，SSE 全局广播；属于别的文档的事件直接丢弃，
        // 避免 A 文档的回复/修订被写进当前 B 文档
        if (d.docKey && lastDocKey && d.docKey !== lastDocKey &&
            (d.type === "delta" || d.type === "done" || d.type === "error" || d.type === "tool")) {
            if (d.type === "done") { aiBuf = ""; aiDiv = null; setTitleMark(false); }
            return;
        }
        if (d.type === "status") {
            if (d.text.indexOf("退出") >= 0) {
                $("connState").textContent = "pi 已退出";
                $("connState").className = "badge err";
            } else if (d.text.indexOf("运行中") >= 0) {
                $("connState").textContent = "已连接"; $("connState").className = "badge ok";
            }
        } else if (d.type === "delta") {
            if (!aiDiv) {
                aiDiv = addMsg("ai", "");
                setTitleMark(true);
                setStatus("pi 正在处理…");
            }
            aiBuf += d.delta;
            aiDiv.textContent = streamPreview(aiBuf);
            var box = $("chatBox"); box.scrollTop = box.scrollHeight;
        } else if (d.type === "tool") {
            // 技能/命令执行中：先给个可见反馈，否则用户会以为卡住了
            if (!aiDiv) {
                aiDiv = addMsg("ai", "");
                setTitleMark(true);
            }
            setStatus("正在调用 " + d.name + "…");
            addMsg("sys", "⚙ 调用工具：" + d.name);  // 留一条痕迹，文字气泡会被流式内容覆盖
            aiDiv.textContent = (aiBuf ? streamPreview(aiBuf) + "\n\n" : "") + "⚙ 正在使用 " + d.name + " …";
            var boxT = $("chatBox"); boxT.scrollTop = boxT.scrollHeight;
        } else if (d.type === "done") {
            var parsed = parseEdits(d.text || aiBuf);
            var cmt = parseComments(parsed.clean);
            var rws = parseRows(cmt.clean);
            var imgs = parseImages(rws.clean);
            var tbls = parseTables(imgs.clean);
            var opsb = parseOps(tbls.clean);
            var prb = parseParas(opsb.clean);
            aiBuf = "";
            if (aiDiv) {
                if (prb.clean && prb.clean.trim()) aiDiv.textContent = prb.clean;
                else if (aiDiv.parentNode) aiDiv.parentNode.removeChild(aiDiv);  // 工具轮次没留下文字就别留空气泡
                aiDiv = null;
            }
            else if (prb.clean) addMsg("ai", prb.clean);
            setTitleMark(false);
            var did = [];
            beginTurn();
            if (parsed.edits && parsed.edits.length) {
                addMsg("edit", applyEdits(parsed.edits));
                did.push("修订 " + parsed.edits.length + " 处");
            }
            if (cmt.comments && cmt.comments.length) {
                addMsg("edit", applyComments(cmt.comments));
                did.push("批注 " + cmt.comments.length + " 条");
            }
            if (rws.rows && rws.rows.length) {
                addMsg("edit", applyRows(rws.rows));
                did.push("表格加行 " + rws.rows.length + " 行");
            }
            if (imgs.images && imgs.images.length) {
                addMsg("edit", applyImages(imgs.images));
                did.push("插入图片 " + imgs.images.length + " 张");
            }
            if (tbls.tables && tbls.tables.length) {
                addMsg("edit", applyTables(tbls.tables));
                did.push("新建表格 " + tbls.tables.length + " 个");
            }
            if (opsb.ops && opsb.ops.length) {
                addMsg("edit", applyOps(opsb.ops));
                did.push("表格结构调整 " + opsb.ops.length + " 处");
            }
            if (prb.paras && prb.paras.length) {
                addMsg("edit", applyParas(prb.paras));
                did.push("插入段落 " + prb.paras.length + " 组");
            }
            endTurn();
            setStatus(did.length ? "AI 已" + did.join("、") + "，可在「审阅」中处理" : "");
        } else if (d.type === "error") {
            addMsg("sys", "⚠ " + d.error);
            aiBuf = ""; aiDiv = null;
            setTitleMark(false);
            setStatus("");
        }
    };
}

window.onload = function () {
    var cfg = getCfg();
    $("cfgProvider").value = cfg.provider || "";
    $("cfgModel").value = cfg.model || "";
    $("userInput").addEventListener("keydown", function (e) {
        // 斜杠命令面板打开时：↑↓ 选择、Tab/Enter 补全、Esc 关闭
        var menuOpen = $("cmdMenu") && $("cmdMenu").style.display !== "none";
        if (menuOpen) {
            if (e.key === "ArrowDown") { e.preventDefault(); moveCmdSel(1); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); moveCmdSel(-1); return; }
            if (e.key === "Escape") { e.preventDefault(); hideCmdMenu(); return; }
            if ((e.key === "Tab" || (e.key === "Enter" && !e.ctrlKey && !e.metaKey)) && cmdItems.length) {
                e.preventDefault(); acceptCmd(); return;
            }
        }
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendMsg(); return; }
        // Ctrl+Shift+Z：撤销上一轮 AI 改动（等价于点「撤销上轮AI修订」）
        if ((e.key === "z" || e.key === "Z") && e.ctrlKey && e.shiftKey) { e.preventDefault(); undoLastTurn(); }
    });
    // 点技能条目直接补全
    if ($("cmdMenu")) {
        $("cmdMenu").addEventListener("mousedown", function (e) {
            var t = e.target;
            while (t && t !== this && !(t.getAttribute && t.getAttribute("data-i"))) t = t.parentNode;
            if (t && t.getAttribute && t.getAttribute("data-i")) {
                cmdSel = parseInt(t.getAttribute("data-i"), 10) || 0;
                acceptCmd();
            }
        });
    }
    connectSSE();
    // 侧栏打开即按上次配置拉起 pi（配置为空则用 pi 全局默认模型），避免"pi 未启动"卡住新手
    fetch(BRIDGE + "/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) })
        .then(function () { syncDoc(true); })
        .catch(function () {});
    // 轮询文档切换（WPS 的 ApiEvent 覆盖不稳定，轮询最可靠）
    setInterval(function () { syncDoc(false); }, 2000);
    // 面板加载后静默跑一次能力探测，结果只写 bridge 日志（排错用，不打扰聊天区）
    setTimeout(function () { try { runProbe(true); } catch (e) {} }, 2500);
    // 打开侧栏就能直接打字：自动把焦点放到输入框
    setTimeout(function () { try { $("userInput").focus(); } catch (e) {} }, 400);
};
// reload-tick
