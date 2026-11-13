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
