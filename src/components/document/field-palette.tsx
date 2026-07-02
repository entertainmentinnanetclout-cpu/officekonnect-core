// Field palette + placement logic used inside the document workspace.
import { Type, Calendar, CheckSquare, PenTool, User, AtSign, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FieldType } from "@/lib/fields.functions";

export interface FieldTool {
  type: FieldType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultW: number;
  defaultH: number;
}

export const FIELD_TOOLS: FieldTool[] = [
  { type: "text", label: "Text", icon: Type, defaultW: 0.2, defaultH: 0.03 },
  { type: "date", label: "Date", icon: Calendar, defaultW: 0.14, defaultH: 0.03 },
  { type: "checkbox", label: "Checkbox", icon: CheckSquare, defaultW: 0.03, defaultH: 0.03 },
  { type: "signature", label: "Signature", icon: PenTool, defaultW: 0.22, defaultH: 0.08 },
  { type: "initials", label: "Initials", icon: Hash, defaultW: 0.08, defaultH: 0.05 },
  { type: "name", label: "Name", icon: User, defaultW: 0.2, defaultH: 0.03 },
  { type: "email", label: "Email", icon: AtSign, defaultW: 0.24, defaultH: 0.03 },
];

interface Props {
  activeType: FieldType | null;
  onSelect: (tool: FieldTool | null) => void;
}

export function FieldPalette({ activeType, onSelect }: Props) {
  return (
    <aside className="hidden w-44 shrink-0 border-r border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900 md:block">
      <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Fields
      </p>
      <div className="space-y-1">
        {FIELD_TOOLS.map((t) => {
          const Icon = t.icon;
          const active = activeType === t.type;
          return (
            <Button
              key={t.type}
              variant={active ? "secondary" : "ghost"}
              size="sm"
              className="h-8 w-full justify-start gap-2 text-xs"
              onClick={() => onSelect(active ? null : t)}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </Button>
          );
        })}
      </div>
    </aside>
  );
}
