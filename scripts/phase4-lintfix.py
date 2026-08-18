from pathlib import Path

path = Path("src/routes/dashboard/templates/index.tsx")
text = path.read_text()
if "useTemplateFn" not in text:
    raise SystemExit("template server function alias marker not found")
text = text.replace("useTemplateFn", "createFromTemplateFn")
path.write_text(text)
