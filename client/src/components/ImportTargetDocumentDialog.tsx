/**
 * "Import from Document" — upload a .docx target-profile document, parse it
 * deterministically server-side (server/documentImport/, no AI/LLM call —
 * see CLAUDE.md's Golden Rule), and review the proposed fields before
 * handing off to AddTargetDialog to actually save. This dialog never
 * writes anything itself for the PRIMARY target — `onContinue` receives the
 * converted pre-fill and the caller opens AddTargetDialog with it, so the
 * exact same possible-duplicate/merge flow every other new target goes
 * through still applies here (see AddTargetDialog's own findPossibleDuplicate
 * + TargetMergeDialog — that already handles "old address becomes Previous"
 * and appends extra vehicles/addresses correctly).
 *
 * ASSOCIATES are different: nothing downstream ever checks whether a
 * document-parsed associate already exists (AddTargetDialog's own
 * saveStagedAssociates deliberately skips duplicate-checking, since it's
 * staging several at once — see its own comment). So this dialog runs that
 * check itself, right after parsing, using findPossibleDuplicatePerson
 * (searches the real Target+Associate registry directly, not just mined
 * intel entities — an associate never mentioned in any running sheet
 * wouldn't show up in the mined-entity check AddTargetDialog's safety net
 * relies on). A matched associate can be updated in place (address/vehicle
 * only — overwritten, no "Previous" history: associates don't have that
 * mechanism today, unlike targets) instead of creating a duplicate.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  Upload,
  Loader2,
  AlertTriangle,
  User,
  Building2,
  Mail,
  Phone,
  Link2,
} from "lucide-react";
import {
  EMPTY_ADDRESS_PARTS,
  EMPTY_VEHICLE_PARTS,
  makeExtraId,
  type ExtraAddress,
  type ExtraVehicle,
} from "@/components/TargetStructuredFields";
import type { StagedAssociate } from "@/components/AddTargetDialog";
import {
  composeAddress,
  composeVehicle,
  type StructuredAddressParts,
  type StructuredNameParts,
  type StructuredVehicleParts,
} from "@/lib/addressFormat";

export interface DocumentImportPrefill {
  identity: StructuredNameParts;
  address: typeof EMPTY_ADDRESS_PARTS;
  vehicle: StructuredVehicleParts & { vehicleType: string };
  extraAddresses: ExtraAddress[];
  extraVehicles: ExtraVehicle[];
  associates: StagedAssociate[];
  /** The document's free-text narrative, verbatim — carried through to
   * AddTargetDialog as the new target's "{Operation name} background". */
  background: string;
  /** The uploaded file's own name — shown on the Operation/Target profile's
   * imported-document panels so an officer can tell which document a
   * version came from. Not the file itself; the document is never stored,
   * see the parseDocx procedure's comment. */
  sourceFileName: string;
}

interface PossibleMatch {
  type: "target" | "associate";
  id: number;
  name: string;
  score: number;
  reason: string;
}

interface AssociateCandidate {
  key: string;
  firstNames: string;
  surname: string;
  address: StructuredAddressParts | null;
  vehicle: (StructuredVehicleParts & { vehicleType: string }) | null;
}

type AssociateChoice = "create" | "update" | "skip";

const CANDIDATE_ICONS = {
  person: User,
  business: Building2,
  email: Mail,
  phone: Phone,
} as const;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

export function ImportTargetDocumentDialog({
  open,
  onClose,
  onContinue,
}: {
  open: boolean;
  onClose: () => void;
  /** Fires once the officer confirms the review screen — the caller opens
   * AddTargetDialog pre-filled with this. */
  onContinue: (prefill: DocumentImportPrefill) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const parseMut = trpc.target.registry.parseDocx.useMutation();
  const utils = trpc.useUtils();
  const updateAssociateMut = trpc.associate.update.useMutation();

  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [applying, setApplying] = useState(false);
  const [primaryMatch, setPrimaryMatch] = useState<PossibleMatch | null>(null);
  const [associateMatches, setAssociateMatches] = useState<
    Record<string, PossibleMatch | null>
  >({});
  const [associateChoices, setAssociateChoices] = useState<
    Record<string, AssociateChoice>
  >({});

  const result = parseMut.data;

  // Every associate candidate the parser found, in one list with a stable
  // key — block-derived (full address/vehicle) and bare mentions alike.
  // Computed once per result so the duplicate-check effect and the
  // eventual save both work off the exact same keyed list.
  const associateCandidates: AssociateCandidate[] = useMemo(() => {
    if (!result) return [];
    const blocks: AssociateCandidate[] = result.associateBlocks.map(a => ({
      key: makeExtraId(),
      firstNames: a.firstNames,
      surname: a.surname,
      address: a.address
        ? {
            unitNo: a.address.unitNo,
            houseNo: a.address.houseNo,
            streetName: a.address.streetName,
            streetType: a.address.streetType,
            suburb: a.address.suburb,
            state: a.address.state,
            businessName: "",
          }
        : null,
      vehicle: a.vehicle
        ? {
            registration: a.vehicle.registration,
            state: a.vehicle.state,
            colour: a.vehicle.colour,
            make: a.vehicle.make,
            model: a.vehicle.model,
            vehicleType: a.vehicle.vehicleType,
          }
        : null,
    }));
    const bare: AssociateCandidate[] = result.candidateEntities
      .filter(c => c.type === "person")
      .map(c => {
        const words = c.value.trim().split(/\s+/);
        const last = words[words.length - 1] ?? "";
        const firstNames = words.slice(0, -1).join(" ");
        return {
          key: makeExtraId(),
          firstNames: firstNames || c.value,
          surname: firstNames ? last : "",
          address: null,
          vehicle: null,
        };
      });
    return [...blocks, ...bare];
  }, [result]);

  const reset = () => {
    setFileName("");
    setError("");
    parseMut.reset();
    setPrimaryMatch(null);
    setAssociateMatches({});
    setAssociateChoices({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFilePicked = async (file: File) => {
    setError("");
    setFileName(file.name);
    if (!/\.docx$/i.test(file.name)) {
      setError(
        "Only Word (.docx) documents are supported right now — PDF support is planned."
      );
      return;
    }
    try {
      const dataBase64 = await readFileAsBase64(file);
      await parseMut.mutateAsync({ dataBase64 });
    } catch (err: any) {
      setError(
        err?.message ??
          "Couldn't read that document — it may be corrupt or in an unsupported format."
      );
    }
  };

  // Right after a successful parse, check the primary name and every
  // associate candidate against the combined Target+Associate registry —
  // see the module comment for why this can't just wait for AddTargetDialog
  // or saveStagedAssociates to catch it later.
  useEffect(() => {
    if (!result) return;
    let cancelled = false;
    (async () => {
      setCheckingDuplicates(true);
      try {
        if (result.name) {
          const fullName =
            `${result.name.firstNames} ${result.name.surname}`.trim();
          if (fullName) {
            const match =
              await utils.target.registry.findPossibleDuplicatePerson.fetch({
                name: fullName,
              });
            if (!cancelled) setPrimaryMatch(match);
          }
        }
        const entries = await Promise.all(
          associateCandidates.map(async a => {
            const fullName = `${a.firstNames} ${a.surname}`.trim();
            if (!fullName) return [a.key, null] as const;
            const match =
              await utils.target.registry.findPossibleDuplicatePerson.fetch({
                name: fullName,
              });
            return [a.key, match] as const;
          })
        );
        if (!cancelled) {
          const matches: Record<string, PossibleMatch | null> = {};
          const defaults: Record<string, AssociateChoice> = {};
          for (const [key, match] of entries) {
            matches[key] = match;
            defaults[key] =
              match?.type === "associate"
                ? "update"
                : match?.type === "target"
                  ? "skip"
                  : "create";
          }
          setAssociateMatches(matches);
          setAssociateChoices(defaults);
        }
      } catch (err) {
        console.warn("Document-import duplicate check failed", err);
      } finally {
        if (!cancelled) setCheckingDuplicates(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const handleContinue = async () => {
    if (!result) return;
    setApplying(true);
    try {
      // Associates the officer chose to update ALREADY have their own id
      // (they're an existing record, independent of whether the primary
      // target is new) — apply those now, directly, rather than staging
      // them into AddTargetDialog. Address/vehicle only: the match was
      // found by name similarity, not confirmed identical, so name/DOB
      // stay untouched — only overwrite what the document actually adds.
      const toUpdate = associateCandidates.filter(
        a => associateChoices[a.key] === "update" && associateMatches[a.key]
      );
      if (toUpdate.length > 0) {
        const results = await Promise.allSettled(
          toUpdate.map(a => {
            const match = associateMatches[a.key]!;
            const addr = composeAddress(a.address ?? EMPTY_ADDRESS_PARTS);
            const veh = composeVehicle(a.vehicle ?? EMPTY_VEHICLE_PARTS);
            return updateAssociateMut.mutateAsync({
              id: match.id,
              ...(a.address
                ? {
                    hbf: addr.full || null,
                    hb: addr.short || null,
                    addrUnitNo: a.address.unitNo || null,
                    addrHouseNo: a.address.houseNo || null,
                    addrStreetName: a.address.streetName || null,
                    addrStreetType: a.address.streetType || null,
                    addrSuburb: a.address.suburb || null,
                    addrState: a.address.state || null,
                  }
                : {}),
              ...(a.vehicle
                ? {
                    v1f: veh.full || null,
                    v1: veh.short || null,
                    vehRegistration: a.vehicle.registration || null,
                    vehState: a.vehicle.state || null,
                    vehColour: a.vehicle.colour || null,
                    vehMake: a.vehicle.make || null,
                    vehModel: a.vehicle.model || null,
                    vehType: a.vehicle.vehicleType || null,
                  }
                : {}),
            });
          })
        );
        const failed = results.filter(r => r.status === "rejected").length;
        if (failed > 0) {
          toast.error(
            `${failed} associate update${failed > 1 ? "s" : ""} failed — check them manually in the Target Registry.`
          );
        } else {
          toast.success(
            `Updated ${toUpdate.length} existing associate${toUpdate.length > 1 ? "s" : ""}.`
          );
        }
      }

      // Everything else the officer left as "Create as new" (the default
      // for anything with no match) stages into AddTargetDialog exactly as
      // before — "skip" and "update" are excluded here.
      const associates: StagedAssociate[] = associateCandidates
        .filter(a => (associateChoices[a.key] ?? "create") === "create")
        .map(a => ({
          key: a.key,
          identity: {
            firstNames: a.firstNames,
            surname: a.surname,
            bornDate: "",
          },
          address: a.address ?? EMPTY_ADDRESS_PARTS,
          vehicle: a.vehicle ?? EMPTY_VEHICLE_PARTS,
        }));

      const [primaryAddress, ...restAddresses] = result.addresses;
      const [primaryVehicle, ...restVehicles] = result.vehicles;

      // Content the document clearly intended as an address/vehicle but
      // that nothing could actually parse (see UnparsedItem) becomes a
      // real Extra Address/Vehicle card too — with the raw text dropped
      // into the field an officer would look at first (street name /
      // model) — rather than just being described on this screen and then
      // vanishing. The officer edits it into shape instead of retyping it
      // from the original document.
      const unparsedExtraAddresses: ExtraAddress[] = result.needsReview
        .filter(u => u.kind === "address")
        .map(u => ({
          id: makeExtraId(),
          label: u.label,
          businessName: "",
          unitNo: "",
          houseNo: "",
          streetName: u.raw,
          streetType: "",
          suburb: "",
          state: "WA",
          full: "",
          short: "",
        }));
      const unparsedExtraVehicles: ExtraVehicle[] = result.needsReview
        .filter(u => u.kind === "vehicle")
        .map(u => ({
          id: makeExtraId(),
          registration: "",
          state: "WA",
          colour: "",
          make: "",
          model: u.raw,
          vehicleType: "",
          full: "",
          short: "",
        }));

      onContinue({
        identity: result.name
          ? {
              firstNames: result.name.firstNames,
              surname: result.name.surname,
              bornDate: result.name.bornDate,
            }
          : { firstNames: "", surname: "", bornDate: "" },
        address: primaryAddress
          ? {
              unitNo: primaryAddress.unitNo,
              houseNo: primaryAddress.houseNo,
              streetName: primaryAddress.streetName,
              streetType: primaryAddress.streetType,
              suburb: primaryAddress.suburb,
              state: primaryAddress.state,
              businessName: "",
            }
          : EMPTY_ADDRESS_PARTS,
        vehicle: primaryVehicle
          ? {
              registration: primaryVehicle.registration,
              state: primaryVehicle.state,
              colour: primaryVehicle.colour,
              make: primaryVehicle.make,
              model: primaryVehicle.model,
              vehicleType: primaryVehicle.vehicleType,
            }
          : EMPTY_VEHICLE_PARTS,
        extraAddresses: [
          ...restAddresses.map(a => ({
            id: makeExtraId(),
            label: a.label,
            businessName: "",
            unitNo: a.unitNo,
            houseNo: a.houseNo,
            streetName: a.streetName,
            streetType: a.streetType,
            suburb: a.suburb,
            state: a.state,
            full: "",
            short: "",
          })),
          ...unparsedExtraAddresses,
        ],
        extraVehicles: [
          ...restVehicles.map(v => ({
            id: makeExtraId(),
            registration: v.registration,
            state: v.state,
            colour: v.colour,
            make: v.make,
            model: v.model,
            vehicleType: v.vehicleType,
            full: "",
            short: "",
          })),
          ...unparsedExtraVehicles,
        ],
        associates,
        background: result.freeText.trim(),
        sourceFileName: fileName,
      });
      reset();
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Import from Document
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {!result && (
            <>
              <p className="text-sm text-muted-foreground">
                Upload a Word (.docx) document with target/associate details —
                fields it recognises will pre-fill the Add Target form for you
                to review and confirm. Nothing is saved automatically.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleFilePicked(file);
                }}
              />
              <Button
                variant="outline"
                className="gap-2 self-start"
                disabled={parseMut.isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                {parseMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {parseMut.isPending ? "Reading document…" : "Choose .docx file"}
              </Button>
              {fileName && !parseMut.isPending && (
                <p className="text-xs text-muted-foreground">{fileName}</p>
              )}
              {error && (
                <p className="text-xs text-destructive flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {error}
                </p>
              )}
            </>
          )}

          {result && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-muted-foreground">
                From <span className="font-medium">{fileName}</span> — review
                below, then continue to the Add Target form to edit anything and
                save.
              </p>

              {checkingDuplicates && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Checking the Target Registry for existing records…
                </p>
              )}

              {primaryMatch && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex flex-col gap-1">
                  <p className="text-xs font-bold text-amber-600 uppercase tracking-wide flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />
                    Matches an existing {primaryMatch.type}
                  </p>
                  <p className="text-sm">
                    This name is close to{" "}
                    <span className="font-medium">{primaryMatch.name}</span>,
                    already in the registry as a {primaryMatch.type} (
                    {primaryMatch.reason}).
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {primaryMatch.type === "target"
                      ? 'Continuing will offer to merge these details into that existing target — any new home address is kept as the current one with the old kept as "Previous"; any new vehicle works the same way.'
                      : "This person is currently filed as someone else's associate, not a target. Consider linking them from the Target Registry instead of continuing, unless this is genuinely a different person."}
                  </p>
                </div>
              )}

              <div className="rounded-lg border border-border/60 bg-muted/10 p-3 flex flex-col gap-1">
                <p className="text-xs font-bold text-primary uppercase tracking-wide">
                  Name
                </p>
                {result.name ? (
                  <p className="text-sm">
                    {result.name.firstNames} {result.name.surname}
                    {result.name.bornDate && (
                      <span className="text-muted-foreground">
                        {" "}
                        — Born {result.name.bornDate}
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No name field found — fill this in manually.
                  </p>
                )}
              </div>

              {result.addresses.length > 0 && (
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3 flex flex-col gap-1">
                  <p className="text-xs font-bold text-primary uppercase tracking-wide">
                    Addresses ({result.addresses.length})
                  </p>
                  {result.addresses.map((a, i) => (
                    <p key={i} className="text-sm">
                      {a.label && (
                        <span className="text-muted-foreground">
                          {a.label}:{" "}
                        </span>
                      )}
                      {[
                        a.unitNo && `${a.unitNo}/`,
                        a.houseNo,
                        a.streetName,
                        a.streetType,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      , {a.suburb} {a.state}
                      {!a.confident && (
                        <Badge variant="outline" className="ml-1.5 text-[10px]">
                          check street type
                        </Badge>
                      )}
                    </p>
                  ))}
                </div>
              )}

              {result.vehicles.length > 0 && (
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3 flex flex-col gap-1">
                  <p className="text-xs font-bold text-primary uppercase tracking-wide">
                    Vehicles ({result.vehicles.length})
                  </p>
                  {result.vehicles.map((v, i) => (
                    <p key={i} className="text-sm">
                      {v.registration} ({v.state}) — {v.colour} {v.make}{" "}
                      {v.model}
                      {v.vehicleType && ` ${v.vehicleType}`}
                      {!v.confident && (
                        <Badge variant="outline" className="ml-1.5 text-[10px]">
                          check details
                        </Badge>
                      )}
                    </p>
                  ))}
                </div>
              )}

              {result.needsReview.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex flex-col gap-2">
                  <p className="text-xs font-bold text-amber-600 uppercase tracking-wide flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Needs your review ({result.needsReview.length})
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    The document clearly had an address or vehicle here, but it
                    couldn't be read automatically. Each one below will be added
                    as an extra Address/Vehicle on the next screen with the
                    original text dropped in — split it into the right fields
                    there rather than retyping it from the document.
                  </p>
                  {result.needsReview.map((u, i) => (
                    <p key={i} className="text-sm">
                      <span className="text-muted-foreground">
                        {u.kind === "address"
                          ? u.label
                            ? `${u.label}: `
                            : "Address: "
                          : "Vehicle: "}
                      </span>
                      <span className="italic">{u.raw}</span>
                    </p>
                  ))}
                </div>
              )}

              {associateCandidates.length > 0 && (
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3 flex flex-col gap-3">
                  <p className="text-xs font-bold text-primary uppercase tracking-wide">
                    Associates found ({associateCandidates.length})
                  </p>
                  {associateCandidates.map(a => {
                    const match = associateMatches[a.key];
                    const choice = associateChoices[a.key] ?? "create";
                    return (
                      <div
                        key={a.key}
                        className="flex flex-col gap-1 pb-2 border-b border-border/40 last:border-b-0 last:pb-0"
                      >
                        <span className="text-sm font-medium">
                          {a.firstNames} {a.surname}
                        </span>
                        {a.address && (
                          <span className="text-muted-foreground text-xs">
                            {[
                              a.address.unitNo && `${a.address.unitNo}/`,
                              a.address.houseNo,
                              a.address.streetName,
                              a.address.streetType,
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            , {a.address.suburb} {a.address.state}
                          </span>
                        )}
                        {a.vehicle && (
                          <span className="text-muted-foreground text-xs">
                            {a.vehicle.registration} ({a.vehicle.state}) —{" "}
                            {a.vehicle.colour} {a.vehicle.make}{" "}
                            {a.vehicle.model}
                          </span>
                        )}
                        {match && (
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge
                              variant="outline"
                              className="gap-1 font-normal text-[10px]"
                            >
                              <Link2 className="w-3 h-3" />
                              Matches existing {match.type}: {match.name}
                            </Badge>
                            <Select
                              value={choice}
                              onValueChange={v =>
                                setAssociateChoices(prev => ({
                                  ...prev,
                                  [a.key]: v as AssociateChoice,
                                }))
                              }
                            >
                              <SelectTrigger className="h-7 w-auto text-xs gap-1.5">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {match.type === "associate" && (
                                  <SelectItem value="update">
                                    Update existing associate
                                  </SelectItem>
                                )}
                                <SelectItem value="create">
                                  Create as new anyway
                                </SelectItem>
                                <SelectItem value="skip">
                                  Skip — don't add
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {(result.freeText.trim() ||
                result.unmappedFields.length > 0 ||
                result.candidateEntities.some(c => c.type !== "person")) && (
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3 flex flex-col gap-3">
                  <p className="text-xs font-bold text-primary uppercase tracking-wide">
                    Other details in this document
                  </p>

                  {result.freeText.trim() && (
                    <div className="flex flex-col gap-1">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                        Narrative / Background
                      </p>
                      <p className="text-sm whitespace-pre-wrap">
                        {result.freeText.trim()}
                      </p>
                      <p className="text-[11px] text-muted-foreground italic">
                        Saved verbatim as this target's background against
                        whichever operation you pick or create on the next
                        screen.
                      </p>
                    </div>
                  )}

                  {result.unmappedFields.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                        Other fields
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Not part of the Target Registry schema — shown for your
                        awareness, not saved.
                      </p>
                      {result.unmappedFields.map((f, i) => (
                        <p key={i} className="text-sm">
                          <span className="text-muted-foreground">
                            {f.label}:
                          </span>{" "}
                          {f.value}
                        </p>
                      ))}
                    </div>
                  )}

                  {result.candidateEntities.some(c => c.type !== "person") && (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                        Other mentions
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Detected in the free-text narrative — for your awareness
                        only, not saved.
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {result.candidateEntities
                          .filter(c => c.type !== "person")
                          .map((c, i) => {
                            const Icon = CANDIDATE_ICONS[c.type];
                            return (
                              <Badge
                                key={i}
                                variant={
                                  c.confidence === "high"
                                    ? "default"
                                    : "outline"
                                }
                                className="gap-1 font-normal"
                              >
                                <Icon className="w-3 h-3" />
                                {c.value}
                              </Badge>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {result && (
            <Button
              onClick={handleContinue}
              disabled={applying || checkingDuplicates}
              className="gap-1.5"
            >
              {applying && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Continue to Add Target
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
