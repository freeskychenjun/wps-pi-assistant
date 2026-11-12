// 清掉 authaddin.json 里 pi-assistant 的授权记录，让 WPS 下次启动重新弹信任框
const fs = require("fs");
const p = process.env.APPDATA + "\\kingsoft\\wps\\jsaddons\\authaddin.json";
const j = JSON.parse(fs.readFileSync(p, "utf8"));
const wps = j.wps || {};
let removed = [];
for (const k of Object.keys(wps)) {
  if (k === "namelist") continue;
  if (wps[k] && wps[k].name === "pi-assistant") { removed.push(k); delete wps[k]; }
}
if (typeof wps.namelist === "string") {
  const keep = wps.namelist.split(";").filter((x) => x && !removed.includes(x));
  wps.namelist = keep.join(";");
}
fs.writeFileSync(p, JSON.stringify(j, null, 4), "utf8");
console.log("removed: " + JSON.stringify(removed));
console.log("namelist now: " + wps.namelist);
