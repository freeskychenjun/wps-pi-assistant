# 造一个"有空单元格的表格"测试文档：验证 doc_read 能列出空单元格、agent 能填
from docx import Document
from docx.shared import Pt

doc = Document()
doc.add_paragraph("P8 空单元格填充测试", style="Title")
doc.add_paragraph("下面这张表有若干空单元格，用来测试 agent 是否真的读到了表格。")
data = [
    ["测站", "水位(m)", "流量(m³/s)", "备注"],
    ["万家埠", "23.15", "", "正常"],
    ["外洲", "", "1820", ""],
    ["李家渡", "26.40", "", "正常"],
    ["梅港", "", "", ""],
]
table = doc.add_table(rows=len(data), cols=4)
table.style = "Table Grid"
for r, row in enumerate(data):
    for c, val in enumerate(row):
        table.cell(r, c).text = val
doc.add_paragraph("表后说明：以上为示例数据，需核对。")
doc.save(r"D:\DSH工作区\wps-pi-plugin\test-p8-empty.docx")
print("saved test-p8-empty.docx")
