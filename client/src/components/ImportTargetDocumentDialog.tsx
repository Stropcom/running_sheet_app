/**
 * "Import from Document" — upload a .docx or .pdf target-profile document
 * (the file's own extension decides which reader runs, see the
 * parseDocument procedure — the officer never has to pick a type), parse it
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
  Check,
} from "lucide-react";
import {
  EMPTY_ADDRESS_PARTS,
  EMPTY_VEHICLE_PARTS,
  makeExtraId,
  type ExtraAddress,
  type ExtraVehicle,
} from "@/components/TargetStructuredFields";
import type { StagedAssociate } from "@/components/AddTargetDialog";
import { reflowNarrativeText } from "@/lib/textFormat";
import {
  composeAddress,
  composeVehicle,
  type StructuredAddressParts,
  type StructuredNameParts,
  type StructuredVehicleParts,
} from "@/lib/addressFormat";

// A photo extracted from the source document that the officer chose to
// keep on this review screen — staged the same way associates are (see
// StagedAssociate), actually saved (uploaded to the target's Images folder
// + run through on-device face recognition, see saveStagedImages in
// AddTargetDialog.tsx) once the target itself is saved.
export interface StagedImage {
  key: string;
  dataBase64: string;
  mimeType: string;
  width: number;
  height: number;
  /** Who this photo is of:
   * - "target" (default) — the primary target.
   * - "associate" — one of the NEW associates staged from the same
   *   document, matched by that associate's own `key` in `associates`
   *   below. No real id exists yet — resolved in AddTargetDialog's
   *   saveStagedImages once that associate is actually created.
   * - "existingAssociate" — an associate candidate that matched (and is
   *   being updated into) an ALREADY-REGISTERED associate. Its id is
   *   already known at review time, so the photo can link to it directly
   *   with no "wait for creation" step. */
  linkTo:
    | { type: "target" }
    | { type: "associate"; associateKey: string }
    | { type: "existingAssociate"; associateId: number; entityLabel: string };
}

export interface DocumentImportPrefill {
  identity: StructuredNameParts;
  address: typeof EMPTY_ADDRESS_PARTS;
  vehicle: StructuredVehicleParts & { vehicleType: string };
  extraAddresses: ExtraAddress[];
  extraVehicles: ExtraVehicle[];
  associates: StagedAssociate[];
  images: StagedImage[];
  /** The document's free-text narrative, verbatim — carried through to
   * AddTargetDialog as the new target's "{Operation name} background". */
  background: string;
  /** The uploaded file's own name — shown on the Operation/Target profile's
   * imported-document panels so an officer can tell which document a
   * version came from. */
  sourceFileName: string;
  /** The uploaded file's raw bytes/mime type, carried through so the save
   * mutation can store the original document (see storagePut in
   * server/routers.ts's target.registry.create) for the in-app document
   * viewer — not embedded in the JSON snapshot itself, see
   * documentSnapshotForHistory in AddTargetDialog.tsx. */
  sourceFileBase64: string;
  sourceFileMimeType: string;
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

// Colours the choice about to be taken for one associate candidate — reuses
// the exact green/amber/red meaning the Imported Documents diff cards
// already use for added/changed/removed, so the same colour means the same
// outcome everywhere in the app: create (new) = emerald, update (changing
// an existing record) = amber, skip (nothing happens) = rose. Driven by the
// live choice, not just the match type, so it updates as the officer
// changes the dropdown.
const ASSOCIATE_CHOICE_CLASSES: Record<
  AssociateChoice,
  { badge: string; select: string }
> = {
  create: {
    badge:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    select:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  },
  update: {
    badge:
      "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    select:
      "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  },
  skip: {
    badge: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400",
    select:
      "border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-300",
  },
};

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
  // The uploaded file's raw bytes, kept alongside the parsed result so they
  // can be threaded through to the save mutation once the officer confirms
  // (see DocumentImportPrefill.sourceFileBase64) — parseMut itself only
  // returns the parsed fields, not the original bytes.
  const [sourceFile, setSourceFile] = useState<{
    dataBase64: string;
    mimeType: string;
  } | null>(null);
  const parseMut = trpc.target.registry.parseDocument.useMutation();
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
  // Keyed by image key, kept-by-default (absent === kept) so a fresh parse
  // needs no separate init effect the way associateChoices does.
  const [imageChoices, setImageChoices] = useState<Record<string, boolean>>({});
  // Keyed by image key — value is "target" (default, absent === target) or
  // an associate candidate's own key, for "which associate is this a photo
  // of" instead of the primary target.
  const [imageLinkChoices, setImageLinkChoices] = useState<
    Record<string, string>
  >({});

  const result = parseMut.data;

  // Every associate candidate the parser found, in one list with a stable
  // key — block-derived (full address/vehicle) and bare mentions alike.
  // Computed once per result so the duplicate-check effect and the
  // eventual save both work off the exact same keyed list.
  //
  // A business/place block (see FreeTextAssociate.businessName) is
  // deliberately excluded here — the associates table is person-shaped
  // (firstNames/surname/bornDate, see drizzle/schema.ts) with nowhere to
  // record "this associate IS a business", so a business ended up saved as
  // an Associate with a blank name and its business name tucked into the
  // address instead. That's not just semantically wrong ("a business is
  // obviously not an associate") — it doubled the business up in the
  // Intelligence entity index too: once as that phantom Associate, and
  // again as a Location from the very same address. businessLocations
  // below carries these into Extra Addresses instead, where a business
  // address already belongs (see the document's own "Business Address"
  // line, handled the same way) — so the location is still kept, just not
  // wearing a fake person record to get there.
  const associateCandidates: AssociateCandidate[] = useMemo(() => {
    if (!result) return [];
    const blocks: AssociateCandidate[] = result.associateBlocks
      .filter(a => !a.businessName)
      .map(a => ({
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

  // Business/place blocks pulled out of associateBlocks above — see the
  // comment on associateCandidates for why these don't belong there. Kept
  // as their own memo (rather than computed inline in handleContinue) so
  // it stays next to associateCandidates as the other half of the same
  // split.
  const businessLocations: ExtraAddress[] = useMemo(() => {
    if (!result) return [];
    return result.associateBlocks
      .filter(a => a.businessName)
      .map(a => ({
        id: makeExtraId(),
        label: "",
        businessName: a.businessName,
        unitNo: a.address?.unitNo ?? "",
        houseNo: a.address?.houseNo ?? "",
        streetName: a.address?.streetName ?? "",
        streetType: a.address?.streetType ?? "",
        suburb: a.address?.suburb ?? "",
        state: a.address?.state ?? "WA",
        full: "",
        short: "",
      }));
  }, [result]);

  // Every extracted photo the parser found, with a stable key for the
  // keep/discard toggle and the eventual save — same one-memo-per-result
  // pattern as associateCandidates above.
  const imageCandidates: StagedImage[] = useMemo(() => {
    if (!result) return [];
    return result.images.map(img => ({
      key: makeExtraId(),
      dataBase64: img.dataBase64,
      mimeType: img.mimeType,
      width: img.width,
      height: img.height,
      linkTo: { type: "target" as const },
    }));
  }, [result]);

  const reset = () => {
    setFileName("");
    setError("");
    parseMut.reset();
    setPrimaryMatch(null);
    setAssociateMatches({});
    setAssociateChoices({});
    setImageChoices({});
    setImageLinkChoices({});
    setSourceFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFilePicked = async (file: File) => {
    setError("");
    setFileName(file.name);
    if (!/\.(docx|pdf)$/i.test(file.name)) {
      setError("Only Word (.docx) or PDF (.pdf) documents are supported.");
      return;
    }
    try {
      const dataBase64 = await readFileAsBase64(file);
      const mimeType =
        file.type ||
        (/\.pdf$/i.test(file.name)
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      setSourceFile({ dataBase64, mimeType });
      await parseMut.mutateAsync({ fileName: file.name, dataBase64 });
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
        // Nothing downstream (Target/Operation profile's associate list,
        // the Intelligence folder's entity map) was refetching this on its
        // own — an update here landed in the database fine but stayed
        // invisible on an already-open profile page until a manual reload,
        // which read as "recognised the name but didn't actually update
        // it." Invalidate every cache the new address/vehicle could appear
        // in, even if some of the updates above failed — whichever ones
        // succeeded should still show up immediately.
        await Promise.all([
          utils.associate.listForTarget.invalidate(),
          utils.associate.getById.invalidate(),
          utils.intelligence.targetProfile.invalidate(),
          utils.intelligence.operationProfile.invalidate(),
        ]);

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
          ...businessLocations,
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
        images: imageCandidates
          .filter(img => imageChoices[img.key] ?? true)
          .map(img => {
            const linkKey = imageLinkChoices[img.key];
            const candidate = linkKey
              ? associateCandidates.find(a => a.key === linkKey)
              : undefined;
            const choice = candidate
              ? (associateChoices[candidate.key] ?? "create")
              : null;
            if (candidate && choice === "create") {
              return {
                ...img,
                linkTo: {
                  type: "associate" as const,
                  associateKey: candidate.key,
                },
              };
            }
            if (candidate && choice === "update") {
              const match = associateMatches[candidate.key];
              if (match) {
                return {
                  ...img,
                  linkTo: {
                    type: "existingAssociate" as const,
                    associateId: match.id,
                    entityLabel: match.name,
                  },
                };
              }
            }
            return { ...img, linkTo: { type: "target" as const } };
          }),
        background: result.freeText.trim(),
        sourceFileName: fileName,
        sourceFileBase64: sourceFile?.dataBase64 ?? "",
        sourceFileMimeType: sourceFile?.mimeType ?? "",
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
            Import Target
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {!result && (
            <>
              <p className="text-sm text-muted-foreground">
                Upload a Word (.docx) or PDF (.pdf) Baseball Card or Profile.
              </p>
              <p className="text-sm font-semibold text-destructive">
                DO NOT upload photographs of documents.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.pdf"
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
                {parseMut.isPending
                  ? "Reading document…"
                  : "Choose .docx or .pdf file"}
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
                <div className="rounded-lg border border-l-4 border-amber-500/40 border-l-amber-500 bg-amber-500/5 p-3 flex flex-col gap-1">
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />
                    Matches an existing {primaryMatch.type}
                  </p>
                  <p className="text-sm">
                    This name is close to{" "}
                    <span className="font-medium">{primaryMatch.name}</span>,
                    already in the registry as a {primaryMatch.type}.
                  </p>
                  {primaryMatch.type !== "target" && (
                    <p className="text-[11px] text-muted-foreground">
                      This person is currently filed as someone else's
                      associate, not a target. Consider linking them from the
                      Target Registry instead of continuing, unless this is
                      genuinely a different person.
                    </p>
                  )}
                </div>
              )}

              <div className="rounded-lg border border-l-4 border-sky-500/30 border-l-sky-500 bg-sky-500/5 p-3 flex flex-col gap-1">
                <p className="text-xs font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wide">
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
                <div className="rounded-lg border border-l-4 border-emerald-500/30 border-l-emerald-500 bg-emerald-500/5 p-3 flex flex-col gap-1">
                  <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
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
                <div className="rounded-lg border border-l-4 border-amber-500/30 border-l-amber-500 bg-amber-500/5 p-3 flex flex-col gap-1">
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
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

              {imageCandidates.length > 0 && (
                <div className="rounded-lg border border-l-4 border-indigo-500/30 border-l-indigo-500 bg-indigo-500/5 p-3 flex flex-col gap-2.5">
                  <p className="text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wide">
                    Photos found ({imageCandidates.length})
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Each kept photo is uploaded and run through face recognition
                    once you save. Tap a photo to untick it, or tap a name below
                    it to say who it's actually of — it defaults to this target.
                  </p>
                  {(() => {
                    // Both "create" (a brand-new associate) and "update"
                    // (matches an already-registered one) can take a linked
                    // photo — only "skip" genuinely has no record for a
                    // photo to end up on.
                    const linkableAssociates = associateCandidates.filter(
                      a => (associateChoices[a.key] ?? "create") !== "skip"
                    );
                    return (
                      <div className="flex flex-col gap-2">
                        {imageCandidates.map(img => {
                          const kept = imageChoices[img.key] ?? true;
                          const linkKey = imageLinkChoices[img.key] ?? "target";
                          const linkedAssociate = linkableAssociates.find(
                            a => a.key === linkKey
                          );
                          return (
                            <div
                              key={img.key}
                              className={`flex gap-2.5 rounded-md bg-background/70 border border-border/60 p-2 ${
                                kept ? "" : "opacity-50"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setImageChoices(prev => ({
                                    ...prev,
                                    [img.key]: !kept,
                                  }))
                                }
                                title={
                                  kept
                                    ? "Tap to discard this photo"
                                    : "Tap to keep this photo"
                                }
                                className={`relative shrink-0 rounded-md overflow-hidden border-2 transition-colors ${
                                  kept
                                    ? "border-indigo-500"
                                    : "border-border grayscale"
                                }`}
                              >
                                <img
                                  src={`data:${img.mimeType};base64,${img.dataBase64}`}
                                  alt="Extracted from document"
                                  className="w-16 h-16 object-cover block"
                                />
                                {kept && (
                                  <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-indigo-500 text-white flex items-center justify-center">
                                    <Check className="h-2.5 w-2.5" />
                                  </span>
                                )}
                              </button>
                              {linkableAssociates.length > 0 && (
                                <div className="flex flex-col gap-1 min-w-0">
                                  <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                                    Who is this?
                                  </span>
                                  <div className="flex flex-wrap gap-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setImageLinkChoices(prev => ({
                                          ...prev,
                                          [img.key]: "target",
                                        }))
                                      }
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                                        linkKey === "target"
                                          ? "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400"
                                          : "border-border text-muted-foreground hover:bg-muted/50"
                                      }`}
                                    >
                                      This target
                                    </button>
                                    {linkableAssociates.map(a => (
                                      <button
                                        key={a.key}
                                        type="button"
                                        onClick={() =>
                                          setImageLinkChoices(prev => ({
                                            ...prev,
                                            [img.key]: a.key,
                                          }))
                                        }
                                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors truncate max-w-[160px] ${
                                          linkKey === a.key
                                            ? "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400"
                                            : "border-border text-muted-foreground hover:bg-muted/50"
                                        }`}
                                      >
                                        {a.firstNames} {a.surname}
                                      </button>
                                    ))}
                                  </div>
                                  {linkedAssociate &&
                                    (() => {
                                      const isUpdate =
                                        associateChoices[
                                          linkedAssociate.key
                                        ] === "update";
                                      return (
                                        <span className="text-[10px] text-muted-foreground">
                                          {isUpdate
                                            ? `Linked to existing associate ${linkedAssociate.firstNames} ${linkedAssociate.surname}.`
                                            : `Linked to associate ${linkedAssociate.firstNames} ${linkedAssociate.surname} once they're saved.`}
                                        </span>
                                      );
                                    })()}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

              {result.needsReview.length > 0 && (
                <div className="rounded-lg border border-l-4 border-amber-500/40 border-l-amber-500 bg-amber-500/5 p-3 flex flex-col gap-2">
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
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
                <div className="rounded-lg border border-l-4 border-violet-500/30 border-l-violet-500 bg-violet-500/5 p-3 flex flex-col gap-2.5">
                  <p className="text-xs font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wide">
                    Associates found ({associateCandidates.length})
                  </p>
                  {associateCandidates.map(a => {
                    const match = associateMatches[a.key];
                    const choice = associateChoices[a.key] ?? "create";
                    const colours = ASSOCIATE_CHOICE_CLASSES[choice];
                    return (
                      <div
                        key={a.key}
                        className="rounded-md bg-background/70 border border-border/60 p-2.5 flex flex-col gap-1"
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
                        {match ? (
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge
                              variant="outline"
                              className={`gap-1 font-normal text-[10px] ${colours.badge}`}
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
                              <SelectTrigger
                                className={`h-7 w-auto text-xs gap-1.5 font-semibold border ${colours.select}`}
                              >
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
                        ) : (
                          <Badge
                            variant="outline"
                            className={`gap-1 font-normal text-[10px] mt-1 w-fit ${ASSOCIATE_CHOICE_CLASSES.create.badge}`}
                          >
                            New — no match found
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {result.freeText.trim() && (
                <div className="rounded-lg border border-l-4 border-slate-400/40 border-l-slate-400 bg-slate-500/5 p-3 flex flex-col gap-1">
                  <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                    Narrative / Background
                  </p>
                  <p className="text-sm whitespace-pre-wrap">
                    {reflowNarrativeText(result.freeText.trim())}
                  </p>
                  <p className="text-[11px] text-muted-foreground italic">
                    Saved verbatim as this target's background against whichever
                    operation you pick or create on the next screen.
                  </p>
                </div>
              )}

              {(result.unmappedFields.length > 0 ||
                result.candidateEntities.some(c => c.type !== "person")) && (
                <div className="rounded-lg border border-dashed border-border p-3 flex flex-col gap-3">
                  {result.unmappedFields.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                        Other fields{" "}
                        <span className="font-normal normal-case">
                          — not part of the Target Registry schema, not saved
                        </span>
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
                        Other mentions{" "}
                        <span className="font-normal normal-case">
                          — detected in the free-text narrative, not saved
                        </span>
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

              {/* Same colour meanings used throughout the app: field-type
                  colours match the Add Target form's own boxes, and the
                  associate action colours match the Imported Documents
                  diff cards' added/changed/removed. */}
              <div className="rounded-lg border border-border/60 p-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-sky-500 shrink-0" />
                  Identity
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shrink-0" />
                  Address / new associate
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 shrink-0" />
                  Vehicle / will update
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-violet-500 shrink-0" />
                  Associates section
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 shrink-0" />
                  Photos section
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 shrink-0" />
                  Will skip
                </span>
              </div>
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
