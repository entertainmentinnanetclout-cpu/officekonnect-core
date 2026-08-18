from pathlib import Path

path = Path("src/lib/files.functions.ts")
text = path.read_text()
markers = {
    "data: parent, error: parentError": "data: parentRow, error: parentError",
    "parent.workspace_id": "parentRow.workspace_id",
    "cursor = parent.parent_id": "cursor = parentRow.parent_id",
}
for old, new in markers.items():
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{old}: expected one marker, found {count}")
    text = text.replace(old, new, 1)
path.write_text(text)
