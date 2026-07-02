/**
 * SubObservationBlock
 *
 * Renders a list of sub-observations beneath a running-sheet row.
 * Each sub-observation has:
 *  - its own editable text (with shortcut expansion)
 *  - multiple CINs (validated against registered users)
 *  - per-CIN Certify buttons (same style as the main row)
 *  - a delete button for the whole sub-observation
 *
 * An "Add sub-observation" button at the bottom creates a new empty one.
 */

import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ShieldCheck, ShieldAlert, Trash2, Plus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import CinInput from "./CinInput";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubObsMember {
  id: number;
  memberName: string; // CIN
}

interface SubObsCert {
  memberId: number;
  certifiedByCIN: string;
  certifiedAt: number;
}

interface SubObs {
  id: number;
  observation: string | null;
  members: SubObsMember[];
  certifications: SubObsCert[];
}

interface Props {
  rowId: number;
  rowLocked: boolean;
  sheetLocked: boolean;
  shortcuts: { trigger: string; expansion: string }[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SubObservationBlock({ rowId, rowLocked, sheetLocked, shortcuts }: Props) {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: subObs = [] } = trpc.subObs.list.useQuery({ rowId });

  const createMut = trpc.subObs.create.useMutation({
    onSuccess: () => utils.subObs.list.invalidate({ rowId }),
  });
  const updateMut = trpc.subObs.update.useMutation({
    onSuccess: () => utils.subObs.list.invalidate({ rowId }),
  });
  const deleteMut = trpc.subObs.delete.useMutation({
    onSuccess: () => utils.subObs.list.invalidate({ rowId }),
  });
  const addMemberMut = trpc.subObs.addMember.useMutation({
    onSuccess: () => utils.subObs.list.invalidate({ rowId }),
  });
  const removeMemberMut = trpc.subObs.removeMember.useMutation({
    onSuccess: () => utils.subObs.list.invalidate({ rowId }),
  });
  const certifyMut = trpc.subObs.certify.useMutation({
    onSuccess: () => utils.subObs.list.invalidate({ rowId }),
  });

  // ─── Shortcut expansion ───────────────────────────────────────────────────

  const applyShortcuts = useCallback(
    (text: string): string => {
      let result = text;
      for (const sc of shortcuts) {
        const regex = new RegExp(`(?<![\\w])${sc.trigger}(?=\\s|$)`, "g");
        result = result.replace(regex, sc.expansion);
      }
      return result;
    },
    [shortcuts]
  );

  // ─── Per-sub-obs editing state ────────────────────────────────────────────

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [addingCinFor, setAddingCinFor] = useState<number | null>(null);
  const [newCin, setNewCin] = useState("");
  const [newCinValid, setNewCinValid] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const startEdit = (sub: SubObs) => {
    setEditingId(sub.id);
    setEditText(sub.observation ?? "");
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const saveEdit = (sub: SubObs) => {
    const expanded = applyShortcuts(editText);
    if (expanded !== (sub.observation ?? "")) {
      updateMut.mutate({ id: sub.id, observation: expanded });
    }
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, sub: SubObs) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveEdit(sub);
    }
    if (e.key === "Escape") {
      setEditingId(null);
    }
    // Space triggers shortcut expansion inline
    if (e.key === " ") {
      const expanded = applyShortcuts(editText);
      if (expanded !== editText) {
        setEditText(expanded);
        e.preventDefault();
      }
    }
  };

  const handleAddCin = (subObsId: number) => {
    if (!newCinValid || !newCin.trim()) return;
    addMemberMut.mutate(
      { subObsId, cin: newCin.trim() },
      {
        onSuccess: () => {
          setNewCin("");
          setNewCinValid(false);
          setAddingCinFor(null);
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  const handleCertify = (sub: SubObs, member: SubObsMember) => {
    if (!user) return;
    const myCin = user.cin;
    if (myCin !== member.memberName) {
      toast.error("You can only certify your own CIN.");
      return;
    }
    certifyMut.mutate({ subObsId: sub.id, memberId: member.id });
  };

  const isCertified = (sub: SubObs, memberId: number) =>
    sub.certifications.some((c) => c.memberId === memberId);

  const allCertified = (sub: SubObs) =>
    sub.members.length > 0 && sub.members.every((m) => isCertified(sub, m.id));

  const canEdit = !sheetLocked;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="mt-1 space-y-1 pl-3 border-l-2 border-border/30">
      {(subObs as SubObs[]).map((sub) => (
        <div key={sub.id} className="bg-muted/20 rounded-md border border-border/20 p-2 space-y-1">
          {/* Observation text */}
          <div className="flex items-start gap-1">
            <div className="flex-1 min-w-0">
              {editingId === sub.id ? (
                <textarea
                  ref={textareaRef}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, sub)}
                  onBlur={() => saveEdit(sub)}
                  rows={2}
                  className="w-full bg-background border border-border rounded px-2 py-1 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                />
              ) : (
                <p
                  className={cn(
                    "text-xs font-mono whitespace-pre-wrap cursor-pointer hover:bg-muted/40 rounded px-1 py-0.5 transition-colors",
                    !sub.observation && "text-muted-foreground italic"
                  )}
                  onClick={() => canEdit && startEdit(sub)}
                >
                  {sub.observation || "Click to add sub-observation text…"}
                </p>
              )}
            </div>
            {canEdit && (
              <button
                onClick={() => deleteMut.mutate({ id: sub.id })}
                className="shrink-0 p-1 text-muted-foreground hover:text-destructive transition-colors"
                title="Delete sub-observation"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* CIN list */}
          <div className="flex flex-wrap items-center gap-1">
            {sub.members.map((member) => {
              const certified = isCertified(sub, member.id);
              return (
                <div key={member.id} className="flex items-center gap-0.5">
                  {/* CIN badge */}
                  <span className="text-[11px] font-mono font-semibold text-foreground bg-muted/50 border border-border/40 rounded px-1.5 py-0.5">
                    {member.memberName}
                  </span>
                  {/* Certify button */}
                  <button
                    onClick={() => handleCertify(sub, member)}
                    disabled={rowLocked && certified}
                    className={cn(
                      "flex flex-col items-center text-[9px] font-semibold transition-colors",
                      certified
                        ? "text-emerald-500"
                        : "text-rose-500 hover:text-rose-400"
                    )}
                    title={certified ? "Certified — click to uncertify" : "Click to certify"}
                  >
                    {certified ? (
                      <ShieldCheck className="w-4 h-4" />
                    ) : (
                      <ShieldAlert className="w-4 h-4" />
                    )}
                    <span>{certified ? "Certified" : "Certify"}</span>
                  </button>
                  {/* Remove member (if not locked) */}
                  {canEdit && !certified && (
                    <button
                      onClick={() => removeMemberMut.mutate({ memberId: member.id })}
                      className="p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                      title="Remove CIN"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              );
            })}

            {/* Add CIN button / input */}
            {canEdit && (
              <>
                {addingCinFor === sub.id ? (
                  <div className="flex items-center gap-1">
                    <div className="w-36">
                      <CinInput
                        value={newCin}
                        onChange={setNewCin}
                        onValidCin={() => setNewCinValid(true)}
                        onInvalidCin={() => setNewCinValid(false)}
                        placeholder="CIN…"
                        showValidation
                      />
                    </div>
                    <button
                      onClick={() => handleAddCin(sub.id)}
                      disabled={!newCinValid}
                      className="text-[10px] font-semibold text-primary disabled:opacity-40 px-1"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => { setAddingCinFor(null); setNewCin(""); setNewCinValid(false); }}
                      className="text-[10px] text-muted-foreground px-1"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddingCinFor(sub.id); setNewCin(""); setNewCinValid(false); }}
                    className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <UserPlus className="w-3 h-3" />
                    <span>Add CIN</span>
                  </button>
                )}
              </>
            )}
          </div>

          {/* All certified indicator */}
          {allCertified(sub) && (
            <p className="text-[9px] text-emerald-500 font-semibold">✓ All CINs certified</p>
          )}
        </div>
      ))}

      {/* Add sub-observation button */}
      {canEdit && (
        <button
          onClick={() => createMut.mutate({ rowId })}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors py-0.5"
        >
          <Plus className="w-3 h-3" />
          <span>Add sub-observation</span>
        </button>
      )}
    </div>
  );
}
