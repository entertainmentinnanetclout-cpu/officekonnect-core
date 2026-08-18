from pathlib import Path

path = Path("src/components/officekonnect-shell.tsx")
text = path.read_text()

replacements = [
    (
        '  | "/dashboard/templates"\n  | "/dashboard/mail"',
        '  | "/dashboard/templates"\n  | "/dashboard/workflows"\n  | "/dashboard/approvals"\n  | "/dashboard/mail"',
        "route union",
    ),
    (
        '{ label: "Workflows", href: null, icon: Workflow, phase: 5 },',
        '{ label: "Workflows", href: "/dashboard/workflows", icon: Workflow },\n      { label: "Approvals", href: "/dashboard/approvals", icon: ShieldCheck },',
        "operations navigation",
    ),
    (
        'const pageTitles: Array<[string, string]> = [\n  ["/dashboard/templates", "Templates"],',
        'const pageTitles: Array<[string, string]> = [\n  ["/dashboard/workflows", "Workflows"],\n  ["/dashboard/approvals", "Approvals"],\n  ["/dashboard/templates", "Templates"],',
        "page titles",
    ),
]

for old, new, label in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one marker, found {count}")
    text = text.replace(old, new, 1)

path.write_text(text)
