# WPS 加载项嵌入 pi agent —— 开发方案（v1.0，已定稿）

日期：2026-11-11　状态：**P0/P1/P2 完成，P3-Word 深化完成，P4-Word（图片/表格结构）完成，P5 技能与工具接入完成，P6 会话管理（新对话/历史/保存迁移）完成，P7 会话清理与历史工具痕迹完成 —— 已是可日常使用的自用工具**

> P0 结果（2026-11-11）：① wpsjs debug + 新版 publish 链路在本机 WPS 12.1.0.29690（含透明加密环境）加载任务窗格成功，信任一次后 authaddin.json 持久授权；② JSAPI 修订写回闭环验证成功（`doc.TrackRevisions=true` + Range.Text 写回出修订记录）；③ `pi --mode rpc --no-session --no-builtin-tools` 流式对话 14.6s 通。验证项目：`D:\DSH工作区\wps-pi-plugin\`（pi-assistant 加载项 + test-rpc.js）。坑：wpsjs create 是交互式的，在本 harness 里手动 copy `packages\@wps-jsapi\wps` 模板即可；wpsjs debug 不一定自动拉起 WPS，需手动启动 wps.exe。

> **P1 结果（2026-11-11，可用原型已跑通）**：任务窗格聊天 → 桥接 → pi → `wps-edits` JSON → JSAPI 修订写回，全链路真实 LLM 多轮验证通过。
> - 实测交互 1：光标停在段落上，输入「把这段文字改得更正式一些，像正式公文的语气」→ 自动附带当前段落（13 字）→ 文档变为修订「AI 智能助手现已正式接入 WPS 办公平台。」，面板显示「✓ 第1段: 调整为正式公文语气，表述更规范」。
> - 实测交互 2（多轮）：再输入「这段话再精简一些，控制在十五字以内」→ 修订为「AI 助手已接入 WPS。」，面板「✓ 第1段: 按要求精简至十五字以内」。
> - 接管标记实测：处理中 WPS 标签页变「〔AI〕文字文稿1」，完成后自动还原（前缀式，符合 WPS 12 标签从右截断的事实）。
> - 落点：`D:\DSH工作区\wps-pi-plugin\`（bridge.js 桥接、pi-assistant/ 加载项、doc-assistant-prompt.md 系统提示、start-bridge.cmd 一键启动、ui-helper.ps1 截图/点击辅助）。

> **P2 结果（2026-11-11，完成日常可用）**
> - **批注**：协议加第二类代码块 `wps-comments {"comments":[{"find","text"}]}`，侧栏 `doc.Comments.Add()` 落地。实测「给这句话加个批注…」→ 文档出现批注标记 + 面板「💬 第1段已加批注」。
> - **一键撤销**：`撤销上轮AI修订` 按钮，先按本轮修订区间逆序 `Revisions.Item(i).Reject()`，再按文本级 `replace→find` 反向还原兜底。
> - **会话持久化**：pi 用 `--session-dir sessions/`，`sessions-map.json` 存 docKey→sessionFile；桥接重启、WPS 重开都能续聊。`POST /context {docKey}` 返回历史，侧栏渲染在「以下是本文档之前的对话」分隔线内。
> - **生产模式加载（关键）**：**不再依赖 `wpsjs debug` 的 vite 开发服务**。bridge.js 直接静态托管 `pi-assistant/`（`http://127.0.0.1:3987/addin/`，含 `/.debugTemp/*` 空桩），`publish.xml` 指向该地址，WPS 启动即从桥接进程加载加载项。信任一次后持久。实测：重启 WPS → 信任框（127.0.0.1:3987/addin）→ 确定 → 「AI 助手」选项卡可用 → 打开侧栏 → 输入「把这句话改得更书面、更像正式报告的语气」→ 修订「本段文字用于测试生产模式下的加载功能。」+ 面板「✓ 第1段 … 本次新增修订 2 条」。
> - **开机自启**：启动文件夹快捷方式 `pi-assistant bridge.lnk` → `start-bridge.cmd`（幂等，最小化窗口）。
> - **WPS 两个新坑**：① 在已有修订范围内再次改写**不会新增修订条目**（改动并入旧修订），故撤销必须有文本级兜底；② 改完 Range 后 WPS 不主动重绘，需 `Selection.Range.Select()` 触发（`nudgeRepaint()`）。
> - 使用说明：`D:\DSH工作区\wps-pi-plugin\README.md`。

> **P3-Word 结果（2026-11-11，Word 端深化，用户指令「继续打磨 Word 文档」）**
> - **表格协作**：光标在表格内时，上下文自动升级为整表（`行内单元格以 | 分隔`，label「当前表格（N 行 × M 列）」）；改单元格用 `wps-edits`，加整行用新协议块 `wps-rows {"rows":[{"after":"锚点单元格","cells":[...]}]}`（`findCellByText` 定位 + `Rows.Add(下一行)` 插入）。实测：外洲备注「偏低→正常」出修订；「在李家渡后加一行 梅港 24.05 正常」→ 面板「＋ 已在第4行后插入新行」，文档出现新行。
> - **编辑协议 v2**：`wps-edits` 每条可带 `mode`：默认替换 / `insertAfter`（find 段落后另起一段）/ `delete`。实测 insertAfter：「在表后说明之后新增一段：复核人：陈鋆…」→ 面板「✓ 在第23段后插入新段落」，文档出现红字新段。
> - **多文档隔离**：未保存文档的 docKey 改用 `doc.Windows.Item(1).Hwnd`（`hwnd:xxx`，原先多个「文字文稿1」共用 `未命名:名字` 会串会话）；桥接 SSE 事件带 `docKey`，侧栏丢弃不属于当前文档的 delta/done。
> - **上下文增强**：`docStructure()` 附「N 个表格、N 条脚注、N 个公式、N 处未处理修订」；全文模式追加脚注文字（公式/脚注**只读**，写入仍未支持）。
> - **撤销改栈（多轮）**：`undoStack`（每轮一条，含 rev/edits/comments/rows），按钮显示「可撤销 N 轮」，支持 `Ctrl+Shift+Z`。**关键教训：不能用「按修订序号 Reject」回退**——WPS 会把相邻改动合并进同一条修订，序号区间被合并后会连带撤销其他轮次的改动（实测误删了上一轮插入的段落）。现改为纯文本级还原（按记录 replace→find 反向改字），删除类改动提示到「审阅」手动拒绝。
> - **prompt 收紧**：明确「新增整行只用 wps-rows、禁止用含 `|` 的整行文字当 find」「只有真给出代码块才能说已改好」「一个需求一个代码块」。
> - **新坑**：① WPS 任务窗格 webview 在同一 WPS 进程内**不随侧栏关闭/重开而重载**，改 taskpane.js 必须重启 WPS；② `authaddin.json` 里加载项条目一旦损坏（重复条目/旧 url），只能把该加载项条目从 `wps` 与 `namelist` 全删掉再让 WPS 重新弹信任框；③ 自动化向窗格 webview 合成鼠标点击按钮不生效（textarea 靠既有焦点仍可 `Ctrl+V`），发送用 `Ctrl+Enter`；④ 中文输入只能走剪贴板（SendKeys 会被中文 IME 吞）。

> **P4-Word 结果（2026-11-11，用户指令「2 和 3」= 插入图片/新表格 + 表格结构操作）**
> - **能力探测结论**：WPS 12.0 的 JSAPI 表格/图片 API 与 Word VBA 基本同构——`InlineShapes.AddPicture`、`Shapes.AddPicture`、`Tables.Add`、`Rows.Add`、`Columns.Add`、`Row/Column.Delete`、`Cell.Merge`、`Cell.Split`、`HeadingFormat`、`Rows.SetHeight`、`Columns.SetWidth`、`Cell.VerticalAlignment`、`tbl.Borders`、`tbl.Style`、`AutoFitBehavior` **全部存在可用，无需 COM 兜底**。探测写成 `runProbe(silent)`，onload 静默跑一次只写 `debug.log`。
> - **新协议块**：`wps-image {"images":[{"after":"锚点段落文字","path":"D:\\...\\x.png","width":12}]}`、`wps-tables {"tables":[{"after":"…","rows":3,"cols":3,"header":[...],"data":[[...]]}]}`、`wps-tableops {"ops":[{"op":"merge","from":"A","to":"B"}, …]}`，共 10 种 op（merge / split / insertColAfter / deleteRow / deleteCol / formatHeader / colWidth / rowHeight / repeatHeader / autoFit）。
> - **图片按比例缩放**：WPS 只设 `Width` 时**不会**自动调高（实测被拉变形）→ 先取 `ratio = Height/Width` 再显式补算另一边；实测「宽度 10 厘米」→「尺寸 10.0 × 6.2 cm」（640×400 原图比例正确）。
> - **结构改动不参与一键撤销**（`ensureTurn().struct` 计数），撤销按钮只回退文字/批注/加行；面板会提示「表格结构改动 N 处需在 WPS 里按 Ctrl+Z 逐步回退」。
> - **体验改进**：`ribbon.js` 的 `OnAddinLoad` 里 1.5s 后自动 `CreateTaskPane` + `Visible = true`——WPS 一启动侧栏就出来，不用再点「AI 助手 → 打开侧栏」。
> - **实测全部通过**（截图 screen205–screen221.png）：插图+新建表格一次两个代码块；插入列/表头加粗/列宽；合并单元格/表头跨页重复/按内容自适应；删除行/删除列；拆分单元格。均已目视核对文档实际变化。

> **P5 结果（2026-11-11，用户选择「B｜完整技能（含 bash）」）—— 技能与工具接入**
> - **背景**：原 buildArgs 带 `--no-builtin-tools --no-extensions --no-skills`（刻意禁用，怕 agent 绕过侧栏直接改盘）。用户问「能调用 Skill 吗」后给出四档方案（A 只读技能 / B 完整技能+bash / C 定向注入 SKILL.md / D 保持关闭），用户选 **B**。
> - **pi 技能机制（实测）**：`--skill <path>` 可重复、接受目录；`--tools/-t` 逗号白名单；内置工具 `bash/edit/find/grep/ls/powershell/read/write`。默认只扫 `~/.pi/agent/skills` 与 `<cwd>/.pi/skills`（`~/.agents/skills` 视为可信），**不扫 `~/.claude/skills`**，故必须显式 `--skill`。离线探针 `probe-skills.mjs`：`loadSkills()` 从 `~/.claude/skills` 载入 **43 个技能、0 诊断**，提示词约 15.9k 字符 ≈ 4.5k tokens；实际运行时叠加 pi 扩展自带技能，模型可见 **100+ 个**。
> - **新启动参数**：`--mode rpc --no-extensions --skill %USERPROFILE%\.claude\skills --tools read,bash,ls,find,grep --no-prompt-templates --no-themes --no-context-files --system-prompt doc-assistant-prompt.md --session-dir sessions`（去掉 `--no-builtin-tools`/`--no-skills`；**不含 write/edit**，文档改动仍只走 `wps-*` 指令块）。
> - **配置持久化**：新增 `bridge-config.json`（`loadCfg/saveCfg`），桥接重启后自动用上次 provider/model 拉起 pi；`/config` 三字段全空时不落盘（此时 pi 用 `~/.pi` 全局默认模型与凭据）。
> - **工具调用可见**：桥接转发 `tool_execution_start` 为 SSE `{type:"tool", name}`；侧栏在气泡里显示「⚙ 正在使用 bash …」，并留一条灰色「⚙ 调用工具：bash」痕迹；`message_start` 时重置累积文本（工具循环有多条 assistant 消息，避免多轮文本串成一段）。
> - **prompt 新增「工具与技能」节**：工具只用于「算、查、读」，**永远不用于改当前文档**；明令禁止用 bash 改 .docx/.xlsx、禁止调用 `docx-paragraph-polish`/`minimax-docx`/`office-*` 等**离线改磁盘副本**的技能（用户眼前这份不会变）；临时文件放 `tmp\`；一次任务工具调用 0～3 次。
> - **实测通过**：① `bash` 工具 → 回答 Node v22.23.1；② 技能清单可见（100+，含 datum-conversion / frequency-analysis / hydro-data-query / md-knowledge-search 等）；③ 真实技能链 `read → bash → ls → bash` 用 datum-conversion 查出「外洲站 85 基准面修正值 **-2.380 m**」；④ 侧栏端到端：`⚙ 调用工具：read/bash/bash` → 正确引用技能结论并生成 `wps-edits`，文档出修订；⑤ 多文档隔离仍生效（测试脚本 docKey 不同，输出不串进面板）。
> - **体验改进**：侧栏 `onload` 自动 `userInput.focus()`——打开就能直接打字（此前需先点一下输入框，而合成点击在 webview 里时灵时不灵）。
> - **能力边界提醒**：技能是「算/查」的放大器，不是「改文档」的替代；提示词与 README 都写死了这条，避免模型误用离线改文件技能。

> **P6 结果（2026-11-12，用户指令「按你的建议执行」）—— 会话管理**
> - **背景缺陷**：会话按 docKey 绑定（已保存=文件全路径，未保存=`hwnd:窗口句柄`），因此**新建文档先聊、后保存 = 换了键 = 历史失忆**；且一文档只有一条会话线，没有「新对话」和「历史」入口。
> - **映射表升级**：`sessions-map.json` 从 `docKey → 会话文件` 升级为 `docKey → { current, list:[...] }`，`docEntry()/setDocEntry()` 兼容旧扁平格式。
> - **新端点**：`POST /new-chat {docKey}`（`new_session` + `get_state` 取 sessionFile 登记为 current）、`GET /sessions?docKey=`（`sessionMeta()` 从 jsonl 第一条 user 消息取「【用户需求】」后 40 字作标题、mtime 作时间；当前会话排最前；**未落盘的空会话以 `exists:false` 返回，前端置灰不可点**）、`POST /switch-session {docKey,file}`（`switch_session` + 登记 + 返回历史）、`POST /migrate {from,to}`（把旧键的 list/current 合并进新键并删除旧键，返回 `moved`）。
> - **侧栏 UI**：`模型配置` 那一行右侧加三个链接「新对话 / 历史 / 诊断」；历史列表用 `.sessitem` 卡片（标题 + 时间 + 「当前对话」高亮 + 末条「← 返回当前对话」）；另加斜杠命令 `/new`、`/sessions`。
> - **保存即迁移**：`syncDoc()` 检测 `isTemp(prev) && !isTemp(k)`（`hwnd:`/`未命名:` → 真实路径）时先 `POST /migrate` 再 `POST /context`，成功后提示「已把保存前的对话接到本文档（N 条会话）」。
> - **实测通过**：API 层 `tmp/test-sessions.js`、`tmp/test-switch.js`（新对话 A → 发消息落盘 → 新对话 B → `/sessions` 列出 2 条且 B 标空 → 切回 A 返回 2 条历史 → current 指向 A → 清理）；UI 层（截图 `screen307-pane.png`~`screen310-pane.png`）「历史」列出「本文档共 1 条对话」→「新对话」清空并提示 → 再开「历史」显示「(空对话)·当前对话」+ 旧会话 → 点旧会话恢复历史并提示「已切到这条对话」。
> - **仍待真实场景确认**：「先聊后保存」的迁移链路只做了 API 级验证（真实保存对话框自动化成本高），逻辑为 `syncDoc` 轮询触发，用户实际保存时会有灰色提示条。

> **P7 结果（2026-11-12，用户指令「继续后面两下」）—— 会话清理 + 历史工具痕迹**
> - **会话清理**：`pruneSessions({days=30, keepPerDoc=20, dryRun})`（bridge.js）。保护所有文档的 `current` 会话；按 mtime 倒序，超出保留数 / 超过天数 / 文件已不存在的列为候选；非 dryRun 时 `unlinkSync` + 从映射表摘除 + 删 toolLog 条目，返回 `{candidates, deleted, freedKB}`。新端点 `POST /prune`；桥接启动时跑一次 dryRun 并把候选数写 debug.log（只演练不删）。
> - **侧栏交互**：历史列表底部「🧹 清理旧对话」→ 先 dryRun 报数量 → 内联「🧹 确认清理 N 条」卡片 → 点它才真删 → 列表刷新并在标题下显示「已清理 N 条，释放 X KB」。**不能用 `window.confirm`**：WPS webview 里模态框被吞，点了毫无反应（实测两次无任何变化）。
> - **历史工具痕迹**：新增 `tool-log.json`（`{会话文件: [{i: 第几条回复, tools:[...]}]}`），桥接在 `agent_end` 时按 `assistantIdx` 记账（只数有文字的回复，与 `historyFor` 过滤口径一致）；`/context`、`/switch-session` 返回 `tools`；侧栏 `renderHistory(msgs, tools)` 在对应 assistant 气泡下加灰字「⚙ 用过 bash、read」。实测重启 WPS 后历史里仍能看到该行。
> - **实测**：① `tmp\test-tools.js` 跑一次 bash 工具 → `/context` 返回 `tools=[{"i":0,"tools":["bash"]}]`；② 面板「历史 → 🧹 清理旧对话 → 确认清理 5 条」→ debug.log 记 `prune dryRun=true candidates=5` / `prune dryRun=false candidates=5 deleted=5`，列表从 4 条变 2 条（截图 screen333-pane.png、screen334-pane.png）。
> - **新坑**：① **PowerShell 的 `Invoke-RestMethod -Body` 传中文 docKey 会变乱码**（`D:\DSH?????\…`），会让桥接另建空会话并污染 `sessions-map.json` 的 current → 涉及中文路径的 HTTP 测试一律用 Node 脚本；② 截图/点击前必须确认 WPS 真的在前台（`GetForegroundWindow()` == WPS 的 `MainWindowHandle`），否则拍到的是 DSH 窗口、点击也打到 DSH；③ 窗格顶部链接坐标（1920×1080 最大化）：「新对话」≈1818、「历史」≈1850、「诊断」≈1890，y≈228。

## 0. 目标

把 pi agent 以 WPS 加载项（任务窗格聊天面板）形式嵌入 WPS，用户在文档旁边的侧栏与 agent 对话，agent 直接在**正打开的文档**上协作编辑（默认 Word，二期扩 Excel/PPT）。对标体验：Office Copilot 侧栏。

与现有 wps-office-cooperate skill 的关系：skill 是"DSH 宿主 → 外部 COM"路线，面向 agent 侧；本插件是"WPS 内嵌 UI → JSAPI 为主、COM 兜底"路线，面向用户侧，**不依赖 DSH**，同事电脑可直接用。两者共享业务逻辑（修订改写、锚点校验、快照回滚、接管标记）。

## 1. 已确认的环境事实

- pi 1.5.0 本机可用，原生支持 `--mode rpc`（JSON-RPC 流式）与 `-p` 非交互模式 → 桥接层走 **rpc 模式**，无需自造协议。
- WPS 加载项 = WebView 网页 + JSAPI（`wps.WpsApplication()` 等），支持自定义功能区 / 任务窗格 / Web 对话框三种交互，Windows/Linux 适配。
- ⚠️ **官方已确认**：WPS 个人版 12.1.0.16910 起，oem.ini / jsplugins.xml 本地部署方式被限制；开发调试需升级 wpsjs 后走 `wpsjs debug`，分发须 `wpsjs publish`（商店）或确认企业版策略。这是分发路线上的头号风险，第一阶段必须先验证。
- 官方 JSAPI 有 Revision 对象与修订接口（[Revisions](https://open.wps.cn/documents/app-integration-dev/docs-center/online-preview-edit/client/Word/Revisions)），但覆盖面需逐项核对（LaTeX 公式、脚注存疑）。
- 本机透明加密（Agile DGS）：WPS 进程在白名单内，加载项跑在 WPS 进程里，理论上比外部 COM 更干净，需实测落盘/读盘行为。

## 2. 总体架构

```
┌─ WPS (Writer) ────────────────────────────┐
│  功能区按钮「AI 助手」 + 任务窗格           │
│  ┌────────────────────────────┐           │
│  │ 加载项前端 (HTML/JS/WebView)│           │
│  │  · 聊天面板 UI              │           │
│  │  · 编辑指令渲染（diff/卡片） │           │
│  └──────┬─────────────┬───────┘           │
│         │ JSAPI       │ WebSocket          │
│  ┌──────▼──────┐ ┌────▼─────────────┐      │
│  │ 文档操作层   │ │ 桥接守护进程       │      │
│  │ (JSAPI 优先, │ │ (本地 Node 服务,  │◄─────┼── 本机 pi --mode rpc
│  │  COM 兜底)   │ │  会话管理/排队)   │      │    (子进程或常驻)
│  └─────────────┘ └──────────────────┘      │
└────────────────────────────────────────────┘
```

- **桥接守护进程**（Node，本地 127.0.0.1 端口）：管理 pi rpc 子进程生命周期、会话（每文档一个 pi session）、写操作串行队列（沿用 skill 的"写永远串行"结论）、向任务窗格广播流式输出。
- **文档操作层**：JSAPI 能做的（读文本/光标/选区、写修订、加批注、查替换）直接在前端调；JSAPI 缺口（如部分版式/公式操作）由守护进程回落调现有 COM daemon。
- **安全边界**：守护进程只监听 127.0.0.1；pi 侧用受限工具集（`--tools` 白名单禁 bash/write 直写文件，文档写入只经文档操作层），防止 agent 绕过 UI 直接改盘。

## 3. 分期计划

### P0 可行性验证（1–2 天）— 立即执行
1. `npm i -g wpsjs`（新版），`wpsjs debug` 加载最小 Hello 任务窗格 → 验证**本机 WPS 版本能否加载开发模式加载项**（含透明加密环境实测）。这是 go/no-go 门。
2. 任务窗格里 JSAPI 完成：读光标段落 → 改写 → 修订方式写回，端到端闭环。
3. `pi --mode rpc` 起子进程，从外部 Node 脚本完成一轮对话，确认协议细节（消息格式、流式、会话恢复）。

### P1 最小可用（约 1 周，P0 通过后）
- Word 端任务窗格聊天面板：发消息 → pi 流式回复 → pi 输出的编辑指令经文档操作层以**修订**写回。
- 插件侧配置界面（任务窗格设置页）：provider/model/API key，持久化到 PluginStorage，守护进程据此启动 pi。
- 编辑指令协议 v0：pi 用 system prompt 约束输出结构化指令（`{op: replace|insert|comment, anchor, text}`），锚点校验沿用 skill 的判据，失败报错不静默。
- 功能区按钮：开关侧栏、撤销本轮（对应 accept/reject 或 snapshot 回滚）。
- 接管标记：编辑时窗口标题/状态栏打 〔AI〕 标记（迁移 skill 现有方案）。

### P2 完整化（1–2 周）— 已完成
- ✔ 批注（`wps-comments` 协议 + `Comments.Add`）。
- ✔ 选区/段落上下文自动附带（下拉：选中/段落/全文/不附带，全文 6000 字上限）。
- ✔ 一键撤销本轮 AI 改动（修订 Reject + 文本级回滚兜底）。
- ✔ 会话持久化（每文档一条 pi session，重开文档可续聊）。
- ✔ 生产模式加载（bridge 静态托管 + publish.xml 指向，脱离 dev server）+ 开机自启。
- 未做：COM 兜底通道（P2 原计划项）——JSAPI 实测够用，缺口清单为空，暂不需要。

### P3 Word 端深化（已完成）
- ✔ 表格上下文自动附带（光标在表内→整表 TSV）+ 单元格改写 + `wps-rows` 加整行。
- ✔ 编辑协议 v2：`mode: replace | insertAfter | delete`。
- ✔ 未保存文档 docKey 用 Hwnd + SSE 事件带 docKey（多文档隔离）。
- ✔ 脚注/公式/表格/修订数量进上下文（只读）；全文模式追加脚注文字。
- ✔ 撤销改栈（多轮，文本级还原）+ Ctrl+Shift+Z。
- ✔ **P4（2026-11-11 完成）**：插入图片（`wps-image`，按原比例缩放）、新建表格（`wps-tables`，表头自动加粗居中）、表格结构（`wps-tableops` 10 种 op：merge/split/insertColAfter/deleteRow/deleteCol/formatHeader/colWidth/rowHeight/repeatHeader/autoFit）；WPS 启动自动打开侧栏。
- 待做：公式/脚注**写入**、域代码/页眉页脚、Excel/PPT 端。

### P4 三端与分发（后续）
- Excel/PPT 端复用同一守护进程，文档操作层各写一套。
- 分发定案：同事内网分发（publish 或企业部署，视 P0 结论）；可选商店发布。

## 4. 主要风险与预案

| # | 风险 | 等级 | 预案 |
|---|---|---|---|
| 1 | 个人版限制本地加载项部署，`wpsjs debug`/publish 政策变化 | **高** | P0 第一项先验证；不行则评估企业版/oem.ini 临时方案（官方留有替换文件通道）或转商店发布 |
| 2 | JSAPI 修订/公式/脚注能力缺口 | 中 | COM daemon 兜底，skill 现成逻辑直接搬 |
| 3 | pi rpc 协议不稳定（版本升级破坏） | 中 | 桥接层做版本探测 + 协议适配层 |
| 4 | agent 输出绕过 UI 直改文件 | 中 | pi 启动参数禁用 bash/write/edit 工具，只留对话 |
| 5 | 透明加密下加载项资源/落盘异常 | 低 | P0 实测；现有解密链路可兜底 |

## 5. 已定决策（2026-11-11 用户确认）

1. **首发端**：仅 Word 先做；Excel/PPT 列 P3。
2. **pi 交互定位**：文档编辑专助手——system prompt 收窄为文档编辑场景，回答尽量落到结构化编辑指令，行为可预期。
3. **模型配置**：插件侧独立配置界面——任务窗格提供 provider/model/API key 设置页，桥接守护进程读取后以 `--provider/--model/--api-key` 参数启动 pi rpc 子进程（不依赖 pi 全局配置）。
4. **分发目标**：先自用——P0 用最简加载方式验证即可，不追求合规分发；内网/商店发布留到后续按需评估。

## 6. 参考资料

- [WPS 加载项概述](http://qn.cache.wpscdn.cn/encs/doc/office_v19/topics/WPS%20%E9%9B%86%E6%88%90%E6%A8%A1%E5%BC%8F/WPS%20%E5%8A%A0%E8%BD%BD%E9%A1%B9%E5%BC%80%E5%8F%91/%E5%8A%A0%E8%BD%BD%E9%A1%B9%E6%A6%82%E8%BF%B0.html)（含 12.1.0.16910 部署限制说明）
- [JSAPI 功能接口列表](http://open.wps.cn/previous/docs/client/js-api/appendix/function-list)
- [Revision 对象](http://open.wps.cn/documents/app-integration-dev/wps365/client/wpsoffice/jsapi/wps/Revision/obj)、[修订 Revisions](https://open.wps.cn/documents/app-integration-dev/docs-center/online-preview-edit/client/Word/Revisions)
- 本仓库现有资产：`docs/borrow/`（dsh-office 借鉴台账）、三端 skill 源码（修订/锚点/快照逻辑）
