/**
 * "As you type" address suggestions for the running-sheet observation field.
 *
 * Known addresses (everything Intelligence has already seen) are shown first.
 * Only once the typed street matches none of them does the Google Places
 * lookup run, straight away — so an officer never has to tap to "search
 * Google" and never sees the two lists fighting each other. Google here is a
 * map/address service (same as the existing address fields), not an AI call.
 *
 * The caller owns keyboard handling and the textarea; this file owns the data
 * (`useAddressSuggestions`) and the list (`AddressSuggestDropdown`).
 */
import { useEffect, useRef, useState } from "react";
import { MapPin, Globe, WifiOff } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { buildPoiAddress, convertGoogleAddresses } from "@/lib/addressFormat";
import {
  buildSheetAddressText,
  parseKnownAddress,
  type KnownAddressParts,
} from "@shared/knownAddress";

const PERTH_FALLBACK = { lat: -31.9505, lng: 115.8605 };

export type AddressSuggestItem =
  | {
      kind: "known";
      key: string;
      parts: KnownAddressParts;
      rowCount: number;
    }
  | {
      kind: "google";
      key: string;
      main: string;
      secondary: string;
      description: string;
      /** A business/landmark rather than a street address. */
      isPlace: boolean;
    };

/** The text to write into the observation for a picked suggestion — always
 * the full sheet form, "street, SUBURB WA (street)" or, for a business,
 * "Name, street, SUBURB WA (Name)". A Google business needs one geocode to
 * learn its street address, hence async. */
export async function addressSuggestInsertText(
  item: AddressSuggestItem
): Promise<string> {
  if (item.kind === "known") return buildSheetAddressText(item.parts);
  if (!item.isPlace) return convertGoogleAddresses(item.description);
  const fallback = buildPoiAddress(
    item.main,
    item.secondary || item.description
  );
  try {
    await loadGoogleMaps();
    const formatted = await new Promise<string | null>(resolve => {
      new google.maps.Geocoder().geocode({ placeId: item.key }, (r, status) =>
        resolve(status === "OK" && r?.[0] ? r[0].formatted_address : null)
      );
    });
    return formatted ? buildPoiAddress(item.main, formatted) : fallback;
  } catch {
    return fallback;
  }
}

export type AddressSuggestMode = "address" | "place";

export function useAddressSuggestions(
  typed: string,
  mode: AddressSuggestMode = "address"
) {
  const query = typed.trim();
  const enabled = query.length >= (mode === "place" ? 2 : 3);
  const known = trpc.intelligence.searchKnownAddresses.useQuery(
    { query, places: mode === "place" },
    { enabled }
  );
  // `data` is undefined until the current query's own result is in, so this
  // is true only when the known lookup has genuinely answered "none".
  const knownAnswered = enabled && known.data !== undefined;
  const knownItems: AddressSuggestItem[] = (known.data ?? [])
    .map(k => {
      const parts = parseKnownAddress(k.label);
      return parts
        ? ({
            kind: "known",
            key: k.key,
            parts,
            rowCount: k.rowCount,
          } as AddressSuggestItem)
        : null;
    })
    .filter((x): x is AddressSuggestItem => x !== null);
  const needGoogle = knownAnswered && knownItems.length === 0;

  const [googleItems, setGoogleItems] = useState<AddressSuggestItem[]>([]);
  const [googleQuery, setGoogleQuery] = useState("");
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const serviceRef = useRef<google.maps.places.AutocompleteService | null>(
    null
  );
  const tokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(
    null
  );
  const gpsRef = useRef<{ lat: number; lng: number } | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Prime the map loader and a GPS fix once, so the first Google lookup is
  // already biased to where the officer is standing.
  useEffect(() => {
    loadGoogleMaps().catch(() => {});
    navigator.geolocation?.getCurrentPosition(
      pos => {
        gpsRef.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
      },
      () => {},
      { timeout: 5000, maximumAge: 60000 }
    );
  }, []);

  useEffect(() => {
    if (!needGoogle || !online) {
      requestIdRef.current++;
      setGoogleItems([]);
      return;
    }
    const myId = ++requestIdRef.current;
    // Short pause only to absorb fast typing — the known lookup has already
    // answered "nothing", so there is no reason to make the officer wait.
    const t = setTimeout(async () => {
      try {
        await loadGoogleMaps();
      } catch {
        return;
      }
      if (myId !== requestIdRef.current) return;
      if (!serviceRef.current) {
        serviceRef.current = new google.maps.places.AutocompleteService();
      }
      if (!tokenRef.current) {
        tokenRef.current = new google.maps.places.AutocompleteSessionToken();
      }
      serviceRef.current.getPlacePredictions(
        {
          input: query,
          componentRestrictions: { country: "au" },
          // A street address is searched as an address; "@" place searches
          // leave the type open so businesses and landmarks come back too.
          ...(mode === "address" ? { types: ["address"] } : {}),
          sessionToken: tokenRef.current,
          locationBias: new google.maps.Circle({
            center: gpsRef.current ?? PERTH_FALLBACK,
            radius: 50000,
          }),
        },
        (predictions, status) => {
          if (myId !== requestIdRef.current) return;
          if (
            status === google.maps.places.PlacesServiceStatus.OK &&
            predictions
          ) {
            setGoogleQuery(query);
            setGoogleItems(
              predictions.slice(0, 5).map(p => ({
                kind: "google" as const,
                key: p.place_id,
                main: p.structured_formatting?.main_text ?? p.description,
                secondary: p.structured_formatting?.secondary_text ?? "",
                description: p.description,
                isPlace: p.types?.includes("establishment") ?? false,
              }))
            );
          } else {
            setGoogleItems([]);
          }
        }
      );
    }, 120);
    return () => clearTimeout(t);
  }, [needGoogle, online, query, mode]);

  /** Call when a suggestion is picked or the lookup is abandoned — a Places
   * session is one typing-to-pick, so the next address starts a fresh one. */
  function endSession() {
    tokenRef.current = null;
  }

  const items: AddressSuggestItem[] = needGoogle
    ? googleQuery && googleItems.length > 0
      ? googleItems
      : []
    : knownItems;

  return {
    items,
    source: needGoogle ? ("google" as const) : ("known" as const),
    offlineNoKnown: needGoogle && !online,
    endSession,
  };
}

export function AddressSuggestDropdown({
  anchor,
  items,
  source,
  offlineNoKnown,
  mode,
  activeIndex,
  onActiveIndexChange,
  onPick,
}: {
  /** Viewport position just below the caret's line. */
  anchor: { top: number; left: number };
  items: AddressSuggestItem[];
  source: "known" | "google";
  offlineNoKnown: boolean;
  mode: AddressSuggestMode;
  activeIndex: number;
  onActiveIndexChange: (i: number) => void;
  onPick: (item: AddressSuggestItem) => void;
}) {
  if (items.length === 0 && !offlineNoKnown) return null;

  // Keep the list on screen: within the visual viewport horizontally, and —
  // when the on-screen keyboard leaves no room below the caret — flipped to
  // sit just above the line being typed.
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const viewW = vv?.width ?? window.innerWidth;
  const viewH = vv?.height ?? window.innerHeight;
  const viewTop = vv?.offsetTop ?? 0;
  const width = Math.min(340, viewW - 16);
  const left = Math.max(8, Math.min(anchor.left, viewW - width - 8));
  const spaceBelow = viewTop + viewH - anchor.top - 8;
  const wanted = Math.min(260, 52 + items.length * 52);
  const flip = spaceBelow < Math.min(wanted, 160);
  const style: React.CSSProperties = flip
    ? {
        bottom: window.innerHeight - (anchor.top - 24),
        left,
        width,
        maxHeight: Math.max(120, anchor.top - 24 - viewTop - 8),
      }
    : {
        top: anchor.top + 2,
        left,
        width,
        maxHeight: Math.max(120, Math.min(260, spaceBelow)),
      };

  return (
    <div
      className="fixed z-50 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
      style={style}
      role="listbox"
      aria-label="Address suggestions"
    >
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {source === "known" ? (
          <>
            <MapPin className="h-3 w-3" />
            {mode === "place" ? "Known places" : "Known addresses"}
          </>
        ) : (
          <>
            <Globe className="h-3 w-3" />
            From Google
          </>
        )}
      </div>
      {offlineNoKnown && items.length === 0 && (
        <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          Offline — type the address in full
        </div>
      )}
      {items.map((item, i) => {
        const primary =
          item.kind === "known"
            ? item.parts.businessName || item.parts.street
            : item.main;
        const secondary =
          item.kind === "known"
            ? [
                item.parts.businessName ? item.parts.street : null,
                item.parts.suburb || null,
              ]
                .filter(Boolean)
                .join(", ")
            : item.secondary.replace(/,\s*Australia$/i, "");
        return (
          <button
            key={item.key}
            type="button"
            role="option"
            aria-selected={i === activeIndex}
            className={`flex w-full items-center justify-between gap-2 border-b border-border/50 px-3 py-2 text-left text-sm transition-colors last:border-0 ${
              i === activeIndex
                ? "bg-accent text-accent-foreground"
                : "text-popover-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
            onMouseEnter={() => onActiveIndexChange(i)}
            onMouseDown={e => {
              // Fires before the textarea's blur, so the pick beats the
              // blur-save — same pattern as the name/rego dropdowns.
              e.preventDefault();
              onPick(item);
            }}
          >
            <span className="min-w-0">
              <span className="block truncate">{primary}</span>
              {secondary && (
                <span className="block truncate text-xs text-muted-foreground">
                  {secondary}
                </span>
              )}
            </span>
            {item.kind === "known" && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {item.rowCount} obs.
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
