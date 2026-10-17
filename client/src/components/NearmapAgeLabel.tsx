import { trpc } from "@/lib/trpc";
import { describeNearmapAge } from "@shared/nearmapAge";

const DOT = {
  green: "bg-green-600",
  amber: "bg-amber-500",
  red: "bg-red-600",
} as const;
const DOT_ON_DARK = {
  green: "bg-green-400",
  amber: "bg-amber-400",
  red: "bg-red-400",
} as const;

/**
 * When the Nearmap photos at the centre of the map were taken, and how old
 * that makes them: a coloured dot (green under 6 months, amber 6–12, red over
 * 12) with the date and age. `variant="map"` is the white chip on the main map
 * (bottom left); `variant="window"` is the dark strip along the bottom edge of
 * the small Nearmap window in Fly.
 *
 * The date comes from the server (`intelligence.nearmapCaptureDate`, Nearmap's
 * Coverage service). If it is not available — no key, no Coverage access, an
 * error — nothing is shown at all; officers never see a failure.
 */
export function NearmapAgeLabel({
  centre,
  variant,
}: {
  centre: { lat: number; lng: number } | null;
  variant: "map" | "window";
}) {
  const q = trpc.intelligence.nearmapCaptureDate.useQuery(
    centre ?? { lat: 0, lng: 0 },
    {
      enabled: !!centre,
      staleTime: 60 * 60_000,
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const age =
    q.data?.date != null ? describeNearmapAge(q.data.date, new Date()) : null;
  const checking = !!centre && q.isLoading;
  if (!age && !checking) return null;

  if (variant === "window") {
    return (
      <div
        className="absolute inset-x-0 bottom-0 z-[5] flex items-center gap-1.5 bg-black/80 px-2 py-0.5 text-[10.5px] font-semibold text-white pointer-events-none"
        role="status"
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${age ? DOT_ON_DARK[age.band] : "bg-gray-400"}`}
        />
        <span className="truncate">
          {age ? `${age.dateLabel} · ${age.shortAge}` : "Checking photo date…"}
        </span>
      </div>
    );
  }
  return (
    <div
      className="inline-flex max-w-full items-center gap-2 rounded-lg bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-gray-800 shadow-md border border-gray-200"
      role="status"
    >
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${age ? DOT[age.band] : "bg-gray-400"}`}
      />
      {age ? (
        <span className="min-w-0 break-words">
          Nearmap · captured {age.dateLabel}{" "}
          <span className="font-medium text-gray-500">· {age.ageText}</span>
        </span>
      ) : (
        <span className="text-gray-500">
          Nearmap · checking the photo date…
        </span>
      )}
    </div>
  );
}
