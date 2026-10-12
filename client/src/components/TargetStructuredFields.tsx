/**
 * Shared structured-input field groups for Targets and Associates.
 *
 * The Target Registry used to be single free-text fields per detail (Full
 * Name/Born, Home Address Full, Vehicle 1 Full) — reliant on an officer
 * typing the exact running-sheet convention correctly. These components
 * replace that with individual controlled fields; the caller composes the
 * final name/tgt, hbf/hb, v1f/v1 strings via composeTargetName/
 * composeAddress/composeVehicle in addressFormat.ts and shows a live
 * preview of what will actually be recorded.
 *
 * Used by TargetRegistry.tsx (Target details + Add Target dialog),
 * OperationDetail.tsx's embedded target card, and the Associates UI —
 * kept as one shared set of components so structured input can't be
 * bypassed by editing a target from a different page.
 */

import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AddressAutocompleteInput } from "@/components/AddressAutocompleteInput";
import {
  MDL_STATUSES,
  MDL_LABELS,
  YES_NO,
  YES_NO_LABELS,
  TARGET_SPECIAL_PROJECTS,
  parseSpecialProjects,
  sanitizeTargetSpecialProjects,
} from "@shared/targetStatus";
import {
  composeAddress,
  composeTargetName,
  composeVehicle,
  parseDdMmYyyyDate,
  formatDdMmYyyyInput,
  structuredAddressFromGoogleComponents,
  STREET_TYPE_OPTIONS,
  AU_STATE_OPTIONS,
  VEHICLE_TYPE_OPTIONS,
  type StructuredAddressParts,
  type StructuredNameParts,
  type StructuredVehicleParts,
} from "@/lib/addressFormat";

// ─── Repeatable extra address/vehicle entries ──────────────────────────────
// Shared shape for a target/associate's "+Add Address" / "+Add Vehicle"
// entries — each carries its own structured parts plus the composed
// full/short strings, same convention as the primary address/vehicle.

export type ExtraVehicle = StructuredVehicleParts & {
  /** Stable identity for this entry, independent of its position in the
   * list — lets "Add new" history (target_field_history) stay attached to
   * the right entry even if others are added/removed/reordered around it.
   * Backfilled on first parse for entries saved before this field existed. */
  id: string;
  vehicleType: string;
  full: string;
  short: string;
};
export type ExtraAddress = StructuredAddressParts & {
  id: string;
  label: string;
  full: string;
  short: string;
};

export function makeExtraId(): string {
  return `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function parseExtraVehicles(
  json: string | null | undefined
): ExtraVehicle[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as Partial<ExtraVehicle>[];
    return arr.map(v => ({
      id: v.id || makeExtraId(),
      registration: v.registration ?? "",
      state: v.state ?? "WA",
      colour: v.colour ?? "",
      make: v.make ?? "",
      model: v.model ?? "",
      vehicleType: v.vehicleType ?? "",
      full: v.full ?? "",
      short: v.short ?? "",
    }));
  } catch {
    return [];
  }
}

export function parseExtraAddresses(
  json: string | null | undefined
): ExtraAddress[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as Partial<ExtraAddress>[];
    return arr.map(a => ({
      id: a.id || makeExtraId(),
      label: a.label ?? "",
      businessName: a.businessName ?? "",
      unitNo: a.unitNo ?? "",
      houseNo: a.houseNo ?? "",
      streetName: a.streetName ?? "",
      streetType: a.streetType ?? "",
      suburb: a.suburb ?? "",
      state: a.state ?? "WA",
      full: a.full ?? "",
      short: a.short ?? "",
    }));
  } catch {
    return [];
  }
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">
      {children}
    </label>
  );
}

function Preview({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="text-xs text-muted-foreground/80 italic break-words">
      Will record: {text}
    </p>
  );
}

// ─── Identity (First name/s, SURNAME, Born) ────────────────────────────────

// ─── Status (MDL + Bail) ───────────────────────────────────────────────────
// Person-target only. All four values are "" until an officer picks one;
// MDL is compulsory when saving a person target (callers enforce that with
// mdlMissing(); this component only shows the inline error when told to).

export type TargetStatusParts = {
  mdlStatus: string;
  bailStatus: string;
  bailConditions: string;
  bailConditionsText: string;
  /** JSON [{key, detail}] for TI / LBS / SEEK / CAD — same shape as the
   * Sheet Summary's Special Projects ("" when none ticked). */
  specialProjects: string;
};

export const EMPTY_STATUS_PARTS: TargetStatusParts = {
  mdlStatus: "",
  bailStatus: "",
  bailConditions: "",
  bailConditionsText: "",
  specialProjects: "",
};

/** True when the compulsory MDL dropdown hasn't been answered. */
export function mdlMissing(status: TargetStatusParts): boolean {
  return !status.mdlStatus;
}

/** Normalises a status value as read from the server (null → ""). */
export function statusPartsFromRecord(r: {
  mdlStatus?: string | null;
  bailStatus?: string | null;
  bailConditions?: string | null;
  bailConditionsText?: string | null;
  specialProjects?: string | null;
}): TargetStatusParts {
  return {
    mdlStatus: r.mdlStatus ?? "",
    bailStatus: r.bailStatus ?? "",
    bailConditions: r.bailConditions ?? "",
    bailConditionsText: r.bailConditionsText ?? "",
    specialProjects: r.specialProjects ?? "",
  };
}

/** The server payload for a status block: blanks → null, and the
 * conditions fields are cleared whenever the answer above them no longer
 * applies, so stale conditions never linger behind a "No". */
export function statusPartsToPayload(status: TargetStatusParts) {
  const bailYes = status.bailStatus === "yes";
  const conditionsYes = bailYes && status.bailConditions === "yes";
  return {
    mdlStatus: (status.mdlStatus || null) as
      | "active"
      | "none"
      | "suspended"
      | null,
    bailStatus: (status.bailStatus || null) as "yes" | "no" | null,
    bailConditions: (bailYes ? status.bailConditions || null : null) as
      | "yes"
      | "no"
      | null,
    bailConditionsText: conditionsYes
      ? status.bailConditionsText.trim() || null
      : null,
    specialProjects: sanitizeTargetSpecialProjects(status.specialProjects),
  };
}

export function TargetStatusFields({
  value,
  onChange,
  disabled,
  showMdlError,
}: {
  value: TargetStatusParts;
  onChange: (v: TargetStatusParts) => void;
  disabled?: boolean;
  /** Show the "MDL is required" error under the dropdown. */
  showMdlError?: boolean;
}) {
  const bailYes = value.bailStatus === "yes";
  const conditionsYes = bailYes && value.bailConditions === "yes";
  const mdlError = !!showMdlError && mdlMissing(value);
  // MDL and Bail stand out in red until they're answered, so they get
  // noticed and completed (not only after a failed save).
  const UNANSWERED =
    "border-red-500 bg-red-50 ring-1 ring-red-400/60 dark:bg-red-950/30";
  const mdlUnanswered = !disabled && mdlMissing(value);
  const bailUnanswered = !disabled && !value.bailStatus;
  const projects = parseSpecialProjects(value.specialProjects);
  const writeProjects = (next: { key: string; detail: string }[]) =>
    onChange({
      ...value,
      specialProjects: next.length ? JSON.stringify(next) : "",
    });
  const toggleProject = (key: string) =>
    writeProjects(
      projects.some(p => p.key === key)
        ? projects.filter(p => p.key !== key)
        : [...projects, { key, detail: "" }]
    );
  const setProjectDetail = (key: string, detail: string) =>
    writeProjects(projects.map(p => (p.key === key ? { ...p, detail } : p)));
  return (
    <div className="flex flex-col gap-3 border-t border-border/40 pt-3">
      {/* Single column on a phone so every dropdown is the same full width
          and no label wraps; side by side from sm up (three across once
          Bail Conditions appears, so the row stays evenly filled). */}
      <div
        className={`grid grid-cols-1 gap-3 ${bailYes ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
      >
        <div className="flex flex-col gap-1.5">
          <FieldLabel>MDL *</FieldLabel>
          <Select
            value={value.mdlStatus}
            onValueChange={v => onChange({ ...value, mdlStatus: v })}
            disabled={disabled}
          >
            <SelectTrigger
              title="Motor Drivers Licence"
              className={`w-full ${mdlError ? "border-destructive" : ""} ${
                mdlUnanswered ? UNANSWERED : ""
              }`}
            >
              <SelectValue placeholder="Licence status…" />
            </SelectTrigger>
            <SelectContent>
              {MDL_STATUSES.map(m => (
                <SelectItem key={m} value={m}>
                  {MDL_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {mdlError && (
            <p className="text-xs text-destructive">MDL status is required.</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Bail</FieldLabel>
          <Select
            value={value.bailStatus}
            onValueChange={v =>
              onChange({
                ...value,
                bailStatus: v,
                // Answers below a "No" no longer apply.
                ...(v === "yes"
                  ? {}
                  : { bailConditions: "", bailConditionsText: "" }),
              })
            }
            disabled={disabled}
          >
            <SelectTrigger
              className={`w-full ${bailUnanswered ? UNANSWERED : ""}`}
            >
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {YES_NO.map(y => (
                <SelectItem key={y} value={y}>
                  {YES_NO_LABELS[y]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {bailYes && (
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Bail Conditions</FieldLabel>
            <Select
              value={value.bailConditions}
              onValueChange={v =>
                onChange({
                  ...value,
                  bailConditions: v,
                  ...(v === "yes" ? {} : { bailConditionsText: "" }),
                })
              }
              disabled={disabled}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {YES_NO.map(y => (
                  <SelectItem key={y} value={y}>
                    {YES_NO_LABELS[y]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {conditionsYes && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Conditions</FieldLabel>
          <Textarea
            value={value.bailConditionsText}
            disabled={disabled}
            onChange={e =>
              onChange({ ...value, bailConditionsText: e.target.value })
            }
            placeholder="Reporting conditions - days, location"
            rows={3}
          />
        </div>
      )}
      {/* Special Projects — a checklist, each ticked project getting its own
          agency box, exactly as on the Sheet Summary (and stored the same
          way, so a new running sheet's summary copies it across). */}
      <div className="flex flex-col gap-2">
        <FieldLabel>Special Projects</FieldLabel>
        <div className="grid grid-cols-4 gap-2">
          {TARGET_SPECIAL_PROJECTS.map(key => {
            const checked = projects.some(p => p.key === key);
            return (
              <label
                key={key}
                className="flex items-center justify-center gap-1.5 text-sm cursor-pointer rounded-md border border-border/60 bg-background/60 py-1.5"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggleProject(key)}
                  className="w-4 h-4 rounded border-border"
                />
                {key}
              </label>
            );
          })}
        </div>
        {projects.length > 0 && (
          <div className="flex flex-col gap-2">
            {projects.map(p => (
              <div key={p.key} className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground w-12 shrink-0">
                  {p.key}
                </span>
                <Input
                  value={p.detail}
                  disabled={disabled}
                  onChange={e =>
                    setProjectDetail(p.key, e.target.value.toUpperCase())
                  }
                  placeholder="AFP or WAPOL"
                  className="text-sm"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function TargetIdentityFields({
  value,
  onChange,
  disabled,
  onSurnameBlur,
  status,
  onStatusChange,
  showMdlError,
}: {
  value: StructuredNameParts;
  onChange: (v: StructuredNameParts) => void;
  disabled?: boolean;
  /** Person targets only: when both are given, the MDL / Bail block renders
   * directly under Born. Associates/residents leave these off. */
  status?: TargetStatusParts;
  onStatusChange?: (v: TargetStatusParts) => void;
  showMdlError?: boolean;
  /** Fired when the Surname field loses focus — lets a caller (e.g. the Add
   * Target dialog) run a possible-duplicate check as soon as a full name is
   * entered, rather than only at Save. Optional so callers that don't need
   * it (editing an existing target) are unaffected. */
  onSurnameBlur?: () => void;
}) {
  const bornInvalid =
    value.bornDate.trim().length > 0 && !parseDdMmYyyyDate(value.bornDate);
  const { name } = composeTargetName(value);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <FieldLabel>First Name/s</FieldLabel>
          <Input
            value={value.firstNames}
            disabled={disabled}
            onChange={e => onChange({ ...value, firstNames: e.target.value })}
            placeholder="Paul"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Surname</FieldLabel>
          <Input
            value={value.surname}
            disabled={disabled}
            onChange={e =>
              onChange({ ...value, surname: e.target.value.toUpperCase() })
            }
            onBlur={onSurnameBlur}
            placeholder="HOGAN"
            className="uppercase"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Born</FieldLabel>
        <Input
          value={value.bornDate}
          disabled={disabled}
          onChange={e =>
            onChange({
              ...value,
              bornDate: formatDdMmYyyyInput(e.target.value),
            })
          }
          placeholder="dd/mm/yyyy"
          inputMode="numeric"
          className={bornInvalid ? "border-destructive" : ""}
        />
        {bornInvalid && (
          <p className="text-xs text-destructive">
            Enter a valid date as dd/mm/yyyy.
          </p>
        )}
      </div>
      <Preview text={name} />
      {status && onStatusChange && (
        <TargetStatusFields
          value={status}
          onChange={onStatusChange}
          disabled={disabled}
          showMdlError={showMdlError}
        />
      )}
    </div>
  );
}

// ─── Address (Unit No., House No., Street name + type, SUBURB, State) ─────

export function TargetAddressFields({
  value,
  onChange,
  disabled,
  label,
  onLabelChange,
}: {
  value: StructuredAddressParts;
  onChange: (v: StructuredAddressParts) => void;
  disabled?: boolean;
  /** Optional free-text label — only shown for extra (non-primary) addresses, e.g. "Workplace". */
  label?: string;
  onLabelChange?: (v: string) => void;
}) {
  const { full } = composeAddress(value);
  const [placeSearch, setPlaceSearch] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Search to autofill (optional)</FieldLabel>
        <AddressAutocompleteInput
          value={placeSearch}
          onChange={setPlaceSearch}
          onPlaceSelected={({ addressComponents, businessName }) => {
            const parsed =
              structuredAddressFromGoogleComponents(addressComponents);
            onChange({
              ...value,
              ...parsed,
              ...(businessName ? { businessName } : {}),
            });
            setPlaceSearch("");
          }}
          searchScope="any"
          placeholder="Search an address, place, or business…"
          disabled={disabled}
        />
      </div>
      <div className={onLabelChange ? "grid grid-cols-2 gap-3" : ""}>
        {onLabelChange && (
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Label (optional)</FieldLabel>
            <Input
              value={label ?? ""}
              disabled={disabled}
              onChange={e => onLabelChange(e.target.value)}
              placeholder="e.g. Workplace, Second home…"
            />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Business / place name (optional)</FieldLabel>
          <Input
            value={value.businessName ?? ""}
            disabled={disabled}
            onChange={e => onChange({ ...value, businessName: e.target.value })}
            placeholder="e.g. Woolworths Fremantle — particularly for a work address"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Unit No.</FieldLabel>
          <Input
            value={value.unitNo}
            disabled={disabled}
            onChange={e => onChange({ ...value, unitNo: e.target.value })}
            placeholder="(optional)"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>House No.</FieldLabel>
          <Input
            value={value.houseNo}
            disabled={disabled}
            onChange={e => onChange({ ...value, houseNo: e.target.value })}
            placeholder="42"
          />
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Street Name</FieldLabel>
          <Input
            value={value.streetName}
            disabled={disabled}
            onChange={e => onChange({ ...value, streetName: e.target.value })}
            placeholder="Wallaby"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Street Type</FieldLabel>
          <Select
            value={value.streetType || undefined}
            onValueChange={v => onChange({ ...value, streetType: v })}
            disabled={disabled}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {STREET_TYPE_OPTIONS.map(t => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Suburb</FieldLabel>
          <Input
            value={value.suburb}
            disabled={disabled}
            onChange={e =>
              onChange({ ...value, suburb: e.target.value.toUpperCase() })
            }
            placeholder="SYDNEY"
            className="uppercase"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>State</FieldLabel>
          <Select
            value={value.state || "WA"}
            onValueChange={v => onChange({ ...value, state: v })}
            disabled={disabled}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AU_STATE_OPTIONS.map(s => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Preview text={full} />
    </div>
  );
}

// ─── Vehicle (Registration, State, Colour, Make, Model, Type) ─────────────

export function TargetVehicleFields({
  value,
  onChange,
  disabled,
}: {
  value: StructuredVehicleParts & { vehicleType: string };
  onChange: (v: StructuredVehicleParts & { vehicleType: string }) => void;
  disabled?: boolean;
}) {
  const { full } = composeVehicle(value);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Registration</FieldLabel>
          <Input
            value={value.registration}
            disabled={disabled}
            onChange={e =>
              onChange({
                ...value,
                registration: e.target.value.toUpperCase(),
              })
            }
            placeholder="1FAT004"
            className="uppercase"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>State</FieldLabel>
          <Select
            value={value.state || "WA"}
            onValueChange={v => onChange({ ...value, state: v })}
            disabled={disabled}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AU_STATE_OPTIONS.map(s => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Colour</FieldLabel>
          <Input
            value={value.colour}
            disabled={disabled}
            onChange={e => onChange({ ...value, colour: e.target.value })}
            placeholder="red"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Make</FieldLabel>
          <Input
            value={value.make}
            disabled={disabled}
            onChange={e => onChange({ ...value, make: e.target.value })}
            placeholder="Holden"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Model</FieldLabel>
          <Input
            value={value.model}
            disabled={disabled}
            onChange={e => onChange({ ...value, model: e.target.value })}
            placeholder="Monaro"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Type</FieldLabel>
          <Select
            value={value.vehicleType || undefined}
            onValueChange={v => onChange({ ...value, vehicleType: v })}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {VEHICLE_TYPE_OPTIONS.map(t => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Preview text={full} />
    </div>
  );
}

export const EMPTY_NAME_PARTS: StructuredNameParts = {
  firstNames: "",
  surname: "",
  bornDate: "",
};

export const EMPTY_ADDRESS_PARTS: StructuredAddressParts = {
  unitNo: "",
  houseNo: "",
  streetName: "",
  streetType: "",
  suburb: "",
  state: "WA",
  businessName: "",
};

export const EMPTY_VEHICLE_PARTS: StructuredVehicleParts & {
  vehicleType: string;
} = {
  registration: "",
  state: "WA",
  colour: "",
  make: "",
  model: "",
  vehicleType: "",
};
