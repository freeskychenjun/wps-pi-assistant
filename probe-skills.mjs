// 离线验证：pi 的 loadSkills 能否加载 DSH/Claude 的技能目录
import { loadSkills } from "file:///C:/Users/Administrator/AppData/Roaming/npm/node_modules/@earendil-works/pi-coding-agent/dist/index.js";

const dir = "C:\\Users\\Administrator\\.claude\\skills";
const r = loadSkills({
  agentDir: "C:\\Users\\Administrator\\.pi\\agent",
  skillPaths: [dir],
  includeDefaults: false,
  cwd: "D:\\DSH工作区\\wps-pi-plugin",
});
console.log("skills loaded:", r.skills.length);
console.log("diagnostics:", r.diagnostics.length);
const sample = r.skills.slice(0, 6).map((s) => `${s.name} :: ${String(s.description).slice(0, 60)}`);
console.log(sample.join("\n"));
const bad = r.diagnostics.slice(0, 5).map((d) => `${d.type} ${d.message} ${d.path || ""}`);
if (bad.length) console.log("--- diag ---\n" + bad.join("\n"));
const totalDesc = r.skills.reduce((a, s) => a + String(s.description).length + s.name.length + s.filePath.length, 0);
console.log("approx prompt chars:", totalDesc, "~tokens:", Math.round(totalDesc / 3.5));
