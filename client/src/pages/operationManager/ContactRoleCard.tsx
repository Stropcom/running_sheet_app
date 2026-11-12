// Part of the Op Manager page (client/src/pages/OperationManagerPage.tsx): one contact role's card.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { ContactEntry } from "./types";
import { uid } from "./helpers";

// ─── ContactRoleCard ──────────────────────────────────────────────────────────
export function ContactRoleCard({
  role,
  contacts,
  setContacts,
  users,
}: {
  role: string;
  contacts: ContactEntry[];
  setContacts: React.Dispatch<React.SetStateAction<ContactEntry[]>>;
  users: {
    id: number;
    name: string;
    cin: string | null;
    phone?: string | null;
  }[];
}) {
  const entry = contacts.find(c => c.role === role);

  const update = (patch: Partial<ContactEntry>) => {
    setContacts(prev => {
      const idx = prev.findIndex(c => c.role === role);
      if (idx >= 0)
        return prev.map((c, i) => (i === idx ? { ...c, ...patch } : c));
      return [
        ...prev,
        {
          localId: uid(),
          role,
          userId: null,
          phone: null,
          sortOrder: prev.length,
          ...patch,
        },
      ];
    });
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {role}
      </p>
      <Select
        value={entry?.userId ? String(entry.userId) : "__none__"}
        onValueChange={v => {
          const uid_val = v === "__none__" ? null : Number(v);
          const selectedUser = uid_val
            ? users.find(u => u.id === uid_val)
            : null;
          update({
            userId: uid_val,
            phone: selectedUser?.phone ?? entry?.phone ?? null,
          });
        }}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Select user…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— None —</SelectItem>
          {users.map(u => (
            <SelectItem key={u.id} value={String(u.id)}>
              {u.name}
              {u.cin ? ` (${u.cin})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        className="h-8 text-xs"
        placeholder="Phone / mobile"
        value={entry?.phone ?? ""}
        onChange={e => update({ phone: e.target.value })}
      />
    </div>
  );
}
