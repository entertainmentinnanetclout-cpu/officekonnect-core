from pathlib import Path

path = Path("src/routes/dashboard/signing/index.tsx")
text = path.read_text(encoding="utf-8")

old_import = 'import { FileSignature, Loader2, Plus, Search, ShieldCheck, Users } from "lucide-react";'
new_import = 'import { FileSignature, Loader2, Plus, Search, ShieldCheck, Users, type LucideIcon } from "lucide-react";'
if old_import in text:
    text = text.replace(old_import, new_import, 1)
elif new_import not in text:
    raise SystemExit("missing signing dashboard lucide import")

old_cards = '''        {[
          ["Drafts", counts.drafts, FileSignature],
          ["Active", counts.active, Users],
          ["Waiting on me", counts.waitingOnMe, ShieldCheck],
          ["Completed", counts.complete, ShieldCheck],
        ].map(([label, value, Icon]) => (
          <Card key={String(label)}><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs text-muted-foreground">{String(label)}</p><p className="mt-1 text-2xl font-semibold">{Number(value)}</p></div><Icon className="h-5 w-5 text-muted-foreground" /></CardContent></Card>
        ))}'''
new_cards = '''        {([
          { label: "Drafts", value: counts.drafts, icon: FileSignature },
          { label: "Active", value: counts.active, icon: Users },
          { label: "Waiting on me", value: counts.waitingOnMe, icon: ShieldCheck },
          { label: "Completed", value: counts.complete, icon: ShieldCheck },
        ] satisfies Array<{ label: string; value: number; icon: LucideIcon }>).map(
          ({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-2xl font-semibold">{value}</p>
                </div>
                <Icon className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          ),
        )}'''
if old_cards in text:
    text = text.replace(old_cards, new_cards, 1)
elif "satisfies Array<{ label: string; value: number; icon: LucideIcon }>" not in text:
    raise SystemExit("missing signing dashboard summary cards")

path.write_text(text, encoding="utf-8")
print("Phase 6/7 TypeScript compatibility patches applied")
