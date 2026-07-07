/**
 * DraftSheetPage.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * A lightweight running-sheet editor that works entirely from IndexedDB.
 * Used when the user is offline and navigates to a draft sheet.
 *
 * Features:
 *  - View / edit draft sheet title and team CINs
 *  - Add / edit / delete rows (time, observation, CIN members)
 *  - All changes persist to IndexedDB immediately
 *  - Draft badge on every row
 */

import { useEffect, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Clock, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DraftBadge } from "@/components/DraftModeBanner";
import { useOffline } from "@/contexts/OfflineContext";
import {
  getDraftSheet,
  getDraftRowsForSheet,
  saveDraftRow,
  updateDraftRow,
  deleteDraftRow,
  updateDraftSheet,
  generateLocalId,
  enqueueSyncAction,
  type DraftSheet,
  type DraftRow,
} from "@/lib/offlineStore";
import { toast } from "sonner";

export default function DraftSheetPage() {
  const { localId } = useParams<{ localId: string }>();
  const [, navigate] = useLocation();
  const { refreshDraftCounts } = useOffline();

  const [sheet, setSheet] = useState<DraftSheet | null>(null);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Editing state
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [rowTime, setRowTime] = useState("");
  const [rowObs, setRowObs] = useState("");
  const [rowCins, setRowCins] = useState("");

  const loadData = useCallback(async () => {
    if (!localId) return;
    const [s, r] = await Promise.all([
      getDraftSheet(localId),
      getDraftRowsForSheet(localId),
    ]);
    setSheet(s ?? null);
    setRows(r);
    setLoading(false);
  }, [localId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Add a new row ──────────────────────────────────────────────────────────
  const handleAddRow = async () => {
    if (!localId) return;
    const newRow: DraftRow = {
      localId: generateLocalId(),
      sheetLocalId: localId,
      rowNumber: rows.length + 1,
      time: new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true }),
      observation: "",
      members: [],
      createdAt: Date.now(),
      synced: false,
    };
    await saveDraftRow(newRow);
    await enqueueSyncAction({
      type: "createRow",
      localId: newRow.localId,
      payload: {
        sheetLocalId: localId,
        rowNumber: newRow.rowNumber,
        time: newRow.time,
        observation: newRow.observation,
        members: newRow.members,
        createdAt: newRow.createdAt,
      },
    });
    await refreshDraftCounts();
    setRows((prev) => [...prev, newRow]);
    setEditingRowId(newRow.localId);
    setRowTime(newRow.time ?? "");
    setRowObs("");
    setRowCins("");
  };

  // ── Save row edits ─────────────────────────────────────────────────────────
  const handleSaveRow = async (rowLocalId: string) => {
    const members = rowCins
      .split(/[,\s]+/)
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);

    await updateDraftRow(rowLocalId, {
      time: rowTime || undefined,
      observation: rowObs || undefined,
      members,
    });
    await enqueueSyncAction({
      type: "updateRow",
      localId: rowLocalId,
      payload: { time: rowTime || undefined, observation: rowObs || undefined },
    });
    setRows((prev) =>
      prev.map((r) =>
        r.localId === rowLocalId
          ? { ...r, time: rowTime || undefined, observation: rowObs || undefined, members }
          : r
      )
    );
    setEditingRowId(null);
    toast.success("Row saved locally");
  };

  // ── Delete row ─────────────────────────────────────────────────────────────
  const handleDeleteRow = async (rowLocalId: string) => {
    await deleteDraftRow(rowLocalId);
    await enqueueSyncAction({ type: "deleteRow", localId: rowLocalId });
    await refreshDraftCounts();
    setRows((prev) => prev.filter((r) => r.localId !== rowLocalId));
    if (editingRowId === rowLocalId) setEditingRowId(null);
    toast.success("Row removed");
  };

  // ── Start editing a row ────────────────────────────────────────────────────
  const startEdit = (row: DraftRow) => {
    setEditingRowId(row.localId);
    setRowTime(row.time ?? "");
    setRowObs(row.observation ?? "");
    setRowCins(row.members.join(", "));
  };

  // ── Update sheet title ─────────────────────────────────────────────────────
  const handleTitleBlur = async (newTitle: string) => {
    if (!localId || !newTitle.trim()) return;
    await updateDraftSheet(localId, { title: newTitle.trim() });
    setSheet((prev) => (prev ? { ...prev, title: newTitle.trim() } : prev));
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading draft…
      </div>
    );
  }

  if (!sheet) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4 text-muted-foreground">
        <p>Draft sheet not found.</p>
        <Button variant="outline" onClick={() => navigate("/draft")}>
          Back to Drafts
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/draft")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <Input
            defaultValue={sheet.title}
            className="text-lg font-semibold"
            onBlur={(e) => handleTitleBlur(e.target.value)}
          />
        </div>
        <DraftBadge />
      </div>

      {/* Sheet meta */}
      <div className="rounded-lg border bg-amber-50/50 p-3 text-sm text-muted-foreground dark:bg-amber-900/10">
        <p>
          <strong>Team:</strong>{" "}
          {sheet.sheetCins.length > 0
            ? sheet.sheetCins.map((c) => c.cin).join(", ")
            : <span className="italic">No team members added</span>}
        </p>
        <p className="mt-1 text-xs">
          Created offline · {new Date(sheet.createdAt).toLocaleString()} · Will sync when online
        </p>
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {rows.length === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No rows yet. Tap "Add Row" to start recording observations.
          </div>
        )}

        {rows.map((row) => (
          <div
            key={row.localId}
            className="rounded-lg border bg-card shadow-sm"
          >
            {editingRowId === row.localId ? (
              /* ── Edit mode ── */
              <div className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Input
                    placeholder="Time (e.g. 07:34 AM)"
                    value={rowTime}
                    onChange={(e) => setRowTime(e.target.value)}
                    className="w-40"
                  />
                  <span className="text-xs text-muted-foreground">CINs:</span>
                  <Input
                    placeholder="e.g. 459, 503"
                    value={rowCins}
                    onChange={(e) => setRowCins(e.target.value)}
                    className="flex-1"
                  />
                </div>
                <Textarea
                  placeholder="Observation…"
                  value={rowObs}
                  onChange={(e) => setRowObs(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditingRowId(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => handleSaveRow(row.localId)}>
                    <Save className="mr-1 h-3 w-3" />
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              /* ── View mode ── */
              <div
                className="flex cursor-pointer items-start gap-3 p-4 hover:bg-muted/30"
                onClick={() => startEdit(row)}
              >
                <div className="w-20 shrink-0 font-mono text-sm text-muted-foreground">
                  {row.time ?? "—"}
                </div>
                <div className="flex-1 text-sm">
                  {row.observation ? (
                    <p className="whitespace-pre-wrap">{row.observation}</p>
                  ) : (
                    <p className="italic text-muted-foreground">Tap to add observation…</p>
                  )}
                  {row.members.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {row.members.map((cin) => (
                        <Badge key={cin} variant="secondary" className="text-xs">
                          {cin}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteRow(row.localId);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add row button */}
      <Button className="w-full" variant="outline" onClick={handleAddRow}>
        <Plus className="mr-2 h-4 w-4" />
        Add Row
      </Button>
    </div>
  );
}
