import docx
from docx.shared import Pt

d = docx.Document()
d.add_heading("P3 表格与插入测试", level=1)
d.add_paragraph("这是一段普通正文，用来测试段落改写。")

t = d.add_table(rows=4, cols=3)
t.style = "Table Grid"
data = [
    ("测站", "水位(m)", "备注"),
    ("万家埠", "23.15", "正常"),
    ("外洲", "18.62", "偏低"),
    ("李家渡", "26.40", "正常"),
]
for r, row in enumerate(data):
    for c, v in enumerate(row):
        t.cell(r, c).text = v

d.add_paragraph("表后说明：以上为示例数据，需核对。")
d.save(r"D:\DSH工作区\wps-pi-plugin\test-table.docx")
print("saved")
