const fs = require("fs");
const src = fs.readFileSync("pi-assistant/js/taskpane.js", "utf8");
function seg(a, b) { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error("seg " + a); return src.slice(i, j); }
const code = seg("function countOccur(", "// WPS 改完 Range 后") + "\n" + seg("function applyEdits(", "// ---------- 按行列号写单元格");

function paraStarts(text) {
  const starts = [], texts = []; let s = 0;
  for (let i = 0; i < text.length; i++) { if (text.charCodeAt(i) === 13) { starts.push(s); texts.push(text.slice(s, i + 1)); s = i + 1; } }
  if (s < text.length) { starts.push(s); texts.push(text.slice(s)); }
  return { starts, texts };
}

// revKeep=true 模拟「开着修订」：被替换的旧文字留在文本流里，新文字插在其前
function makeDoc(paras, revKeep) {
  const doc = {
    _text: paras.map((p) => p + "\r").join(""),
    TrackRevisions: false,
    Revisions: { Count: 0 },
    get Paragraphs() {
      return {
        get Count() { return paraStarts(doc._text).starts.length; },
        Item(p) {
          const st = paraStarts(doc._text);
          if (p < 1 || p > st.starts.length) throw new Error("bad para " + p);
          const start = st.starts[p - 1], txt = st.texts[p - 1];
          return {
            Range: {
              Start: start, End: start + txt.length, Text: txt,
              InsertParagraphAfter() {
                doc._text = doc._text.slice(0, start + txt.length) + "\r" + doc._text.slice(start + txt.length);
              },
              InsertBefore(v) { doc._text = doc._text.slice(0, start) + v + doc._text.slice(start); }
            }
          };
        }
      };
    },
    Range(s, e) {
      return {
        Start: s, End: e,
        get Text() { return doc._text.slice(s, e); },
        set Text(v) {
          const old = doc._text.slice(s, e);
          doc._text = revKeep ? doc._text.slice(0, s) + old + v + doc._text.slice(e)
                              : doc._text.slice(0, s) + v + doc._text.slice(e);
          doc.Revisions.Count++;
        }
      };
    }
  };
  return doc;
}

function countOccurT(t, f) { let n = 0, i = 0; for (;;) { const k = t.indexOf(f, i); if (k < 0) break; n++; i = k + f.length; } return n; }

// 参考实现：改动前的「每条全篇扫一遍」
function oldApply(doc, edits) {
  const rep = []; let hitPara = 0;
  doc.TrackRevisions = true; doc.Revisions.Count = 0;
  for (let i = 0; i < edits.length; i++) {
    const ed = edits[i]; let hit = null, occ = 0;
    const paras = doc.Paragraphs, n = paras.Count;
    for (let p = 1; p <= n; p++) {
      const rng = paras.Item(p).Range; const t = rng.Text || "";
      const c = countOccurT(t, ed.find);
      if (c > 0) { occ += c; if (!hit) { const idx = t.indexOf(ed.find); hit = doc.Range(rng.Start + idx, rng.Start + idx + ed.find.length); hitPara = p; } }
    }
    if (!hit) { rep.push("miss"); continue; }
    if (ed.mode === "insertAfter") {
      doc.Paragraphs.Item(hitPara).Range.InsertParagraphAfter();
      if (ed.replace) doc.Paragraphs.Item(hitPara + 1).Range.InsertBefore(ed.replace);
      rep.push("ins@" + hitPara);
    } else {
      hit.Text = ed.replace || "";
      rep.push((occ > 1 ? "dup@" : "rep@") + hitPara);
    }
  }
  return { text: doc._text, rep: rep.join(","), revs: doc.Revisions.Count };
}

function newApply(doc, edits) {
  const app = { ActiveDocument: doc, ScreenUpdating: true };
  const f = new Function("window", "setStatus", "ensureTurn", "nudgeRepaint", "bridgeLog", code + "\nreturn applyEdits;");
  const applyEdits = f({ Application: app }, () => {}, () => ({ edits: [], rev: null }), () => {}, () => {});
  doc.Revisions.Count = 0;
  const report = applyEdits(edits);
  return { text: doc._text, rep: report, revs: doc.Revisions.Count };
}

let fails = 0;
function cmp(name, paras, edits, revKeep) {
  const a = oldApply(makeDoc(paras, revKeep), edits);
  const b = newApply(makeDoc(paras, revKeep), edits);
  const ok = a.text === b.text;
  if (!ok) { fails++; console.log("FAIL", name); console.log(" old:", JSON.stringify(a.text)); console.log(" new:", JSON.stringify(b.text)); }
  else console.log("ok  ", name, "| revs", a.revs, "/", b.revs, "| tail:", JSON.stringify(b.text.slice(-60)));
  return b;
}

cmp("basic", ["第一段 abc", "第二段 xyz", "第三段 abcdef"], [{ find: "xyz", replace: "XYZ" }], false);
cmp("shift", ["AAA", "BBB", "CCC"], [{ find: "AAA", replace: "A1234567A" }, { find: "CCC", replace: "C0" }], false);
cmp("same para twice", ["ab ab ab"], [{ find: "ab", replace: "ZZ" }, { find: "ab", replace: "YY" }], false);
cmp("miss+missing find", ["只有一段"], [{ find: "不存在", replace: "x" }, { replace: "y" }], false);
cmp("delete", ["前 中 后"], [{ find: "中", replace: "", mode: "delete" }], false);
cmp("insertAfter", ["甲", "乙", "丙"], [{ find: "乙", replace: "新段落", mode: "insertAfter" }], false);
// —— 关键：开着修订（旧文字保留）时，新实现必须与旧实现结果一致 ——
cmp("revKeep basic", ["第一段 abc", "第二段 xyz"], [{ find: "xyz", replace: "XYZ" }], true);
cmp("revKeep chain", ["AAA", "BBB", "CCC"], [{ find: "AAA", replace: "A1234567A" }, { find: "CCC", replace: "C0" }], true);
cmp("revKeep dup", ["ab ab ab", "x ab y"], [{ find: "ab", replace: "ZZ" }, { find: "ab", replace: "YY" }], true);
cmp("revKeep insert", ["甲", "乙", "丙"], [{ find: "乙", replace: "新段落", mode: "insertAfter" }, { find: "丙", replace: "Q" }], true);

// 大文档一致性
const big = []; for (let i = 0; i < 600; i++) big.push("第" + i + "段 内容" + (i % 7) + " 尾");
const eds = []; for (let i = 0; i < 30; i++) eds.push({ find: "内容" + (i % 7) + " 尾", replace: "内容" + (i % 7) + " 尾部" });
cmp("big 600x30", big, eds, true);

console.log(fails === 0 ? "ALL PASS" : fails + " FAILED");
