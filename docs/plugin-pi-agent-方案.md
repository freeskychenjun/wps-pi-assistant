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

### P8 取消上下文下拉、改为按需读文档（已完成 2026-11-12）
- 动机：旧版由面板在发送瞬间抓「选中/段落/表格/全文」，抓不到就**静默裸发**（用户选了整张表提问，agent 收到 0 字上下文，答"看不到表格"）。
- 做法 ①：面板**永远**附「光标处摘要」（文件名/规模/光标位置/所在段落或整表预览，≤1500 字）+ 结尾提示"其余内容用工具按需读取"；`ctxMode` 下拉已删除，`taskpane.html` 改为「自动读取文档 · 光标处摘要」。
- 做法 ②：新增 pi 扩展 `pi-doc-tools.js`（`pi -e` 加载，工具名加入 `TOOL_ALLOW`），注册三个**只读**工具 `doc_info` / `doc_read` / `doc_find`；调用链 = 工具 → `POST /docreq`（bridge 记 pending 并 SSE 广播）→ 面板用 WPS JSAPI 读 → `POST /docresult` 回传。另加 `POST /pane` 心跳（60s 未心跳快速失败"任务窗格未连接"）。
- 验证（2026-11-12 13:00–13:25 实测）：`doc_info` 概览、`doc_read what=table`（带行号+空单元格清单）、`doc_find` 0 命中后如实说"不在本文档"；**用户原始场景**（空单元格表 + "把空单元格补上"）agent 读表后列出 7 个空单元格并逐格给建议，未改文档。
- 已知限制：`doc_read` 单次返回默认 8000 字（`maxChars` 可到 30000，超长会明确提示"已截断，用 paragraphs 分段读"）；`doc_find` 是**子串精确匹配**（区分大小写，中文不受影响），搜的是**全文**（全部段落 + 全部表格单元格），返回每条命中截到 140 字、默认最多 10 条（`maxHits` 可到 50），不搜页眉页脚/文本框/批注/脚注；文档改动仍必须走面板修订写回。

### P9 合并单元格表可读 + 空单元格可按行列号写（已完成 2026-11-13）
- 动机（用户 2026-11-13 报）：读表能读到内容，但"填不进数据"——空单元格没有可 `find` 的文字锚点，旧协议（`wps-edits`/`wps-rows`/`wps-tableops`）全是锚点式，改不了空格子；同时合并单元格表整表读取直接报 `Cannot read properties of null (reading 'Cells')`（WPS 对合并表 `tbl.Rows.Item(r)` 返回 null），连带 `doc_find` 扫表也 500。
- 做法 ①（读）：新增 `tableGrid(tbl)`（优先枚举 `tbl.Range.Cells` 用 `Cell.RowIndex/ColumnIndex` 建 r,c→cell 映射，退回逐行 Cells）+ `rowCellsOf`/`tableCellText`；`readTable`/`findText`/`tableHeaderPreview`/`findCellByText` 全部改走网格：合并区显示「（合并）」，单表读失败只跳过该表不再让整次检索失败；回归样本 `test-p8-merged.docx`（`make-p8-merged.py`）。
- 做法 ②（写）：新增 `wps-cells` 代码块 `{"cells":[{"table":5,"row":5,"col":3,"text":"215"}]}` + `applyCells()`；`setCellText()` 只替换单元格正文、保留末尾「段落标记 + 单元格标记」，自动开修订，并记入 `undoStack[].cellWrites`；撤销时按行列号把原值写回（实测可干净回到空格子）。
- 踩坑：WPS 的 `cell.Range.Text` 会带上单元格标记 `\u0007`，但 `Range.End` 不含它 → 按文本长度算截断位会少删一位（撤销后残留"3"这种尾巴）；修法 = `cut` 按 `Range.End - Range.Start` 与文本长度之差校正。另一个坑：面板 webview 不能热重载——关侧栏重开无效，必须**重启 WPS 进程**（`htmlVer` 从 p9→p10 才算生效）。
- 验证（2026-11-13 09:00–09:25）：合并表 info/读表/检索全部 ok；真实 UI 路径（整表选中 → "把第 5 行五个空单元格填上"）agent 调 `doc_read` + 输出 `wps-cells`，5 格写入成功（213/165/155/131/114，红色修订），Ctrl+Shift+Z 撤销后 5 格干净回到空。
- 调试入口：`/docreq` 额外支持 `dev_cell`（转储单元格文本/范围/修订）、`dev_cells`（直接跑 applyCells）、`dev_undo`（跑撤销），仅供本机回归脚本 `test-cells.js` 使用。

### P11 面向分发的安装与打包（已完成 2026-11-13）
- 动机（用户 2026-11-13 提）：插件要分发给同事安装，但 system prompt / README / 脚本里写死了开发机路径 `D:\DSH工作区\wps-pi-plugin`；且加载项注册要手改 `publish.xml`、发布包不该带 71 MB 的 `node_modules`。
- 去硬编码：prompt 里 bash 工作目录改为"当前工作目录"表述、临时文件约定改成相对路径 `tmp\`；`bridge.js` 启动时自动创建 `tmp/`；`make-*.py` 产物保存到脚本自身目录（`os.path.dirname(__file__)`）；`ui-helper.ps1` 截图默认 `$PSScriptRoot\shot.png`；README 命令改 `<插件所在目录>` 占位。另修：`--skill` 目录不存在时不再传给 pi（同事机器没装 DSH 技能也能启动）。
- `install-addin.ps1`：写 `%APPDATA%\kingsoft\wps\jsaddons\publish.xml`，幂等合并 `<jspluginonline name="pi-assistant" url="http://127.0.0.1:3987/addin/" enable="enable_dev"/>`，写前备份（保留 5 个 `.bak`），保留别人已注册的加载项；支持 `-DryRun` / `-Remove` / `-Url`。`install-addin.cmd` 是双击入口（注册完顺手 `start-bridge.cmd`）。
- `pack-release.ps1`：白名单收集生产文件 → `dist\wps-pi-assistant-v<版本>.zip`（22 文件 / 约 70 KB），排除 `pi-assistant/node_modules`、`package*.json`、`vite.config.js`、`sessions/`、`tmp/`、测试样本、日志、`bridge-config.json`；内置自检（关键文件齐、敏感文件未混入）。
- 踩坑：① PowerShell 5.1 按 ANSI 读**无 BOM** 脚本，中文注释/字符串会解析失败 → 分发脚本一律纯 ASCII；② `XmlElement.Name` 在 PowerShell 里会被解析成 `name` **属性**（大小写不敏感），判断元素名要用 `LocalName`（否则会把已有注册误判为"新增"）；③ 读取 `publish.xml` 必须用 `XmlWriter` 写 UTF-8 无 BOM，保持 WPS 能读。
- 验证：`-DryRun` 三种分支（已注册/改地址/移除）输出正确；真实写入+备份+幂等+移除路径在备份保护下验证后已恢复原 `publish.xml`；发布包解压到空目录后能独立启动 bridge、`/health` ok、`/addin/ui/taskpane.html` 与 `/addin/js/taskpane.js` 正常返回（生产托管不依赖 node_modules）。

### P12 大文档写入/撤销提速：不再「卡死」（已完成 2026-11-13）
- 现场（用户 2026-11-13 报）：在 4081 段、13 表的设计报告上让 agent 查全文标点，回复给出 29 条 `wps-edits` + 4 条批注。面板应用期间 WPS 单核 100%、界面几分钟不响应，用户以为文档卡死。取证：文档其实没死，68 条修订 + 4 条批注都已写入内存（后来 Ctrl+S 落盘 879941 B），只是同步 COM 循环把 UI 线程占满。
- 根因：`applyEdits` 对**每条** `find` 都 `for p=1..Paragraphs.Count` 全篇扫描（29 条 × 4081 段 ≈ 12 万次 COM 往返）；`undoLastTurn` 的文本级还原同样对每条记录全篇 `indexOf`，撤销时又卡几分钟。
- 修法（`pi-assistant/js/taskpane.js`）：① `applyEdits` 先 `buildParaTexts(doc)` 一次读全篇段落文字，之后在本地数组里找命中段，只对命中处 `paraRangeAt()` 实时取 Range 再改；`ScreenUpdating=false`；120 秒硬超时保护；结束打印「共写入 N 处，耗时 X 秒」并 `bridgeLog`。② done 处理改成先 `setStatus("正在写入文档…")` + 大改时插一条「正在把 N 处修订写进文档…」提示，再 `setTimeout(..., 60)` 进 `finishTurn(b)`，让界面先渲染出提示。③ `undoLastTurn` 优先走 **WPS 原生「拒绝本轮修订」**（`ent.rev.from` 之前的条数保持不变，从最后一条往前 `Reject()`，最多 900 次），文字精确还原、不留残留修订；只有拒绝失败（WPS 合并了修订、条数对不上）才退回文本级还原（现在也改为一次读全篇 + 用 applyEdits 记录的 `para`/`paraText` 整段写回）。
- 关键坑：① WPS 开着修订时 `Range.Text` **把被替换掉的旧文字也留在文本流里**（第 17 段能同时看到「1953～2021」和「1953~2021」），所以不能缓存段落起始偏移，每条命中必须实时读段落 Start；② 撤销若在修订打开状态下做「反向替换」，反向替换本身又会被记成新修订（实测 68→74 条、文字越改越长）→ 撤销期间必须 `doc.TrackRevisions = false`；③ 文本级还原后 WPS 会留下零散修订壳（实测剩 19 条孤零零的 `)`），最终改为「首选拒绝修订」后彻底消失。
- 验证：`tmp\p12-perf.docx`（用户原稿副本，4081 段/13 表），`dev_apply` 35 条实测 **8.0～9.0 秒**（旧实现约 5 分钟），`dev_undo` **约 1.0～1.2 秒**、撤销后 `revisions=0`、全文 31516 字符与原稿一致、表格 2 表头「均值 (m3/s)」无重复括号；另有 mock 测试 `test-apply-perf.js`（11 个用例，含模拟「修订时旧文字保留」的 revKeep 模式，新旧实现最终文本完全一致）。
- 调试入口（`handleDocReq`，仅本机脚本用）：`dev_apply`（beginTurn→applyEdits→endTurn）、`dev_revs`（列出全部修订的 type/range/text）、`dev_undo`。

### P13 面板回复按 Markdown 渲染（已完成 2026-11-13）
- 用户反馈：右侧面板里 agent 的回复出现大量 `**` 星号，粗体/列表/表格没排版。
- 根因：`addMsg()` 一律 `textContent = text`（纯文本）；流式与收尾也都是 `textContent`，面板从没做过 Markdown 渲染。
- 修法（`pi-assistant/js/taskpane.js` + `ui/taskpane.html`）：① `addMsg` 里只对 `cls === "ai"` 走 `mdToHtml()` 写入 `innerHTML`（用户/sys/edit 消息仍纯文本，避免把用户写的 `**` 误当语法）；② 新增**无第三方依赖**的轻量渲染器：先 `escHtml` 再解析，支持围栏代码块、表头+`|---|` 分隔行的表格、`#`~`######` 标题（层级 +2，最多 h6）、`---`/`***` 分隔线、有序/无序列表、`>` 引用、段落与 `<br>`，行内支持行内代码、`**粗体**`/`__粗体__`、`*斜体*`（带边界判断，避免把 `m*3` 之类误判）、`[文字](http(s)://…)` 链接（`target=_blank rel=noreferrer`）；③ 流式阶段仍是纯文本预览，`done` 时整段重排一次（`aiDiv.className="msg ai md"; innerHTML=mdToHtml(clb.clean)`）；④ CSS 给 `.msg.md` 关掉 `white-space: pre-wrap`，为 p/ul/ol/li/code/pre/table/th/td/blockquote/hr/a 补样式（代码块底色 `#f6f8fa`、`max-height:260px` 可滚，表格细边框、表头灰底）。
- 验证：① node 单测（从 taskpane.js 切出 `escHtml/mdInline/mdToHtml` 用 `new Function` 跑）——标题/粗体/斜体/行内代码/链接/表格/代码块/引用/有序列表全部正确出标签，去掉标签后**星号残留 0**；② 真机实测（WPS 12.1.0.29690，面板 `dom.htmlVer = p20`）：发一条 Markdown 密集型测试提示，面板里二级标题加粗、粗体/斜体/行内代码/链接、三条要点列表、两行表格（带边框）、python 代码块、引用全部正常显示，无星号。
- 备注：流式输出阶段（还没结束）仍是纯文本，结束时才重排成 Markdown；历史对话加载走同一个 `addMsg`，所以旧消息也会被重新渲染。

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

### P14 面板模型下拉：从 pi 已配置的模型里选（已完成 2026-11-13）

**动机**：用户在面板里选模型要手填 provider/model/API Key，不方便；希望像 pi web 那样有个列表，从"已经配好的模型"里挑。

**做法**：
1. bridge 新增 `GET /models`：读 `~/.pi/agent/auth.json` 判断哪些 provider 已配 key，再跑 `pi --list-models`（5 分钟缓存，`?force=1` 强制刷新）解析出 provider/model/context/maxOut/thinking/images，已配置 provider 排前面，返回给面板；
2. 面板顶部「▸ 模型」展开后是一个按 provider 分组的 `<select>`（组名标 `（已配置）/（未配置）`，选项文本 `model · context · 推理 · 图片`），后面是「应用」「↻」；下方保留折叠的「自定义 provider / model / API Key」旧入口；
3. 点「应用」→ `POST /config {provider,model}` → 桥接重启 pi 子进程；选「（跟随 pi 默认模型）」则发空配置，回到 pi 默认；
4. 标题右侧常驻「当前：模型名」（`GET /health` 每 15 秒同步一次），选择同时写 WPS PluginStorage 与 bridge-config.json。

**踩坑**：
- 面板 onload 原来会把 PluginStorage 里的配置（可能为空）无条件 POST 给 /config，导致**重启 WPS 后模型被重置成 pi 默认**；改为"本地有配置才推，否则沿用桥接已保存的配置"。
- 面板 JS 报错原先完全静默（表现是"一直停在连接中"）——本次曾因编辑时误删 `loadModels()` 触发；现已加 `window.onerror` / `unhandledrejection` 钩子，写 `JS-ERROR …` 到 debug.log。
- UI 自动化：旧脚本用 ALT 解锁前台会打开 WPS 菜单、后续点击被菜单吞掉；改用 `AttachThreadInput + SetForegroundWindow` 后点击/按键才可靠。截图预览 1708×961 与实际 1920×1080 有 1.124 倍率，量坐标要用裁剪放大图。

**验证**：/models 返回 46 个模型、5 个 provider（4 个已配置）；面板点开下拉正常；选 deepseek-v4-pro 点「应用」→ /health model=deepseek-v4-pro、标签变「当前：deepseek-v4-pro」；重启 WPS 后仍是该模型；选「（跟随 pi 默认模型）」→ /health model=null。

### P15 回复里的 wps-* 指令块折叠（方案 A，已完成 2026-11-13）

**动机**：用户问「面板显示的 agent 消息详简程度是否合适」。抽样发现：过程独白（34~56 字）与结论都合适，但批量修订时 35 条 edits 的 JSON 原样刷在聊天区占两三屏，是唯一真实缺点。用户拍板「按方案 a 修改」= 结论照旧 + 指令块折叠成一行，点开可查（保留留底功能，不选"完全不显示"的方案 B）。

**做法**（全部在 taskpane.js/html）：
1. `parseBlock` 增加 `raw` 字段（命中围栏的原始 JSON 文本），8 个 parse* 包装器（edits/comments/rows/images/tables/ops/paras/cells）透传 raw；
2. done 处理器构造 `b.blocks = [{tag,name,items,raw}×8]`；
3. 新增 `lastAiBubble()`（取 #chatBox 最后一个 .msg.ai）与 `addBlockDisclosure(aiDiv, parts)`：有命中时往气泡追加 `<details class="blkfold">`，summary 一行「⚙ 指令明细（修订 35 条、批注 4 条）— 点开查看」，展开是灰底 `<pre class="blkraw">` 放原始 ```wps-* 块（max-height 220px 可滚动）；全部为空则不加；
4. finishTurn 末尾（endTurn 前）调用；CSS 加 .blkfold/.blkraw；面板 ver → p25。

**踩坑**：第一次实测折叠没生效——原因是多步补丁脚本中途 exit 时，`var b = {...}` 挂 `blocks` 数组的那次替换只改在内存、从未写盘（前两版脚本在 t2 MISS 后 exit(1)，第三版重写时把这段漏了）。教训：**多步字符串补丁每步成功后立即写盘并校验**，不要把两处修改攒在一个脚本里。排查手段：对比 served JS 与本地文件、检查 `blocks: [` 是否存在。

**验证**：node mock 单测（parseEdits raw=65 字、summary 文案「⚙ 指令明细（修订 2 条、批注 1 条）— 点开查看」、空块不加）；真机 WPS + test-p8-merged.docx：让 agent 填第 5 行第 5/6 列（155/131）→ 气泡 = 一句话结论 + 折叠行「⚙ 指令明细（填单元格 2 条）— 点开查看」+ ✎ 两条写入报告；点击折叠行展开原始 wps-cells JSON（灰底、可横向滚动），再点收起。文档未保存即恢复干净样本。

### P16 页眉页脚 / 页面设置 / 段落格式：补齐排版写入（已完成 2026-11-13）

**动机**：用户问「写这一侧现在具备哪些能力，例如可不可以修改页眉页脚？」。盘点后确认页眉页脚、页面设置、字体段落格式三块都是盲区（只能 doc_eval 读、不能写），用户随即要求「补页眉页脚设置、排版相关的能力」。

**做法**：
1. 读：`readLayout()` 遍历 `doc.Sections`，输出每节纸型/方向/页边距/页眉页脚距/分栏 + 六种页眉页脚文字（`Headers/Footers.Item(1|2|3)`，`Exists===false` 跳过，含域标「（含域/页码）」）；`hfPlainText()` 把域字符 `\u0013…\u0014` 归一成「[域]」；`doc_read what="layout"` 暴露给 agent。
2. 写（三条新代码块，均开修订）：
   - `wps-headerfooter`：`HF_PARTS` 把 header/footer/firstHeader/firstFooter/evenHeader/evenFooter 映射到 `Headers|Footers` 集合的第 1/2/3 项；`replaceInStory()` 用 `Range.Find` 命中后整段改写，失败退回 `indexOf + SetRange`；支持 `text` 整段改写与 `section` 指定节；累计 `ensureTurn().hfWrites`。
   - `wps-page`：`PAPER_CM` 纸型表 + margins/headerDistance/footerDistance/columns；**先设 Orientation、再显式写 PageWidth/PageHeight**（见踩坑）。
   - `wps-format`：定位优先级 `find` > `paras` > `scope`（body 跳过表格内段落与 /^(标题|Heading)/ 样式，`includeHeadings` 可放开）；字体（Name+NameFarEast/size/bold/italic/underline/color→BGR）、段落（align、spaceBefore/After、lineSpacing 五种 Rule、CharacterUnitFirstLineIndent、左右缩进、outlineLevel）；`ScreenUpdating=false` + 90 秒超时保护。
3. 解析与渲染：`parseHFs/parsePages/parseFormats` 接入 done 处理链（clb→hfb→pgb→fmb），blocks 数组扩到 11 类（折叠行会显示「页眉页脚/页面设置/格式」条目），`finishTurn` 依次 apply 并 push 到「已完成」摘要。
4. 调试入口：`handleDocReq` 加 `kind="dev_apply"`（把一段回复文本按正式链路跑一遍），仅本机回归脚本用。

**踩坑**：
- **WPS 换方向不换尺寸**：先写 `PageWidth/PageHeight` 再设 `Orientation`，WPS 会把尺寸按旧方向旋转，结果 `Orientation=0(纵向)` 但宽高仍是 29.7×21（A4 横放）。改成「先设方向 → 按目标纸型与方向算出短边×长边 → 最后显式写死 PageWidth/PageHeight」，并让 `readLayout` 在方向标记与宽高矛盾时**以实际宽高为准**。
- 页眉页脚 `Range.Text` 结尾带 `\r`，`replaceInStory` 里不能整段 `Text=` 之后再拼，否则会多出空段；改用 `Find` 替换命中处。
- 原型用 `node -e` 传含中文与双引号的字符串时，PowerShell 会吞引号 / 破坏编码（生成物变成 `{" formats:...`）→ 测试脚本一律写成 `tmp\*.js` 再 `node` 执行。
- 面板代码改了必须**重启 WPS 进程**（p27→p28→p29 均如此）；`CloseMainWindow()` 只关窗口、进程还在，重开文档不会重载 webview，要 `Stop-Process` 全部 wps 后重开。

**验证**（test-layout.docx：A4 纵向、页眉「…（送审稿）」、页脚「某某分院　2026 年 11 月」、3 段正文 + 3×3 表）：
- 读：`doc_read what=layout` 返回 1 节 + 纸型/方向/页边距/页眉页脚距 + 页眉页脚文字。
- 写（dev_apply 直测，等价正式链路）：页眉「送审稿」→「报批稿」、页脚「2026 年 11 月」→「2026 年 12 月」（`doc.Revisions.Count` 由 0→4）；A3 横排 + 页边距 2/2/2.5/2.5 → 42.00×29.70；A4 纵向 2.5 边距 → 21.00×29.70（修完后正确）；`wps-format` body 仿宋_GB2312 12pt + 两端对齐 + 1.5 倍行距 + 首行缩进 2 字 → 第 2/3/4/17 段全部生效，标题与表格未动；锚点段黑体 14pt 加粗生效。
- 写（真实 agent 路径，经 /prompt → agent 输出代码块 → 面板执行）：①「把页眉里的「报批稿」改成「审定稿」，页脚改成…」→ agent 先 `doc_read what=layout`，判断页脚已是目标文本只改页眉，输出 `wps-headerfooter`，文档页眉变「（审定稿）」；②「正文统一仿宋小四、两端对齐、1.5 倍行距、首行缩进 2 字」→ 输出 `wps-format`，重置为宋体五号后再跑，确认 4 段全部改回目标格式；③「页面改成 A4 纵向、页边距 2.5」→ 输出 `wps-page`，实测 21.00×29.70、四边 2.50（首测暴露方向/尺寸错位 bug，修后复测通过）。

### P17 开机自启（登录计划任务 + 无窗口启动器）（已完成 2026-11-13）

**动机**：分发给同事后，桥接是面板的前提；之前流程是「双击 install-addin.cmd 起一次」，重启电脑就失效，非技术同事很难自查（面板只显示「桥接未运行」）。

**做法**：
1. `install-addin.ps1` 增加 `-NoAutostart` 开关（默认建任务），安装时探测 `node` / `pi` 并在控制台给出前置缺失提示；把 `node` 绝对路径写进 `node-path.txt`（gitignore）。
2. 创建**登录时**计划任务 `WPSPiAssistantBridge`：`schtasks /Create /F /SC ONLOGON /RL LIMITED /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File <dir>\bridge-autostart.ps1"`。
3. 新文件 `bridge-autostart.ps1`（纯 ASCII）：读 `node-path.txt` → `Set-Location` 到插件目录 → `& node bridge.js` **前台等待**。等桥接是因为 **Task Scheduler 在任务主进程退出时会杀掉整棵进程树**；等待让它保持存活（任务状态显示「正在运行」属正常）。
4. 面板兜底：SSE `onerror` 时除了把角标改成「桥接未运行」，还在对话里提示一次「双击 start-bridge.cmd / 自启是否在跑」，恢复后自动重连。
5. `bridge.js` 补 `server.on("error")`：端口被占（EADDRINUSE）写 `debug.log` 并 `exit(1)`，避免自启场景静默崩掉。
6. `-Remove` 时 `schtasks /Delete` 一并删除任务；发布包白名单加入 `bridge-autostart.ps1`。

**踩坑**：
- 最初用 VBS 包一层（`wscript bridge-hidden.vbs` → `Shell.Run(cmd,0,False)`）→ 任务日志显示桥接起过又消失：任务主进程（wscript）立即退出，Windows 把整棵进程树杀掉。改为 PowerShell 前台等待后解决。
- `.vbs` 被 VBScript 引擎按 **ANSI** 读取，文件里不能有中文（本机路径里的中文写进脚本会变成"路径未找到"）；教训：自启链路一律纯 ASCII + 文件内不硬编码中文路径，路径用 `$PSScriptRoot` 推导。
- `schtasks /TR` 的引号在 PowerShell 里要拼 `[char]34`，否则会写成 `wscript.exe \ path \`。

**验证**（本机真机）：
- `install-addin.cmd -DryRun`：前置检查打印 node/pi 路径；`[6/6]` 打印将创建的任务命令。
- 实际创建任务后 `schtasks /Query /V` 显示 `Task To Run: powershell.exe ... -File <dir>\bridge-autostart.ps1`、`Schedule Type: At logon time`。
- 杀掉现有桥接 → `schtasks /Run` → 8 秒后 `/health` 返回 `ok:true piRunning:true`，进程列表只有 1 个 `node bridge.js`，**没有可见的控制台窗口**，`tmp\autostart.log` 记录启动行。
- 重复触发任务：Windows 报「任务当前正在运行」，进程数仍为 1（幂等）。
- 端口冲突：手动再起一个 `node bridge.js` → 进程 3 秒内以退出码 1 结束，`debug.log` 记 `bridge-listen-error EADDRINUSE ...`。
- `install-addin.ps1 -Remove -DryRun` 输出 `would delete task: WPSPiAssistantBridge`。

### P18 装机可靠性：S4U 自启 + 看门狗 + 诚实的启动/连接反馈（已完成 2026-11-13）

**动机**：同事在一台笔记本上装 v0.2.9 的实测报告（桌面《pi-assistant_安装踩坑与改进建议》）指出：注册/信任/资源全都正常，但「看不到 AI 助手选项卡」的根因是**桥接没在跑，而 WPS 静默跳过加载**；更麻烦的是桥接会「用十几分钟自己没了」。

**根因（有退出码铁证）**：任务 `LastTaskResult = 3221225786 = 0xC000013A = STATUS_CONTROL_C_EXIT`。三层排掉：

1. `cmd /c start ...` 派生：cmd 退出后 node 作为孙进程被任务计划器回收；
2. 改成 Action 直接跑 `node.exe` 仍会死——Principal 是 Interactive 时 node 挂着控制台，控制台被关即收到 CTRL_CLOSE；
3. 改 **S4U**（`New-ScheduledTaskPrincipal -LogonType S4U`）后进程 `SessionId=0`，没有可被关闭的控制台，稳定存活（跨会话 TCP 回环正常，面板 3 条 ESTABLISHED）。

**做法**：

1. `install-addin.ps1` 的 [6/6] 改为 `Register-ScheduledTask`：Action = `node.exe "bridge.js"` + `-WorkingDirectory`（bridge.js 依赖 cwd）、AtLogOn 触发、`-ExecutionTimeLimit 0`（不限时）、`-MultipleInstances IgnoreNew`、`-RestartCount 999 / -RestartInterval 1min`、Principal = S4U / Limited。
2. 新增 `watch-bridge.cmd`（纯 ASCII）：node 探测 3987，不通就 `schtasks /run` 主任务并写 `bridge-watchdog.log`；安装时注册 `WPSPiAssistantBridgeWatchdog`（`/sc minute /mo 1`）。理由是任务设置里的「失败重启」只在任务判失败时生效，进程被杀属于"正常结束"，兜不住。
3. `start-bridge.cmd` 重写：`where node` 前置检查；启动后**每 0.4 秒真探测端口、最多 6 秒**，成功才打印 started，失败打印 FAILED + 排查方向并 `pause`（旧版会谎报成功）；子进程输出重定向到 `bridge.log`（旧版 `start ... cmd /c node` 会让父进程的 stdout 管道一直挂着，被上层脚本调用时看起来"卡住"；且崩了没日志）。
4. `bridge.js` 补 `process.on("uncaughtException")` / `process.on("unhandledRejection")` → 写 `debug.log` + `bridge.log`，不再整进程静默退出。
5. 面板（ver p31）：徽标三态（红「桥接未运行」/ 黄「待配置模型」或「pi 未启动」/ 绿「已连接」），数据来自 `/health`；`es.onopen` 里**补发一次 `/config`**（`/config` 原本只在页面加载时发，桥接重启后 pi 不会被拉起，徽标却是绿的）；`es.onerror` 里顺手 `setTitleMark(false)`，修「断线时标题〔AI〕前缀不还原」。
6. `install-addin.ps1` 末尾自检：TCP 连一次 3987，不通就黄色告警「WPS 会静默跳过加载项」；安装完成的下一步文案加上「先在任务管理器结束所有 wps.exe」。

**验证**：

- `schtasks /Query /V`：`LogonType: S4U`、`Task To Run: node.exe "bridge.js"`、`WorkingDirectory: <插件目录>`、Watchdog 为每分钟触发器；
- 起任务后 node `SessionId=0`，`/health ok:true`；
- 故障注入：强杀桥接 → 看门狗 15 秒内拉起（`bridge-watchdog.log` 有记录）、新进程仍 SessionId=0、`/health` 恢复；
- `start-bridge.cmd`：已在跑→`already running`；停掉后启动→`bridge started`，`bridge.log` 有 `bridge listening on 127.0.0.1:3987`；把 `bridge.js` 改名模拟启动失败→打印 FAILED 且 `exit /b 1`；去掉 PATH 里的 node→提示 Node.js not found。

**p31 面板实测（2026-11-14 00:05-00:10，test-layout.docx，WPS 12.1.0.29690）**：

- 重启 WPS 后 `dom.htmlVer = p31`，WPS 控制台无新 `JS-ERROR` 行（旧的 `cfg is not defined` 已由 `getCfg()` 修复：`cfg` 原本是 `window.onload` 里的局部变量，全局辅助函数读不到）；
- 强杀桥接：徽标 6 秒内变红「桥接未运行」，聊天区出现一条指引消息（双击 start-bridge.cmd / 自启会自动起 / 恢复后自动重连）；
- 看门狗 30–42 秒内拉起新进程（`bridge-watchdog.log` 有记录、新进程 SessionId=0），面板 `EventSource` 自动重连、徽标回到绿色「已连接」，**无需重启 WPS**；
- 徽标三态的数据源是 `/health`（`piRunning`），不再靠 `onopen` 无脑写绿；`es.onopen` 里补发 `/config`（仅当本机 PluginStorage 里有配置时才发；桥接侧 `/config` 会写 `debug.log` 的 `config provider=… model=…` 行，便于排查）。

### P19 手动启动不再弹控制台窗口（已完成 2026-11-14）

**问题（用户报告）**：双击 `start-bridge.cmd`（或它被 `install-addin.cmd` 调用）后，屏幕上留下一个 cmd 窗口，内容是 `bridge listening on 127.0.0.1:3987` / `[bridge] auto-start pi: …`，关掉它桥接就跟着退出了。

**根因**：旧版用 `start "pi-bridge" /min cmd /c "node bridge.js >> bridge.log 2>&1"` —— `start` 只是让窗口**最小化**，窗口仍然存在、且是桥接的控制台；node 的 stdout 也直接打在这个窗口里。加 `/b` 或 `start "" /min` 都不能真正隐藏（仍会创建控制台）。

**做法**：
- 新增 `start-bridge.ps1`（纯 ASCII）：`Start-Process -FilePath cmd.exe -ArgumentList '/d /s /c "node bridge.js >> bridge.log 2>&1"' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden` —— 以 `SW_HIDE` 创建进程，node 继承的是一个**隐藏**控制台，屏幕上不会出现窗口；输出照旧落 `bridge.log`。
- `start-bridge.cmd` 改为调用它（`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-bridge.ps1" %*`），探测端口与 FAILED 提示逻辑不变；新增 `-Show` 开关（透传给 ps1）用于调试时开可见窗口。
- 用 `$PSScriptRoot` 传目录，避免含中文的路径经过 cmd.exe 被编码搞坏。
- `pack-release.ps1` 白名单加 `start-bridge.ps1`。

**踩坑**：`if errorlevel 1 ( ... echo ... (start-bridge.ps1) ... )` 里的括号会被 cmd 当成块的结束符，报 `. was unexpected at this time.`（整段解析失败、退出码 255）→ 括号内的 echo 文案不能出现半角 `(` `)`。

**验证**：杀掉桥接 → `cmd /c start-bridge.cmd` → 输出 `bridge started`、退出码 0、`/health ok:true piRunning:true`，窗口枚举里**没有**任何 bridge/cmd 窗口；`start-bridge.cmd -Show` 才会弹可见窗口；看门狗/S4U 自启本来就不产生窗口。
### P20 看门狗任务也改成 S4U（顺便消掉每分钟的黑窗闪烁）（已完成 2026-11-14）

**问题**：P18 里看门狗任务是用 `schtasks /Create /SC MINUTE` 建的，默认 `LogonType = InteractiveToken`。任务每分钟跑一次 `cmd /c watch-bridge.cmd`，在**已登录会话**里执行 → 屏幕上会闪一下控制台窗口（桥接没挂时也一样，因为探针每分钟都跑）。电池策略也随默认值变成「用电池时不启动」，笔记本拔电就看门狗失效。

**做法**：`install-addin.ps1` 里看门狗改用 `Register-ScheduledTask`：
- Action：`cmd.exe /c "<插件目录>\watch-bridge.cmd"`（带 `-WorkingDirectory`，`.cmd` 交给 cmd 执行更稳）；
- Trigger：`New-ScheduledTaskTrigger -Once -At (now+1min) -RepetitionInterval (1 分钟)`（不传 `-RepetitionDuration` = 无限重复）；
- Settings：`-AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit 0 -MultipleInstances IgnoreNew`；
- Principal：与主任务同一个 **S4U** 主体（会话 0，无窗口）。

**验证**（本机实测）：
- `Export-ScheduledTask` 显示 watchdog `LogonType: S4U`、`Command: cmd.exe`、`Arguments: /c "<插件目录>\watch-bridge.cmd"`、`DisallowStartIfOnBatteries: false`、重复间隔 `PT1M`；
- 杀掉桥接 → `schtasks /Run /TN WPSPiAssistantBridgeWatchdog` → **4 秒**后 `/health ok:true`，新桥接 `session=0`，窗口枚举里 0 个 bridge/cmd 窗口；
- `install-addin.ps1` 全量重跑：`publish.xml untouched`（幂等），两个任务重建成功，`[7/7] bridge check: listening`；
- 桥接 pi 自动拉起：`piRunning=true, model=deepseek-flash`。

> 结论：想升级到本版不必「重装插件」，`install-addin.cmd` 本身是幂等的（注册项不变时会打印 `publish.xml untouched`），只要重跑它让两个计划任务按新定义重建即可。

### P21 自启任务不再弹终端窗口（隐藏启动器）（已完成 2026-11-14）

**问题（用户两次报告）**：开机/任务重启桥接后，桌面上弹出一个 Windows Terminal 窗口，内容是
`bridge listening on 127.0.0.1:3987` / `[bridge] auto-start pi: …`；关掉它桥接就跟着退出。

**定位过程**：
- 窗口类名 `CASCADIA_HOSTING_WINDOW_CLASS`、标题 `pi`，内容正是桥接的控制台输出；
- 手动 `start-bridge.cmd`（v0.2.12 的隐藏路径）复跑 → `/health` 正常且**零可见窗口** → 手动路径没问题；
- `schtasks /Run /TN WPSPiAssistantBridge` → 桥接起来（session 0）的同时**必然**出现该窗口；
- 排除 Windows Terminal 的「恢复上次会话」（settings.json 里没有 `restorePreviousSession`，state.json 也没有保存的标签页）；
- 结论：**计划任务直接把 `node.exe` 当 Action** 时，node 作为控制台程序会拿到控制台；Win11 默认终端是 Windows Terminal，于是把这份控制台显示成桌面窗口。

**做法**：
- 新增 `bridge-autostart.ps1`（纯 ASCII，隐藏启动器）：`ProcessStartInfo{ UseShellExecute=false, CreateNoWindow=true, RedirectStandardOutput/Error=true }` 起 `node "bridge.js"`，输出事件追加进 `bridge.log`，再 `WaitForExit()`——任务主进程必须**保持存活**，否则 Task Scheduler 会连 node 一起回收（这就是 P17 踩过的坑）；
- 新增 `watchdog.ps1`（纯 ASCII）替代 `watch-bridge.cmd`：TcpClient 探 3987，不通则 `Start-ScheduledTask`；
- `install-addin.ps1` 的两个任务 Action 都改成 `powershell.exe -NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File <脚本>`（带 `-WorkingDirectory`）；删除 `watch-bridge.cmd`；
- `pack-release.ps1` 白名单同步为 `bridge-autostart.ps1` + `watchdog.ps1`。

**验证（本机实测）**：
- `schtasks /Run` 前后用 `EnumWindows` 枚举 `CASCADIA_HOSTING_WINDOW_CLASS` / `ConsoleWindowClass` 可见窗口：**列表完全一致、没有新增窗口**；
- 同时 `/health` = `{ok:true, piRunning:true, model:deepseek-flash}`，桥接 pid 71704（session 0，父进程是任务的 powershell 44860）；
- `tmp\autostart.log` 记 `autostart: starting bridge with C:\Program Files\nodejs\node.exe`，`bridge.log` 收到 `bridge listening…`；
- `install-addin.ps1 -NoAddin` 重跑：`publish.xml untouched`，两个任务按新定义重建。

> 排查提醒：`powershell -File xxx.ps1` 自己也会开一个终端窗口（标题通常带「管理员」），别把测试工具产生的窗口当产品现象。

### P22 每分钟闪一下的 PowerShell 窗口：任务外壳改成 wscript 全隐藏（已完成 2026-11-14）

**问题（用户第三次报告）**：把桌面上那个 `管理员: powershell.exe` 终端关掉后，过一会儿它又弹出来，不到 1 秒又自己消失 —— 有节奏地反复。

**定位过程**：
- 任务计划器历史（`Microsoft-Windows-TaskScheduler/Operational`）确认每分钟都有一批看门狗任务在跑：`cc-connect_Watchdog`（每 30 s）、`Hermes_GatewayWatchdog`、`FixProxyBypass`、`FixOpencodeHosts`、以及本插件的 `WPSPiAssistantBridgeWatchdog`（PT1M）。
- 关键旁证：本机其它工具的看门狗都**不**用 powershell 当任务 Action，而是 `wscript.exe //B run-hidden.vbs …`；`C:\Users\Administrator\.pi\agent\scripts\run-hidden.vbs` 的注释写得很清楚：*计划任务直接启动 powershell.exe / python.exe 时，会先创建控制台再隐藏，用户每次都会看到黑框闪一下；`-WindowStyle Hidden` 挡不住；`WScript.Shell.Run` 窗口样式 0 完全不创建窗口*。
- 实测（`tmp\flashmon2.ps1`：EnumWindows 枚举 `CASCADIA_HOSTING_WINDOW_CLASS` / `ConsoleWindowClass` + 250 ms 轮询，200 s）：**每分钟在看门狗任务启动后 0.7–1.3 s，出现一个可见 Windows Terminal 窗口**（标题 `Terminal` → `…powershell.exe` → `管理员: …powershell.exe`）；同一分钟 cc-connect / Hermes 的 wscript 路径没有可见窗口。
- 决定性对照：`Disable-ScheduledTask WPSPiAssistantBridgeWatchdog` → 监控 135 s → **可见窗口事件 0 个**；`Enable-ScheduledTask` 后又开始闪。→ 闪窗来自本插件的看门狗任务。
- 原因：v0.2.14 把 Action 改成 `powershell.exe -WindowStyle Hidden -File watchdog.ps1`，但 Windows 仍然会先为控制台程序创建控制台，Win11 把它交给 Windows Terminal 显示出来，然后再隐藏 —— 于是每分钟闪一下。

**做法（v0.2.15）**：
- 新增 `hidden-run.vbs`（纯 ASCII，通用外壳）：`sh.Run(cmd, 0, True)` —— 窗口样式 0 **不创建任何控制台**；第三参数 `True` 表示等待子进程，这样 wscript 作为任务主进程一直存活，Task Scheduler 不会回收进程树（P17/P21 的坑）。
- `install-addin.ps1` 的两个任务 Action 都改成 `wscript.exe //B "<目录>\hidden-run.vbs" "<powershell.exe>" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "<目录>\<脚本>"`；`-DryRun` 文案同步；缺 `hidden-run.vbs` 时打印黄字提醒。
- `pack-release.ps1` 白名单加 `hidden-run.vbs`；README（排错表、文件表、自启表、打包清单）同步。

**验证（本机实测）**：
- 重建任务后 `Get-ScheduledTask` 显示两个 Action 均为 `wscript.exe //B …hidden-run.vbs …`；
- 看门狗按分钟触发（`Last Result: 0`）时监控 140 s：**可见窗口事件 0 个**；
- 杀掉桥接 → `schtasks /Run /TN WPSPiAssistantBridge` → 桥接 6 s 内回来（`pid=3040 session=0 parent=<wscript→powershell>`）、`/health ok:true piRunning:true`，同一次监控里**仍然 0 个可见窗口**；
- `publish.xml untouched`（注册项无需变动），用户只需重跑一次 `install-addin.cmd` 或 `schtasks /Run` 生效。
