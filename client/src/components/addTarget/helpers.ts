// Part of the Add Target dialog (client/src/components/AddTargetDialog.tsx): its small helper functions.
// The dialog used to be one 2,600-line function; its state, effects and handlers are now step
// hooks (called in order by useAddTargetScreen) and its layout is AddTargetView. Same code as
// before (only a few plain definitions moved earlier, never an effect); see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import {
  composeTargetName,
  composeAddress,
  composeVehicle,
  composeVehicleTargetName,
  composeLocationTargetName,
  type StructuredNameParts,
  type StructuredAddressParts,
  type StructuredVehicleParts,
} from "@/lib/addressFormat";
import type { TargetType } from "@shared/types";
import type {} from "@/components/ImportTargetDocumentDialog";

// composeAddress/composeVehicle are all-or-nothing — a document import (or
// an officer editing by hand) can easily leave one field short of what's
// needed, and the composed result then silently comes back as "" with no
// indication anywhere that the record won't actually save. Found via a real
// document-import case: a vehicle with every field filled in except colour
// (the exact field Step 3's AI-assist flags as needing review) looked
// perfectly normal on this screen, saved without error, and then simply
// never appeared anywhere — not on the target's profile, not in a search,
// not in the Intelligence folder — because its "full"/"short" form, the
// only shape anything else in the app reads, was silently empty. These two
// checks catch that case specifically — SOME field entered, but not enough
// to compose — so it can be flagged before Save rather than discovered
// after the fact.
export function isPartialAddress(a: StructuredAddressParts): boolean {
  const hasAny = !!(
    a.businessName ||
    a.unitNo ||
    a.houseNo ||
    a.streetName ||
    a.streetType ||
    a.suburb
  );
  return hasAny && !composeAddress(a).full;
}
export function isPartialVehicle(
  v: StructuredVehicleParts & { vehicleType?: string }
): boolean {
  const hasAny = !!(
    v.registration ||
    v.colour ||
    v.make ||
    v.model ||
    v.vehicleType
  );
  return hasAny && !composeVehicle(v).full;
}

/** The composed name/tgt for whichever fields are this Target's PRIMARY
 * identity, chosen by targetType — composeTargetName(identity) for a
 * Person (unchanged), composeVehicleTargetName(vehicle) for a Vehicle,
 * composeLocationTargetName(address) for a Location. Both name and tgt
 * come back as empty strings until that type's own required fields are
 * filled in, same as composeTargetName already does for Person. */
export function computePrimaryIdentity(
  targetType: TargetType,
  identity: StructuredNameParts,
  address: StructuredAddressParts,
  vehicle: StructuredVehicleParts & { vehicleType: string }
): { name: string; tgt: string } {
  if (targetType === "vehicle") return composeVehicleTargetName(vehicle);
  if (targetType === "location") return composeLocationTargetName(address);
  return composeTargetName(identity);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// Reads an officer-picked file into the same shape as a document-import
// StagedImage (see ImportTargetDocumentDialog.tsx) so a manually uploaded
// target/associate photo can flow through the exact same saveStagedImages
// pipeline — upload, on-device face detection, then auto-link — once the
// target actually has a real id.
export function readImageFile(file: File): Promise<{
  dataBase64: string;
  mimeType: string;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const dataBase64 = dataUrl.split(",")[1] ?? "";
      const img = new Image();
      img.onload = () =>
        resolve({
          dataBase64,
          mimeType: file.type || "image/jpeg",
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      img.onerror = () => reject(new Error("Could not read that image."));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}
