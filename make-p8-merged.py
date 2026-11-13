# 造一个"含合并单元格 + 空单元格"的表格测试文档：
#   - 复现 WPS 里 tbl.Rows.Item(r) 返回 null → "Cannot read properties of null (reading 'Cells')"
#   - 验证 doc_read 能读出合并位置（（合并））与空单元格清单
#   - 验证 wps-cells 能按行列号把数据填进空格子
from docx import Document

doc = Document()
doc.add_paragraph("P9 合并单元格表格填充测试", style="Title")
doc.add_paragraph("这类表的表头有横向/纵向合并，用来验证读取与按行列号写入。")

cols = 9
rows = 5
t = doc.add_table(rows=rows, cols=cols)
t.style = "Table Grid"

# 第 1 行：标题横跨全部列
t.cell(0, 0).merge(t.cell(0, cols - 1)).text = "乐平枢纽坝址年径流频率计算成果表"

# 第 2–3 行：项目 / 单位 / 备注 / 成果来源 纵向合并，中间是各频率列
t.cell(1, 0).merge(t.cell(2, 0)).text = "项目"
t.cell(1, 1).merge(t.cell(2, 1)).text = "单位"
for i, h in enumerate(["P=50%", "P=75%", "P=80%", "P=90%", "P=95%"]):
    t.cell(1, 2 + i).text = h
t.cell(1, 7).merge(t.cell(2, 7)).text = "备注"
t.cell(1, 8).merge(t.cell(2, 8)).text = "成果来源"

t.cell(3, 0).text = "初设"
t.cell(3, 1).text = "亿m³"
for i, v in enumerate(["216", "167", "157", "132", "115"]):
    t.cell(3, 2 + i).text = v
t.cell(3, 7).text = "初设成果"
t.cell(3, 8).text = "初设报告"

t.cell(4, 0).text = "本次复核"
t.cell(4, 1).text = "亿m³"
# 第 5 行中间 5 个格子留空，等着按行列号填
t.cell(4, 7).text = "本次复核"
t.cell(4, 8).text = "本次计算"

doc.add_paragraph("表后说明：第 5 行有 5 个空单元格，需按计算结果补全。")
doc.save(r"D:\DSH工作区\wps-pi-plugin\test-p8-merged.docx")
print("saved test-p8-merged.docx")
