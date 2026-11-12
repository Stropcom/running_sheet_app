import { signIconOf } from "@shared/placeSigns";
import { getMarkerDataUrl } from "@/lib/markerSvgs";
import { formatIntelAddress, formatIntelVehicle } from "@/lib/addressFormat";
import { addressMatchKey } from "@shared/addressMatchKey";
import { shortPersonDisplayName } from "@shared/addressFormat";
import { type IntelMapLocation } from "./mapTypes";

// ── Marker pop-up entity blocks ─────────────────────────────────────────────
// A long operation accumulates a lot of entities against a single address.
// Left unbounded they push the pop-up's action buttons (RS Quick Entry,
// Waze, Edit/Move) off the bottom of the map, so each block is capped and
// scrolls on its own — the target details and the associated entities can be
// scrolled independently of each other. `overscroll-behavior:contain` stops a
// flick that reaches the end of a list from carrying on into a map pan.
/** Vehicle mentions arrive either as a raw target-card V1F ("White Toyota
 * Corolla, bearing WA registration 5IND123 (Vehicle 5IND123)") or already as
 * an entity short form — both go through the same formatter the Intelligence
 * folder uses, so a vehicle reads identically in both places. */
export function popupVehicleLines(
  vehicles: string[],
  fontSize: string
): string {
  // "rego colour make model type" — formatIntelVehicle drops the "bearing WA
  // registration" wording — and one line per vehicle even when the same one
  // is listed twice.
  return Array.from(new Set(vehicles.map(v => formatIntelVehicle(v))))
    .map(
      v =>
        `<div style="font-size:${fontSize};color:#111;padding:1px 0;">${v}</div>`
    )
    .join("");
}

/** A person's name as shown in map popups: "Min Jae KIM" — no ", born …"
 * date and no trailing "(KIM)" surname bracket, to keep the popup compact. */
export const shortPopupName = shortPersonDisplayName;

/** One registered person (target, associate or other home address resident)
 * with every vehicle on their registry record. */
export interface MapPerson {
  name: string;
  role: "target" | "resident" | "associate";
  addressKey: string;
  vehicles: string[];
}

export interface MapPeopleLookup {
  byName: Map<string, MapPerson>;
  byAddress: Map<string, MapPerson[]>;
}

export function buildMapPeopleLookup(people: MapPerson[]): MapPeopleLookup {
  const byName = new Map<string, MapPerson>();
  const byAddress = new Map<string, MapPerson[]>();
  for (const p of people) {
    const key = p.name.toLowerCase();
    const prev = byName.get(key);
    // The same person can be on more than one target — pool their vehicles.
    byName.set(
      key,
      prev
        ? {
            ...prev,
            vehicles: Array.from(new Set([...prev.vehicles, ...p.vehicles])),
          }
        : p
    );
    if (p.addressKey)
      byAddress.set(p.addressKey, [...(byAddress.get(p.addressKey) ?? []), p]);
  }
  return { byName, byAddress };
}

/** The Persons list for an address, each name followed by ALL the vehicles on
 * their registry record, plus any registered associate / resident whose
 * address this is but who isn't already listed. Without registry data it is
 * the plain name list. */
export function popupPeopleLines(
  persons: string[],
  addressLabel: string,
  registry: MapPeopleLookup | undefined,
  fontSize: string
): string {
  if (!registry) return popupPersonLines(persons, fontSize);
  const seen = new Set<string>();
  const names: string[] = [];
  const add = (n: string) => {
    const key = n.toLowerCase();
    if (!n || seen.has(key)) return;
    seen.add(key);
    names.push(n);
  };
  persons.map(shortPopupName).forEach(add);
  for (const p of registry.byAddress.get(addressMatchKey(addressLabel)) ?? [])
    if (p.role !== "target") add(p.name);
  return names
    .map(n => {
      const vehicles = registry.byName.get(n.toLowerCase())?.vehicles ?? [];
      return `<div style="padding:1px 0;"><div style="font-size:${fontSize};color:#111;">${n}</div>${
        vehicles.length
          ? `<div style="padding-left:10px;">${popupVehicleLines(vehicles, "11px")}</div>`
          : ""
      }</div>`;
    })
    .join("");
}

/** Person mentions display one per line, same layout as popupVehicleLines —
 * a comma-joined paragraph reads as a single run-on line in the popup's
 * narrow width instead of a scannable list. */
export function popupPersonLines(persons: string[], fontSize: string): string {
  const seen = new Set<string>();
  return persons
    .map(shortPopupName)
    .filter(p => {
      const key = p.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(
      p =>
        `<div style="font-size:${fontSize};color:#111;padding:1px 0;">${p}</div>`
    )
    .join("");
}

// Mirrors server/db.ts's normalizeEntityLabel exactly — the map needs the
// same key the server computed for attachment_entity_links.entityKey to
// check whether a given address/label has any linked photos.
export function normalizeEntityLabelClient(label: string): string {
  return label.toLowerCase().replace(/\s+/g, " ").trim();
}

// Opens (or re-opens) the shared singleton InfoWindow after its new content
// has had a chance to actually lay out — both call sites were already
// deferring by one requestAnimationFrame to guard against exactly this
// ("off-centre on the first click, correct on the second" — see their own
// comments), but a real officer reported it still happening intermittently
// on an iPad, badly enough to make tapping the right popup button
// difficult (the content box and its own arrow ending up nowhere near each
// other). Strengthened two ways rather than guessing which one was the
// actual gap: explicitly closes first, so tapping a different marker while
// one popup is already open starts from a clean, fully torn-down state
// instead of Google measuring an in-place content swap mid-transition; and
// defers by TWO animation frames instead of one — a single rAF runs right
// before the next paint, which is normally enough time for content changed
// earlier in the same tick to have been laid out, but evidently wasn't
// always reliable on this device/browser. A second frame gives strictly
// more margin at a cost of one imperceptible extra frame (~16ms).
export function openInfoWindowDeferred(
  infoWindowRef: React.MutableRefObject<google.maps.InfoWindow | null>,
  map: google.maps.Map
) {
  infoWindowRef.current?.close();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      infoWindowRef.current?.open(map);
    });
  });
}

/** The popup body for one address: the people REGISTERED there (target,
 * other home address residents, associates — each with every registry
 * vehicle), then an OBSERVATIONS block of what running sheets recorded at
 * the location. The registered part is the same before and after an
 * observation; an address with nobody registered shows OBSERVED LOCATION and
 * the address instead. */
export function entityBlocksHtml(
  loc: IntelMapLocation,
  registry: MapPeopleLookup | undefined,
  compact = false
): string {
  const nameSize = compact ? "12px" : "13px";
  const addrSize = compact ? "11px" : "12px";
  const vehSize = compact ? "10px" : "11px";
  const badge = (label: string, bg: string) =>
    `<span style="display:inline-block;background:${bg};color:#fff;border-radius:4px;font-size:9px;font-weight:700;padding:2px 6px;letter-spacing:0.07em;white-space:nowrap;">${label}</span>`;
  const subHeading = (t: string) =>
    `<div style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;margin-top:5px;">${t}</div>`;
  const address = formatIntelAddress(loc.label);

  interface Block {
    label: string;
    bg: string;
    name: string;
    vehicles: string[];
    showAddress: boolean;
  }
  const blocks: Block[] = [];
  const have = new Set<string>();
  const vehiclesFor = (name: string, fallback: string[]) =>
    registry?.byName.get(name.toLowerCase())?.vehicles ?? fallback;
  const addBlock = (
    label: string,
    bg: string,
    rawName: string,
    fallbackVehicles: string[],
    showAddress: boolean
  ) => {
    const name = shortPopupName(rawName);
    const key = `${label}|${name.toLowerCase()}`;
    if (!name || have.has(key)) return;
    have.add(key);
    blocks.push({
      label,
      bg,
      name,
      vehicles: vehiclesFor(name, fallbackVehicles),
      showAddress,
    });
  };

  const registered = registry?.byAddress.get(addressMatchKey(loc.label)) ?? [];
  const roleOrder = { target: 0, resident: 1, associate: 2 } as const;
  if (registered.length > 0) {
    for (const p of [...registered].sort(
      (a, b) => roleOrder[a.role] - roleOrder[b.role]
    )) {
      if (p.role === "target")
        addBlock("TARGET ADDRESS", "#e11d48", p.name, p.vehicles, true);
      else if (p.role === "resident")
        addBlock("OTHER RESIDENT", "#0284c7", p.name, p.vehicles, false);
      else addBlock("ASSOCIATE ADDRESS", "#7c3aed", p.name, p.vehicles, true);
    }
  } else if (loc.type === "target_address") {
    for (const t of loc.linkedTargets)
      if (!t.addressLabel)
        addBlock(
          "TARGET ADDRESS",
          "#dc2626",
          t.name,
          [t.v1f, t.v2f].filter((v): v is string => !!v),
          true
        );
  } else if (loc.type === "associate_address") {
    for (const n of loc.assocPersons)
      addBlock("ASSOCIATE ADDRESS", "#7c3aed", n, [], true);
  }
  // A target's additional (non-home) registered address.
  for (const t of loc.linkedTargets)
    if (t.addressLabel)
      addBlock(
        "ADDITIONAL ADDRESS",
        "#7c3aed",
        t.name,
        [t.v1f, t.v2f].filter((v): v is string => !!v),
        true
      );

  const html: string[] = [];
  blocks.forEach((b, i) => {
    html.push(
      `<div style="${i > 0 ? "margin-top:9px;" : ""}">${badge(b.label, b.bg)}<div style="font-size:${nameSize};font-weight:700;color:#111;line-height:1.35;margin-top:3px;">${b.name}</div>${
        b.showAddress || i === 0
          ? `<div style="font-size:${addrSize};color:#111;line-height:1.35;">${address}</div>`
          : ""
      }${b.vehicles.length ? popupVehicleLines(b.vehicles, vehSize) : ""}</div>`
    );
  });
  if (blocks.length === 0)
    html.push(
      `${badge("OBSERVED LOCATION", "#7c3aed")}<strong style="font-size:${nameSize};color:#111;line-height:1.35;display:block;margin-top:3px;">${address}</strong>`
    );

  // What running sheets recorded here (older servers: an observation pin's
  // own lists ARE its observations).
  const legacy = loc.type === "observation";
  const dedupe = (names: string[]) => {
    const seen = new Set<string>();
    return names
      .map(shortPopupName)
      .filter(
        n => n && !seen.has(n.toLowerCase()) && !!seen.add(n.toLowerCase())
      );
  };
  const obsTargets = dedupe(
    loc.observedTargets ?? (legacy ? loc.linkedTargets.map(t => t.name) : [])
  );
  const obsPersons = dedupe(
    loc.observedPersons ?? (legacy ? loc.assocPersons : [])
  );
  const obsVehicles = loc.observedVehicles ?? (legacy ? loc.assocVehicles : []);
  const obs: string[] = [];
  const list = (names: string[]) =>
    names
      .map(
        n =>
          `<div style="font-size:${addrSize};color:#111;padding:1px 0;">${n}</div>`
      )
      .join("");
  if (obsTargets.length) obs.push(subHeading("Targets") + list(obsTargets));
  if (obsPersons.length) obs.push(subHeading("Associates") + list(obsPersons));
  if (obsVehicles.length)
    obs.push(subHeading("Vehicles") + popupVehicleLines(obsVehicles, addrSize));
  if (obs.length)
    html.push(
      `<div style="border-top:1px solid #e5e7eb;margin-top:10px;padding-top:8px;">${badge("OBSERVATIONS", "#0f766e")}${obs.join("")}</div>`
    );

  return `<div style="${compact ? "max-height:170px;" : "max-height:240px;"}overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;">${html.join("")}</div>`;
}

/** Photo indicator across the bottom edge of a marker: one slim rounded
 * rectangle (11px tall, small corners — the same family as the place signs),
 * blue half (portrait icon) for profile / baseball-card photos of the people
 * at the address, green half (photo icon) for running-sheet photos, both
 * halves the same width. Only one kind present shows a single solid-colour
 * half. Returns null when neither. */
export function createPhotoPill(
  runningSheet: boolean,
  profile: boolean
): HTMLDivElement | null {
  if (!runningSheet && !profile) return null;
  const photoIcon =
    '<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6" fill="#fff"/><path d="M4 18l5-5 4 4 3-3 4 4"/></svg>';
  const portraitIcon =
    '<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="10" r="3.2" fill="#fff"/><path d="M6 19c1-3.4 3.2-5 6-5s5 1.6 6 5"/></svg>';
  const half = (bg: string, icon: string) =>
    `<span style="display:inline-flex;align-items:center;justify-content:center;width:16px;background:${bg};">${icon}</span>`;
  const pill = document.createElement("div");
  pill.title =
    runningSheet && profile
      ? "Running-sheet photos and profile photos"
      : runningSheet
        ? "Running-sheet photos"
        : "Profile photos of people at this address";
  pill.style.cssText = `
    position:absolute;left:50%;top:100%;transform:translate(-50%,-9px);
    display:inline-flex;align-items:stretch;height:11px;
    border-radius:2.5px;overflow:hidden;
    border:1.5px solid #fff;box-sizing:content-box;
    box-shadow:0 1px 3px rgba(0,0,0,0.35);
    pointer-events:none;
  `;
  pill.innerHTML =
    (profile ? half("#2563eb", portraitIcon) : "") +
    (runningSheet ? half("#10b981", photoIcon) : "");
  return pill;
}

export function buildInfoWindowContent(
  loc: IntelMapLocation,
  override?: {
    markerIcon?: string | null;
    markerColour?: string | null;
    rotation?: number | null;
    customLabel?: string | null;
    note?: string | null;
  },
  hasPhotos = false,
  registry?: MapPeopleLookup
): string {
  const isTarget = loc.type === "target_address";
  const encodedLabel = encodeURIComponent(loc.label);

  // Persisted appearance for this intel pin (server-saved override — see
  // intelPinOverrides — takes priority over the type-based default).
  const intelIcon: string =
    override?.markerIcon ?? signIconOf(loc.label) ?? "house_filled";
  const intelColour: string =
    override?.markerColour ?? (isTarget ? "red" : "purple");
  const intelRotation: number = override?.rotation ?? 0;

  const lines: string[] = [];

  // Registered people (with all their vehicles) then OBSERVATIONS — see
  // entityBlocksHtml.
  lines.push(entityBlocksHtml(loc, registry));

  // Officer-added caption + note (see intelPinOverrides.customLabel/note —
  // same two fields a custom map marker has, added here for parity with
  // that dialog), shown as a secondary line under the entity blocks.
  if (override?.customLabel)
    lines.push(
      `<div style="font-size:12px;color:#7c3aed;font-weight:600;margin-top:6px;">${override.customLabel}</div>`
    );
  if (override?.note)
    lines.push(
      `<div style="margin-top:4px;"><span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;">Notes</span><p style="font-size:12px;color:#111;margin:2px 0 0;">${override.note}</p></div>`
    );

  // ── Action buttons (observed location only — same layout as custom marker popup) ──
  if (!isTarget) {
    const btnBase =
      "font-size:12px;font-weight:600;padding:7px 0;border-radius:6px;cursor:pointer;text-align:center;text-decoration:none;display:block;width:100%;box-sizing:border-box;";
    const sections: string[] = [];

    // Rotation slider (at top, above buttons)
    const safeLabel = loc.label.replace(/'/g, "\\'");
    sections.push(`
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid #e5e7eb;">
        <div style="display:flex;align-items:center;gap:8px;">
          <img id="intel-popup-preview-${encodedLabel}" src="${getMarkerDataUrl(intelIcon as any, intelColour as any)}" style="width:24px;height:24px;object-fit:contain;flex-shrink:0;transform:rotate(${intelRotation}deg);transition:transform 0.1s;" />
          <div style="flex:1;">
            <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
              <span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;">Rotation</span>
              <span id="intel-popup-deg-${encodedLabel}" style="font-size:10px;color:#374151;font-weight:600;">${intelRotation}°</span>
            </div>
            <input id="intel-popup-slider-${encodedLabel}" type="range" min="0" max="359" step="1" value="${intelRotation}"
              style="width:100%;accent-color:#6366f1;cursor:pointer;"
              oninput="window.__intelPopupRotate('${safeLabel}', this.value)"
            />
          </div>
        </div>
      </div>
    `);

    // Row 0: RS Quick Entry — full width, indigo
    sections.push(
      `<div style="margin-top:5px;"><button onclick="window.__intelRsQuickEntry('${safeLabel}')" style="${btnBase}background:#6366f1;color:#fff;border:none;font-size:13px;padding:9px 0;">RS Quick Entry</button></div>`
    );

    // Row 1: Images — only when this address already has linked photos
    // (silently auto-linked at upload time, never a separate tagging step).
    if (hasPhotos) {
      sections.push(
        `<div style="margin-top:5px;"><button onclick="window.__mapOpenImagesPip('${safeLabel}')" style="${btnBase}background:#10b981;color:#fff;border:none;font-size:13px;padding:9px 0;">Images</button></div>`
      );
    }

    // Row 2: Waze | Street View
    if (loc.lat != null && loc.lng != null) {
      const lat = loc.lat;
      const lng = loc.lng;
      const navBtns = [
        `<a href="https://waze.com/ul?ll=${lat},${lng}&navigate=yes" target="_blank" style="${btnBase}background:#00bcd4;color:#fff;">Waze</a>`,
        `<button onclick="window.__mapOpenStreetView(${lat},${lng},'${safeLabel}')" style="${btnBase}background:#4285f4;color:#fff;border:none;">Street View</button>`,
      ];
      sections.push(
        `<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;">${navBtns.join("")}</div>`
      );
    }

    // Row 3: Edit | Move
    const editBtn = `<button onclick="window.__intelOpenEditDialog('${safeLabel}')" style="${btnBase}background:#16a34a;color:#fff;border:none;">Edit</button>`;
    const moveBtn = `<button onclick="window.__intelStartMove('${safeLabel}')" style="${btnBase}background:#0369a1;color:#fff;border:none;">Move…</button>`;
    sections.push(
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;">${editBtn}${moveBtn}</div>`
    );

    lines.push(sections.join(""));
  } else {
    // Target address: one shared button set for the whole pin, built here
    // but pushed to `lines` AFTER every secondary (associate/observation)
    // address absorbed into it below — not once per address. A target
    // pin's secondaryLocs are only ever merged in because they're within
    // INTEL_DEDUP_RADIUS_M (20m) of this same pin (see the merge site
    // elsewhere in this file), so one Rotation/RS Quick Entry/Waze/Street
    // View block is a perfectly good proxy for all of them — repeating
    // the whole block per address just pushed the popup's real content
    // (who's actually linked to this address) off the bottom of the map
    // for no benefit, since every copy did the same thing. Edit/Move stay
    // scoped to this primary address specifically, not any secondary's
    // own record — there's no single sane target for "Edit"/"Move" once
    // more than one real address/pin is involved, so this popup only ever
    // offers those two for the pin the user actually clicked on.
    const btnBase =
      "font-size:12px;font-weight:600;padding:7px 0;border-radius:6px;cursor:pointer;text-align:center;text-decoration:none;display:block;width:100%;box-sizing:border-box;";
    const safeLabel = loc.label.replace(/'/g, "\\'");
    const sections: string[] = [];

    // Rotation slider
    sections.push(`
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid #e5e7eb;">
        <div style="display:flex;align-items:center;gap:8px;">
          <img id="intel-popup-preview-${encodedLabel}" src="${getMarkerDataUrl(intelIcon as any, intelColour as any)}" style="width:24px;height:24px;object-fit:contain;flex-shrink:0;transform:rotate(${intelRotation}deg);transition:transform 0.1s;" />
          <div style="flex:1;">
            <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
              <span style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.06em;">Rotation</span>
              <span id="intel-popup-deg-${encodedLabel}" style="font-size:10px;color:#374151;font-weight:600;">${intelRotation}\u00b0</span>
            </div>
            <input id="intel-popup-slider-${encodedLabel}" type="range" min="0" max="359" step="1" value="${intelRotation}"
              style="width:100%;accent-color:#6366f1;cursor:pointer;"
              oninput="window.__intelPopupRotate('${safeLabel}', this.value)"
            />
          </div>
        </div>
      </div>
    `);

    // Row 0: RS Quick Entry — full width, indigo
    sections.push(
      `<div style="margin-top:5px;"><button onclick="window.__intelRsQuickEntry('${safeLabel}')" style="${btnBase}background:#6366f1;color:#fff;border:none;font-size:13px;padding:9px 0;">RS Quick Entry</button></div>`
    );

    // Row 1: Images — only when this address already has linked photos
    // (silently auto-linked at upload time, never a separate tagging step).
    if (hasPhotos) {
      sections.push(
        `<div style="margin-top:5px;"><button onclick="window.__mapOpenImagesPip('${safeLabel}')" style="${btnBase}background:#10b981;color:#fff;border:none;font-size:13px;padding:9px 0;">Images</button></div>`
      );
    }

    // Row 2: Waze | Street View
    if (loc.lat != null && loc.lng != null) {
      const lat = loc.lat;
      const lng = loc.lng;
      const navBtns = [
        `<a href="https://waze.com/ul?ll=${lat},${lng}&navigate=yes" target="_blank" style="${btnBase}background:#00bcd4;color:#fff;">Waze</a>`,
        `<button onclick="window.__mapOpenStreetView(${lat},${lng},'${safeLabel}')" style="${btnBase}background:#4285f4;color:#fff;border:none;">Street View</button>`,
      ];
      sections.push(
        `<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;">${navBtns.join("")}</div>`
      );
    }

    // Row 3: Edit (appearance) | Move
    const editBtn = `<button onclick="window.__intelOpenEditDialog('${safeLabel}')" style="${btnBase}background:#16a34a;color:#fff;border:none;">Edit</button>`;
    const moveBtn = `<button onclick="window.__intelStartMove('${safeLabel}')" style="${btnBase}background:#0369a1;color:#fff;border:none;">Move…</button>`;
    sections.push(
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px;">${editBtn}${moveBtn}</div>`
    );

    // ── Secondary (associate/observation) locs absorbed into this pin ──
    // Info only (badge, address, linked targets) — no per-address button
    // block, see the comment above `sections`. The Persons/Vehicles
    // breakdown lives once, above this, already merged across every
    // secondary loc at merge time (see INTEL_DEDUP_RADIUS_M's merge site),
    // so repeating it per address here would just be the same names again.
    if (loc.secondaryLocs && loc.secondaryLocs.length > 0) {
      for (const sec of loc.secondaryLocs) {
        lines.push(
          `<div style="margin-top:10px;padding-top:8px;border-top:1px solid #e5e7eb;">${entityBlocksHtml(sec, registry, true)}</div>`
        );
      }
    }

    // The shared Rotation/RS Quick Entry/Waze/Street View/Edit/Move block
    // renders last, after every secondary address above — see the comment
    // on `sections` above for why this is one block for the whole pin.
    lines.push(sections.join(""));
  }

  return `<div style="font-family:sans-serif;max-width:280px;color:#111">${lines.join("")}</div>`;
}
