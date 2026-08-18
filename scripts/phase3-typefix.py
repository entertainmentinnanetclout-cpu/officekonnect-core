from pathlib import Path

editor = Path("src/components/spreadsheet/spreadsheet-editor.tsx")
s = editor.read_text()
if s.count("  BorderAll,\n") != 1 or s.count("<BorderAll className=") != 1:
    raise SystemExit("spreadsheet border icon markers changed")
s = s.replace("  BorderAll,\n", "  Grid2X2,\n", 1)
s = s.replace("<BorderAll className=", "<Grid2X2 className=", 1)
editor.write_text(s)

spreadsheet = Path("src/lib/spreadsheet.ts")
t = spreadsheet.read_text()
old = '''  if (type === "date") {\n    const date = value instanceof Date ? value : new Date(String(value));\n'''
new = '''  if (type === "date") {\n    const date = new Date(String(value));\n'''
if t.count(old) != 1:
    raise SystemExit(f"spreadsheet date formatter marker count: {t.count(old)}")
spreadsheet.write_text(t.replace(old, new, 1))
