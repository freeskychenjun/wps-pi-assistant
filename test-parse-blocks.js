// test-parse-blocks.js — wps-* 指令块解析回归（纯 JS，不需要 WPS）
// 覆盖：同一 tag 多个块合并、数组字段按顺序拼接、坏块告警不吞掉好块、
//       stripBlocks 覆盖全部 11 类、块内 JSON 不会漏进正文。
const fs = require("fs");
const src = fs.readFileSync("pi-assistant/js/taskpane.js", "utf8");

function seg(a, b) {
  const i = src.indexOf(a), j = src.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error("segment not found: " + a);
  return src.slice(i, j);
}
// 按函数名整段切出（到下一个顶层 function 之前），避免依赖文件里的区块顺序
function fn(name) {
  const i = src.indexOf("function " + name + "(");
  if (i < 0) throw new Error("function not found: " + name);
  const j = src.indexOf("\nfunction ", i + 10);
  return src.slice(i, j < 0 ? src.length : j + 1);
}
const names = ["parseBlock", "parseEdits", "parseComments", "parseRows", "parseImages", "parseTables",
  "parseOps", "parseCells", "parseParas", "parseHFs", "parsePages", "parseFormats", "stripBlocks"];
const code = names.map(fn).join("\n") + "\n" +
  seg("// ---------- wps-* 指令块总表", "function finishTurn(") + "\n" +
  "return { parseBlock: parseBlock, parseEdits: parseEdits, parseAllBlocks: parseAllBlocks, stripBlocks: stripBlocks, BLOCK_SPECS: BLOCK_SPECS };";

let fails = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log("FAIL", name, "\n  got :", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
  else console.log("ok  ", name);
}

// applyX 只作为函数引用出现在表里，不会被调用 → 给空壳即可
const stubs = ["applyEdits", "applyComments", "applyRows", "applyImages", "applyTables", "applyOps",
  "applyParas", "applyCells", "applyHeaderFooters", "applyPageSetup", "applyFormats"];
const M = new Function(stubs.join(","), code).apply(null, stubs.map(() => function () { return "noop"; }));

// 1. 单块
eq("single block", M.parseEdits("说明文字\n```wps-edits\n{\"edits\":[{\"find\":\"甲\",\"replace\":\"乙\"}]}\n```\n结尾").edits,
  [{ find: "甲", replace: "乙" }]);

// 2. 两个同 tag 块 → 合并成 2 条（旧实现只拿到第 1 条，第 2 块原文还漏在 clean 里）
const two = "前\n```wps-edits\n{\"edits\":[{\"find\":\"甲\",\"replace\":\"乙\"}]}\n```\n中\n```wps-edits\n{\"edits\":[{\"find\":\"丙\",\"replace\":\"丁\"}],\"note\":\"x\"}\n```\n后";
const r2 = M.parseEdits(two);
eq("two blocks merged", r2.edits, [{ find: "甲", replace: "乙" }, { find: "丙", replace: "丁" }]);
eq("two blocks stripped", r2.clean.replace(/\s+/g, ""), "前中后");
eq("second block not leaked", r2.clean.indexOf("wps-edits") < 0 && r2.clean.indexOf("note") < 0, true);

// 3. 坏块 + 好块：好块照常执行，坏块只留一行告警
const bad = "```wps-edits\n{不是 JSON}\n```\n```wps-edits\n{\"edits\":[{\"find\":\"甲\",\"replace\":\"乙\"}]}\n```";
const r3 = M.parseEdits(bad);
eq("bad block keeps good one", r3.edits, [{ find: "甲", replace: "乙" }]);
eq("bad block warns", /解析失败/.test(r3.clean), true);
eq("bad block leaves no raw json", r3.clean.indexOf("不是 JSON") < 0, true);

// 4. stripBlocks 覆盖 11 类（旧版只剥 7 类，cells/headerfooter/page/format 会漏）
const all = M.BLOCK_SPECS.map((s, i) => "```" + s.tag + "\n{\"" + s.field + "\":[{\"k\":" + i + "}]}\n```").join("\n");
eq("stripBlocks removes all 11 types", M.stripBlocks("甲\n" + all + "\n乙").replace(/\s+/g, ""), "甲乙");
eq("stripBlocks keeps 11 specs", M.BLOCK_SPECS.length, 11);

// 5. 无块时原样返回
eq("no block passthrough", M.parseEdits("只有说明").clean, "只有说明");
eq("no block no data", M.parseEdits("只有说明").edits, null);

// 6. 标量字段以第一个块为准，数组字段累加
const mix = "```wps-edits\n{\"mode\":\"a\",\"edits\":[{\"find\":\"1\"}]}\n```\n```wps-edits\n{\"mode\":\"b\",\"edits\":[{\"find\":\"2\"}]}\n```";
eq("array fields concat", M.parseBlock(mix, "wps-edits").data.edits.length, 2);
eq("scalar kept from first block", M.parseBlock(mix, "wps-edits").data.mode, "a");
eq("parseAllBlocks counts merged items", M.parseAllBlocks(mix).items.edits.length, 2);

console.log(fails === 0 ? "ALL PASS" : fails + " FAILED");
process.exit(fails === 0 ? 0 : 1);
