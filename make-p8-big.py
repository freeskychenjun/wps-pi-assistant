# 造一个"大文档"性能样本：800 段正文 + 20 张表，用于测 doc_find / doc_read 的耗时与截断
from docx import Document
import random

random.seed(20261112)
doc = Document()
doc.add_paragraph("P8 大文档性能测试", style="Title")

filler = "本段为性能测试占位正文，内容与工程无关，仅用于把文档撑大以测量读取与检索耗时。"
for i in range(1, 801):
    if i == 650:
        doc.add_paragraph("第 650 段特殊标记：乐平枢纽下闸蓄水设计自检报告（用于检索命中测试）。")
    elif i % 40 == 0:
        doc.add_heading("第 %d 节 测试小节标题" % (i // 40), level=2)
    else:
        doc.add_paragraph("[%d] %s 序号 %d。" % (i, filler, i))

for t in range(1, 21):
    doc.add_paragraph("表 %d 前的说明段落。" % t)
    table = doc.add_table(rows=6, cols=4)
    table.style = "Table Grid"
    headers = ["站名", "水位(m)", "流量(m³/s)", "备注"]
    for c, h in enumerate(headers):
        table.cell(0, c).text = h
    for r in range(1, 6):
        table.cell(r, 0).text = "站%d" % (t * 10 + r)
        table.cell(r, 1).text = "%.2f" % (20 + r + t * 0.1)
        table.cell(r, 2).text = str(1000 + t * 10 + r)
        table.cell(r, 3).text = "正常" if r % 2 else "偏低"
    if t == 15:
        table.cell(3, 1).text = "乐平枢纽"

doc.add_paragraph("本文档结束。")
doc.save(r"D:\DSH工作区\wps-pi-plugin\test-p8-big.docx")
print("saved test-p8-big.docx")
