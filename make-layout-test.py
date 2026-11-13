# -*- coding: utf-8 -*-
"""生成排版能力测试样本 test-layout.docx（页眉页脚 + 页面设置 + 正文格式）。"""
import os
from docx import Document
from docx.shared import Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.section import WD_ORIENT

HERE = os.path.dirname(os.path.abspath(__file__))
doc = Document()

sec = doc.sections[0]
sec.page_width = Cm(21.0)
sec.page_height = Cm(29.7)
sec.top_margin = Cm(2.54)
sec.bottom_margin = Cm(2.54)
sec.left_margin = Cm(3.17)
sec.right_margin = Cm(3.17)
sec.header_distance = Cm(1.5)
sec.footer_distance = Cm(1.75)

hp = sec.header.paragraphs[0]
hp.text = "示例工程自检报告（送审稿）"
hp.alignment = WD_ALIGN_PARAGRAPH.CENTER

fp = sec.footer.paragraphs[0]
fp.text = "某某分院　2026 年 11 月"
fp.alignment = WD_ALIGN_PARAGRAPH.CENTER

t = doc.add_heading("P16 排版能力测试", level=1)
p1 = doc.add_paragraph("本文件用于验证页眉页脚读取写入、页面设置与段落格式调整。")
p2 = doc.add_paragraph("设计洪水成果见表 1，需与初设成果相互印证。")
p3 = doc.add_paragraph("坝址多年平均流量为 215 m3/s，P=50% 流量为 215 m³/s。")

tbl = doc.add_table(rows=3, cols=3)
data = [["项目", "流量(m³/s)", "备注"], ["P=1%", "2150", "设计"], ["P=5%", "1820", "校核"]]
for r, row in enumerate(data):
    for c, v in enumerate(row):
        tbl.cell(r, c).text = v

doc.add_paragraph("以上为示例数据，需核对。")

out = os.path.join(HERE, "test-layout.docx")
doc.save(out)
print("saved", out)
