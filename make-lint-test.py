# -*- coding: utf-8 -*-
"""生成全文体检（doc_lint）的回归样本 test-lint.docx。

故意埋的坑：
  * 表名编号跳号：有「表 1」「表 3」，缺「表 2」
  * 引用悬空：正文「见表 7」，全文没有表 7
  * 表名缺失：第二张表前面是普通段落（不是表名）
  * 单位写法不一致：m3/s 与 m³/s 混用
  * 中文里的英文标点：逗号、括号
  * 重复段落：同一段连续出现两次
  * 空单元格：表 1 留两个空格
  * 图名与悬空引用：「图 1」存在，正文「如图 3」
"""
import os
from docx import Document


def add_para(doc, text):
    return doc.add_paragraph(text)


def add_table(doc, header, rows):
    t = doc.add_table(rows=1 + len(rows), cols=len(header))
    t.style = "Table Grid"
    for c, h in enumerate(header):
        t.rows[0].cells[c].text = h
    for r, row in enumerate(rows, start=1):
        for c, v in enumerate(row):
            t.rows[r].cells[c].text = v
    return t


def main():
    doc = Document()
    add_para(doc, "P10 全文体检测试")
    add_para(doc, "本文件用于验证全文体检（doc_lint）能找出多少类问题，请勿用于正式报告。")

    add_para(doc, "表 1 乐平枢纽坝址年径流频率计算成果表")
    add_table(doc, ["项目", "均值", "Cv", "P=50%"], [
        ["初设", "228", "0.37", "216"],
        ["本次复核", "228", "", ""],
    ])

    add_para(doc, "施工期设计洪水见表 7，应与表 1 的成果相互印证。")

    add_para(doc, "表 3 设计洪水成果表")
    add_table(doc, ["频率", "洪峰流量", "备注"], [
        ["P=1%", "2150", "设计"],
        ["P=5%", "", "校核"],
    ])

    add_para(doc, "坝址多年平均流量为 215 m3/s，P=50% 流量为 215 m³/s，两组数值应一致。")
    add_para(doc, "坝址水位为 23.15m,流量为 1820m3/s,需要核对(见计算书)。")

    add_para(doc, "本次复核采用与初设相同的水文系列，成果差异在合理范围内。")
    add_para(doc, "本次复核采用与初设相同的水文系列，成果差异在合理范围内。")

    add_para(doc, "工程位置见图 1，坝址以上集水面积约 1200 km2。")
    add_para(doc, "图 1 乐平枢纽位置示意图")
    add_para(doc, "工程总体布置如图 3 所示，请核对。")

    add_para(doc, "下表没有表名，用来验证「表名缺失」这一条。")
    add_table(doc, ["测站", "水位(m)"], [["万家埠", "23.15"], ["外洲", "18.62"]])

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test-lint.docx")
    doc.save(out)
    print("saved:", out)


if __name__ == "__main__":
    main()
