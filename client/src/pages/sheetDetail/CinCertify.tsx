import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/useMobile";
import CinInput from "@/components/CinInput";
import {
  Lock,
  Unlock,
  Plus,
  Trash2,
  UserPlus,
  ShieldCheck,
  Clock,
  X,
  Users,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import React, { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import type { Member, Certification, SheetRow } from "./types";
import { SPACER, isFullTeamMembers } from "./teamMembers";

// A single member row: certify/uncertify shield inline with the CIN, plus
// the remove-CIN control — the merged replacement for the old separate
// CIN and Certify columns (Option A from the column-merge mockup).
function CinCertifyRow({
  row,
  member,
  cert,
  canEdit,
  canCertify,
  isLocked,
  onCertify,
  onUncertify,
  onRemove,
}: {
  row: SheetRow;
  member: Member;
  cert: Certification | undefined;
  canEdit: boolean;
  canCertify: boolean;
  isLocked: boolean;
  onCertify: (rowId: number, memberId: number) => void;
  onUncertify: (rowId: number, memberId: number) => void;
  onRemove: () => void;
}) {
  // On a phone each row is a card and the CINs wrap as chips (see the
  // .running-sheet-cards rules in index.css), so there is no blank space beside
  // a chip to hold: the hold happens on the chip itself instead. Laptop and
  // iPad keep the blank-space hold exactly as before.
  const isPhone = useIsMobile();
  const ROW_H = isPhone ? "h-7" : "h-8";
  const isSpacer = member.memberName === SPACER;
  const canRemove = canEdit && !isLocked;
  const chipHold = isPhone && canRemove && !isSpacer;

  // Removing a CIN (or a spacer) is a press-and-hold, not a tap — a red fill
  // sweeps across the row over HOLD_MS; releasing early cancels. No icon, no
  // reserved space, and much harder to trigger by accident than a plain tap
  // on a legal record. Driven imperatively via a ref (not React state) so
  // the fill animates every frame without re-rendering the row.
  const HOLD_MS = 1000;
  const fillRef = useRef<HTMLDivElement>(null);
  // On a chip the red fill only starts after a short pause so an ordinary tap
  // never flashes red; the removal still lands at HOLD_MS.
  const SHOW_AFTER_MS = chipHold ? 250 : 0;
  const holdRef = useRef<{
    active: boolean;
    start: number;
    raf: number | null;
    x: number;
    y: number;
  }>({ active: false, start: 0, raf: null, x: 0, y: 0 });
  // Set when a hold completes so the click that follows the finger lifting
  // does not also certify the chip that was just removed.
  const heldRef = useRef(false);

  useEffect(() => {
    return () => {
      if (holdRef.current.raf) cancelAnimationFrame(holdRef.current.raf);
    };
  }, []);

  const startHold = (e: React.PointerEvent) => {
    if (!canRemove) return;
    const hold = holdRef.current;
    hold.active = true;
    hold.start = performance.now();
    hold.x = e.clientX;
    hold.y = e.clientY;
    heldRef.current = false;
    if (fillRef.current) {
      fillRef.current.style.transition = "none";
    }
    const step = (now: number) => {
      if (!hold.active) return;
      const elapsed = now - hold.start;
      const pct = Math.min(
        1,
        Math.max(0, (elapsed - SHOW_AFTER_MS) / (HOLD_MS - SHOW_AFTER_MS))
      );
      if (fillRef.current) fillRef.current.style.width = `${pct * 100}%`;
      if (elapsed >= HOLD_MS) {
        hold.active = false;
        heldRef.current = true;
        onRemove();
        return;
      }
      hold.raf = requestAnimationFrame(step);
    };
    hold.raf = requestAnimationFrame(step);
  };

  // A finger that drifts (scrolling the page) is not a hold.
  const moveHold = (e: React.PointerEvent) => {
    const hold = holdRef.current;
    if (!hold.active) return;
    if (Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 10) cancelHold();
  };

  const cancelHold = () => {
    const hold = holdRef.current;
    if (!hold.active) return;
    // The red fill was already showing, so this was a hold that got let go,
    // not a tap: don't let the click that follows certify the chip.
    if (chipHold && performance.now() - hold.start > SHOW_AFTER_MS) {
      heldRef.current = true;
    }
    hold.active = false;
    if (hold.raf) cancelAnimationFrame(hold.raf);
    if (fillRef.current) {
      fillRef.current.style.transition = "width 0.2s ease";
      fillRef.current.style.width = "0%";
    }
  };

  // Suppresses the native long-press text-selection/"Copy" callout that
  // iOS and Android would otherwise show wherever a press-and-hold gesture
  // lands, including on the plain-text CIN inside the pill below —
  // WebkitTouchCallout is iOS Safari-specific, userSelect covers the rest.
  const noCalloutStyle: React.CSSProperties = {
    WebkitTouchCallout: "none",
    WebkitUserSelect: "none",
    userSelect: "none",
  };

  if (isSpacer) {
    return (
      <div
        className={`relative flex items-center gap-1 ${ROW_H} select-none ${isPhone ? "basis-full w-full" : ""}`}
        style={
          canRemove ? { ...noCalloutStyle, touchAction: "none" } : undefined
        }
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
      >
        {/* Spacer — blank row for visual separation, press-and-hold to remove */}
        {canRemove && (
          <div
            ref={fillRef}
            className="absolute inset-0 bg-destructive/15 pointer-events-none"
            style={{ width: "0%" }}
          />
        )}
        {isPhone && (
          <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-border" />
        )}
        <span className="relative z-10 flex-1 min-w-0" />
      </div>
    );
  }

  const canToggle = canCertify && !isLocked;

  // A single rounded chip, sized to fit its content, carries both the CIN
  // and its certify state — a tap anywhere on it certifies/uncertifies.
  // Removing it is a separate 1s press-and-hold in the blank space to the
  // chip's right (same fill-sweep mechanic as the spacer row above), so
  // the two gestures never share a hit target.
  const pillBase = `relative flex items-center gap-1.5 h-full min-w-0 px-2.5 border rounded-full text-xs font-bold ${
    cert
      ? "text-[var(--certified-color)] border-[var(--locked-border)] bg-[var(--locked-bg)]"
      : "text-red-500 border-red-500/35 bg-red-500/5"
  }`;
  const pillContent = (
    <>
      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
      <span className="font-mono truncate">{member.memberName}</span>
    </>
  );

  return (
    <div
      className={`${isPhone ? "inline-flex" : "flex"} items-center ${ROW_H} select-none`}
      style={noCalloutStyle}
    >
      <div
        className={`inline-flex items-stretch h-7 max-w-full rounded-full shrink-0 ${chipHold ? "relative overflow-hidden" : ""}`}
        style={chipHold ? { touchAction: "manipulation" } : undefined}
        onPointerDown={chipHold ? startHold : undefined}
        onPointerUp={chipHold ? cancelHold : undefined}
        onPointerLeave={chipHold ? cancelHold : undefined}
        onPointerCancel={chipHold ? cancelHold : undefined}
        onPointerMove={chipHold ? moveHold : undefined}
        onContextMenu={chipHold ? e => e.preventDefault() : undefined}
      >
        {chipHold && (
          <div
            ref={fillRef}
            className="absolute inset-y-0 left-0 z-10 bg-destructive/30 pointer-events-none"
            style={{ width: "0%" }}
          />
        )}
        {canToggle ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`${pillBase} cursor-pointer`}
                onClick={() => {
                  if (heldRef.current) {
                    heldRef.current = false;
                    return;
                  }
                  if (cert) onUncertify(row.id, member.id);
                  else onCertify(row.id, member.id);
                }}
              >
                {pillContent}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {cert ? (
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">
                    Certified by{" "}
                    {(cert as any).certifiedByCIN || cert.certifiedByName} — tap
                    to uncertify
                  </span>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {format(new Date(cert.certifiedAt), "MMM d, yyyy HH:mm:ss")}
                  </span>
                </div>
              ) : (
                `Certify ${member.memberName}`
              )}
            </TooltipContent>
          </Tooltip>
        ) : cert ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`${pillBase} cursor-default`}>
                {pillContent}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">
                  Certified by{" "}
                  {(cert as any).certifiedByCIN || cert.certifiedByName}
                </span>
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {format(new Date(cert.certifiedAt), "MMM d, yyyy HH:mm:ss")}
                </span>
              </div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className={`${pillBase} cursor-default`}>{pillContent}</span>
        )}
      </div>

      {/* Hold zone — the blank space to the right of the pill, press-and-hold
          1s to remove. A red fill sweeps across it as visual feedback. */}
      {canRemove && !isPhone && (
        <div
          className="relative flex-1 h-full min-w-[28px]"
          style={{ ...noCalloutStyle, touchAction: "none" }}
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onPointerCancel={cancelHold}
        >
          <div
            ref={fillRef}
            className="absolute inset-0 rounded-md bg-destructive/20 pointer-events-none"
            style={{ width: "0%" }}
          />
        </div>
      )}
    </div>
  );
}

// ─── CIN + Certify Cell ─────────────────────────────────────────────────────
// Merges what used to be two separate columns (CIN, Certify) into one —
// each member's shield sits inline with their CIN (CinCertifyRow above),
// with the same "TEAM" collapse, "Uncertify All", and "Delete row" controls
// as before.

export function CinCertifyCell({
  row,
  canEdit,
  canCertify,
  onAddMember,
  onRemoveMember,
  onCertify,
  onUncertify,
  onUncertifyAll,
  onDeleteRow,
  rosterCins,
}: {
  row: SheetRow;
  canEdit: boolean;
  canCertify: boolean;
  onAddMember: (rowId: number, name: string) => void;
  onRemoveMember: (memberId: number, rowId: number) => void;
  onCertify: (rowId: number, memberId: number) => void;
  onUncertify: (rowId: number, memberId: number) => void;
  onUncertifyAll: (rowId: number) => void;
  onDeleteRow?: (rowId: number) => void;
  rosterCins?: string[];
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNameValid, setNewNameValid] = useState(false);
  // Pressing Add shows the dropdown with its list already open, so picking a
  // CIN is one tap, not two. Opened a moment after the dropdown appears: opened
  // in the same breath as the press, the tap that pressed Add also reaches the
  // new list and shuts it again. A close that arrives within half a second of
  // the list opening is that same stray tap (or a slow device catching up with
  // the press), not the officer choosing to close it, so it is ignored — on a
  // busy device the list used to open and then shut itself.
  const [listOpen, setListOpen] = useState(false);
  const listOpenedAt = useRef(0);
  useEffect(() => {
    if (!adding) {
      setListOpen(false);
      return;
    }
    const t = setTimeout(() => {
      listOpenedAt.current = Date.now();
      setListOpen(true);
    }, 60);
    return () => clearTimeout(t);
  }, [adding]);

  const handleAdd = () => {
    if (!newName.trim()) return;
    const val = newName.trim();
    onAddMember(row.id, val);
    setNewName("");
    setAdding(false);
  };

  // Adds every rostered CIN to this row at once, in roster order (leader
  // first, then ascending CIN), one mutation at a time so order is
  // preserved rather than racing. Two entry points share this: the "★ Add
  // all team CINs" dropdown option below, and the "Team" quick-add button
  // shown next to "+ Add" whenever a roster exists.
  const addAllTeamCins = () => {
    if (!rosterCins || rosterCins.length === 0) return;
    const addSequentially = (cins: string[], idx: number) => {
      if (idx >= cins.length) {
        setAdding(false);
        return;
      }
      onAddMember(row.id, cins[idx]);
      setTimeout(() => addSequentially(cins, idx + 1), 80);
    };
    addSequentially(rosterCins, 0);
  };

  const total = row.members.length;

  // A fully-certified row (isLocked) whose members are exactly the full
  // daily roster collapses to a single green "TEAM" pill instead of every
  // CIN + shield — the individual CINs are still the real data underneath
  // (used by Witness List generation and everywhere else); this is display
  // only. "Uncertify All" below still un-collapses it, same as ever.
  const showTeamCollapse =
    row.isLocked && isFullTeamMembers(row.members, rosterCins);

  const memberItems = showTeamCollapse ? (
    <div className="flex items-center h-8">
      <div className="inline-flex items-center gap-1.5 h-7 px-2.5 border rounded-full text-xs font-bold text-[var(--certified-color)] border-[var(--locked-border)] bg-[var(--locked-bg)]">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
        <span className="font-mono">TEAM</span>
      </div>
    </div>
  ) : total === 0 ? null : (
    row.members.map(member => {
      const cert = row.certifications.find(
        c => c.memberId === member.id && c.isActive
      );
      return (
        <CinCertifyRow
          key={member.id}
          row={row}
          member={member}
          cert={cert}
          canEdit={canEdit}
          canCertify={canCertify}
          isLocked={row.isLocked}
          onCertify={onCertify}
          onUncertify={onUncertify}
          onRemove={() => onRemoveMember(member.id, row.id)}
        />
      );
    })
  );

  const addingPanel = (
    <div className="flex flex-col gap-1.5 mt-0.5">
      {rosterCins && rosterCins.length > 0 ? (
        /* Dropdown mode: pick from team roster — Space at top, duplicates allowed */
        <div className="flex items-center gap-1.5">
          <Select
            open={listOpen}
            onOpenChange={open => {
              if (!open && Date.now() - listOpenedAt.current < 500) return;
              setListOpen(open);
            }}
            value={newName}
            onValueChange={v => {
              if (v === "__all__") {
                addAllTeamCins();
              } else {
                onAddMember(row.id, v);
                setNewName("");
                setAdding(false);
              }
            }}
          >
            <SelectTrigger className="h-7 text-xs flex-1 min-w-[120px]">
              <SelectValue placeholder="Pick…" />
            </SelectTrigger>
            <SelectContent>
              {/* Space option always at the top */}
              <SelectItem
                value={SPACER}
                className="text-xs text-muted-foreground italic"
              >
                — Space —
              </SelectItem>
              {rosterCins.map(cin => (
                <SelectItem key={cin} value={cin} className="font-mono text-xs">
                  {cin}
                </SelectItem>
              ))}
              {rosterCins.length > 1 && (
                <SelectItem
                  value="__all__"
                  className="text-xs font-medium text-primary"
                >
                  ★ Add all team CINs
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => {
              setAdding(false);
              setNewName("");
            }}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ) : (
        /* Free-text mode: validated against registered users — duplicates allowed */
        <div className="flex items-center gap-1.5">
          <CinInput
            autoFocus
            placeholder="Enter CIN"
            value={newName}
            onChange={setNewName}
            onValidCin={cin => {
              setNewName(cin);
              setNewNameValid(true);
            }}
            onInvalidCin={() => setNewNameValid(false)}
            showValidation
            className="h-7 text-xs px-2"
          />
          <Button
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={handleAdd}
            disabled={!newNameValid}
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      )}
    </div>
  );

  const isPhone = useIsMobile();

  // Phone: the row is a card (index.css), so the CINs wrap as chips under a
  // small label, with Add / Team / Delete row in one equal row at the bottom.
  if (isPhone) {
    const hasRoster = !!rosterCins && rosterCins.length > 1;
    const actionCount = 1 + (hasRoster ? 1 : 0) + (onDeleteRow ? 1 : 0);
    return (
      <div className="-mx-3 flex flex-col gap-2 border-t border-border px-3 pt-3">
        <div className="flex flex-wrap items-center gap-1.5">{memberItems}</div>

        {canEdit &&
          !row.isLocked &&
          (adding ? (
            addingPanel
          ) : (
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${actionCount}, minmax(0, 1fr))`,
              }}
            >
              <Button
                type="button"
                variant="outline"
                className="h-9 gap-1 px-1.5 text-xs font-semibold"
                onClick={() => setAdding(true)}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add
              </Button>
              {hasRoster && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 gap-1 border-primary px-1.5 text-xs font-semibold text-primary"
                  onClick={addAllTeamCins}
                  title={`Add all ${rosterCins!.length} rostered CINs`}
                >
                  <Users className="w-3.5 h-3.5" />
                  Team
                </Button>
              )}
              {!row.isLocked && onDeleteRow && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 gap-1 px-1.5 text-xs font-semibold text-destructive"
                  onClick={() => onDeleteRow(row.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete row
                </Button>
              )}
            </div>
          ))}

        {row.isLocked && (
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="gap-1 border-[var(--locked-border)] bg-[var(--locked-bg)] py-0 px-1.5 text-xs text-[var(--certified-color)]"
            >
              <Lock className="w-2.5 h-2.5" />
              Locked
            </Badge>
          </div>
        )}
        {row.isLocked && canCertify && (
          <Button
            type="button"
            variant="outline"
            className="h-9 gap-1 px-1.5 text-[13px] font-semibold text-foreground"
            onClick={() => onUncertifyAll(row.id)}
          >
            <Unlock className="w-3.5 h-3.5" />
            Uncertify all
          </Button>
        )}
        {/* Delete row for a row that is not editable-but-deletable is covered above */}
        {!canEdit && !row.isLocked && onDeleteRow && (
          <Button
            type="button"
            variant="outline"
            className="h-9 gap-1 px-1.5 text-xs font-semibold text-destructive"
            onClick={() => onDeleteRow(row.id)}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete row
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-w-[90px]">
      {memberItems}

      {/* Add button — sits below all CINs */}
      {canEdit &&
        !row.isLocked &&
        (adding ? (
          addingPanel
        ) : (
          <div className="flex flex-col mt-0.5">
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors w-fit"
            >
              <span className="flex w-6 h-6 items-center justify-center shrink-0">
                <UserPlus className="w-3 h-3" />
              </span>
              Add
            </button>
            {rosterCins && rosterCins.length > 1 && (
              <button
                onClick={addAllTeamCins}
                className="flex items-center gap-1 text-xs text-primary/80 hover:text-primary transition-colors w-fit"
                title={`Add all ${rosterCins.length} rostered CINs`}
              >
                <span className="flex w-6 h-6 items-center justify-center shrink-0">
                  <Users className="w-3 h-3" />
                </span>
                Team
              </button>
            )}
          </div>
        ))}

      {/* Locked badge — the certified count is redundant with the shields */}
      {row.isLocked && (
        <div className="flex items-center gap-1.5 mt-1">
          <Badge
            variant="outline"
            className="gap-1 text-[var(--certified-color)] border-[var(--locked-border)] bg-[var(--locked-bg)] text-xs py-0 px-1.5"
          >
            <Lock className="w-2.5 h-2.5" />
            Locked
          </Badge>
        </div>
      )}

      {/* Footer actions */}
      {row.isLocked && canCertify && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 pl-0 pr-2 gap-1 text-xs text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10 mt-1 w-fit"
              onClick={() => onUncertifyAll(row.id)}
            >
              <span className="flex w-6 h-6 items-center justify-center shrink-0">
                <Unlock className="w-3 h-3" />
              </span>
              Uncertify All
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Remove all certifications and unlock row
          </TooltipContent>
        </Tooltip>
      )}
      {!row.isLocked && onDeleteRow && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 pl-0 pr-2 gap-1 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 mt-1 w-fit"
          onClick={() => onDeleteRow(row.id)}
        >
          <span className="flex w-6 h-6 items-center justify-center shrink-0">
            <Trash2 className="w-3 h-3" />
          </span>
          Delete row
        </Button>
      )}
    </div>
  );
}
