# -*- coding: utf-8 -*-
"""生成 P4 测试素材：一张图片 + 一份带表格的 docx"""
import os
from PIL import Image, ImageDraw
from docx import Document

BASE = os.path.dirname(os.path.abspath(__file__))

# 1) 测试图片：简易柱状图
img = Image.new("RGB", (640, 400), "white")
d = ImageDraw.Draw(img)
d.rectangle([20, 20, 620, 380], outline="#888", width=2)
bars = [("万家埠", 120), ("外洲", 180), ("李家渡", 250)]
for i, (name, h) in enumerate(bars):
    x = 90 + i * 170
    d.rectangle([x, 340 - h, x + 90, 340], fill="#3A7BD5")
    d.text((x + 10, 350), name, fill="black")
d.text((200, 40), "P4 test image", fill="#333")
img.save(os.path.join(BASE, "test-image.png"))
print("image:", os.path.join(BASE, "test-image.png"), img.size)

# 2) 测试文档
doc = Document()
doc.add_paragraph("P4 图片与表格结构测试")
doc.add_paragraph("本段用于测试在指定段落后插入图片与新建表格。")
doc.add_paragraph("图后说明：以下为示例数据，需核对。")
t = doc.add_table(rows=4, cols=3)
data = [["测站", "水位(m)", "备注"], ["万家埠", "23.15", "正常"],
        ["外洲", "18.62", "偏低"], ["李家渡", "26.40", "正常"]]
for r, row in enumerate(data):
    for c, v in enumerate(row):
        t.cell(r, c).text = v
doc.add_paragraph("表后说明：以上为示例数据。")
out = os.path.join(BASE, "test-p4.docx")
doc.save(out)
print("docx:", out)
