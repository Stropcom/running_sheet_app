// Part of the Intelligence page (client/src/pages/Intelligence.tsx): the entity profile dialog.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { useMemo } from "react";
import { useLocation } from "wouter";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  User,
  Car,
  MapPin,
  Building2,
  FileDown,
  ChevronRight,
  Calendar,
} from "lucide-react";
import { formatIntelVehicle } from "@/lib/addressFormat";
import type { Entity } from "./types";
import {
  placeLabel,
  TYPE_LABELS,
  TYPE_ICONS,
  TARGET_COLOR,
  TYPE_COLORS,
  uniqueSheets,
} from "./helpers";
import { printProfilePdf } from "./profileHtml";

// ─── Profile Dialog ───────────────────────────────────────────────────────────

export function ProfileDialog({
  entity,
  allEntities,
  onClose,
  onNavigate,
}: {
  entity: Entity;
  allEntities: Entity[];
  onClose: () => void;
  onNavigate: (e: Entity) => void;
}) {
  const [, navigate] = useLocation();
  const mySheetIds = useMemo(
    () => new Set(entity.occurrences.map(o => o.sheetId)),
    [entity]
  );

  const relatedVehicles = useMemo(
    () =>
      allEntities.filter(
        e =>
          e.type === "vehicle" &&
          e.occurrences.some(o => mySheetIds.has(o.sheetId))
      ),
    [allEntities, mySheetIds]
  );
  const relatedAddresses = useMemo(
    () =>
      allEntities.filter(
        e =>
          e.type === "address" &&
          e.occurrences.some(o => mySheetIds.has(o.sheetId))
      ),
    [allEntities, mySheetIds]
  );
  const relatedBusinesses = useMemo(
    () =>
      allEntities.filter(
        e =>
          e.type === "business" &&
          e.occurrences.some(o => mySheetIds.has(o.sheetId))
      ),
    [allEntities, mySheetIds]
  );
  const relatedPersons = useMemo(
    () =>
      allEntities.filter(
        e =>
          e.type === "person" &&
          e.shortForm !== entity.shortForm &&
          e.occurrences.some(o => mySheetIds.has(o.sheetId))
      ),
    [allEntities, mySheetIds, entity.shortForm]
  );

  const sheets = useMemo(() => uniqueSheets(entity.occurrences), [entity]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${entity.isTarget ? TARGET_COLOR : TYPE_COLORS[entity.type]}`}
            >
              {TYPE_ICONS[entity.type]}
              {TYPE_LABELS[entity.type]}
            </span>
            <span className="font-mono text-lg">
              {entity.type === "vehicle"
                ? formatIntelVehicle(
                    entity.shortForm,
                    entity.occurrences[0]?.fullDescription
                  )
                : entity.type === "address" || entity.type === "business"
                  ? placeLabel(entity.shortForm)
                  : entity.shortForm}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Appearances
            </p>
            <p className="font-semibold text-foreground">
              {entity.occurrences.length} observation
              {entity.occurrences.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Running Sheets
            </p>
            <p className="font-semibold text-foreground">
              {sheets.length} sheet{sheets.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Running sheets — clickable titles only, moved up */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Running Sheets
          </p>
          <div className="space-y-1">
            {sheets.map(sheet => (
              <button
                key={sheet.sheetId}
                onClick={() => {
                  onClose();
                  setTimeout(() => navigate(`/sheet/${sheet.sheetId}`), 0);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-muted/20 hover:bg-accent/10 transition-colors text-left"
              >
                <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-medium text-foreground break-words min-w-0 flex-1">
                  {sheet.sheetTitle}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-auto" />
              </button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Vehicles — clickable pills */}
        {relatedVehicles.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Associated Vehicles
            </p>
            <div className="flex flex-wrap gap-2">
              {relatedVehicles.map(v => (
                <button
                  key={v.shortForm}
                  onClick={() => onNavigate(v)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity ${TYPE_COLORS.vehicle}`}
                >
                  <Car className="w-3 h-3" />
                  {formatIntelVehicle(
                    v.shortForm,
                    v.occurrences[0]?.fullDescription
                  )}
                  <span className="opacity-60">×{v.occurrences.length}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Addresses — clickable pills */}
        {relatedAddresses.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Associated Addresses
            </p>
            <div className="flex flex-wrap gap-2">
              {relatedAddresses.map(a => (
                <button
                  key={a.shortForm}
                  onClick={() => onNavigate(a)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity ${TYPE_COLORS.address}`}
                >
                  <MapPin className="w-3 h-3" />
                  {placeLabel(a.shortForm)}
                  <span className="opacity-60">×{a.occurrences.length}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Associated Persons — clickable pills */}
        {relatedPersons.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Associated Persons
            </p>
            <div className="flex flex-wrap gap-2">
              {relatedPersons.map(p => (
                <button
                  key={p.shortForm}
                  onClick={() => onNavigate(p)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity ${TYPE_COLORS.person}`}
                >
                  <User className="w-3 h-3" />
                  {p.shortForm}
                  <span className="opacity-60">×{p.occurrences.length}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Businesses — clickable pills */}
        {relatedBusinesses.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Associated Businesses
            </p>
            <div className="flex flex-wrap gap-2">
              {relatedBusinesses.map(b => (
                <button
                  key={b.shortForm}
                  onClick={() => onNavigate(b)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity ${TYPE_COLORS.business}`}
                >
                  <Building2 className="w-3 h-3" />
                  {placeLabel(b.shortForm)}
                  <span className="opacity-60">×{b.occurrences.length}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <Separator />

        {/* Single export button at the bottom */}
        <Button
          onClick={() => printProfilePdf(entity, allEntities)}
          className="w-full gap-2"
        >
          <FileDown className="w-4 h-4" />
          Export Profile to PDF
        </Button>
      </DialogContent>
    </Dialog>
  );
}
