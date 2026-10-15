/**
 * The demo clock for the integrations demo: a play button and a slider over
 * the made-up 09:00–09:40 scenario, with a small mark for each event of the
 * sources that are switched on (pings, camera events, tracker reports).
 */
import { Pause, Play } from "lucide-react";
import {
  DEMO_MINUTES,
  DEMO_STEP,
  demoClock,
  demoPingsForSlot,
} from "@shared/integrationDemo";
import type { IntegrationsDemo } from "@/lib/useIntegrationsDemo";
import { DEMO_COLOURS } from "@/components/IntegrationsDemoOverlay";

export function IntegrationsDemoScrubber({ demo }: { demo: IntegrationsDemo }) {
  const marks: Array<{
    at: number;
    colour: string;
    title: string;
    square?: boolean;
  }> = [];
  if (demo.telOn)
    demo.telTargets.forEach((_, slot) =>
      demoPingsForSlot(slot).forEach(p =>
        marks.push({
          at: p.at,
          colour: p.type === "CAD" ? DEMO_COLOURS.tel : DEMO_COLOURS.arc,
          title: `Ping ${demoClock(p.at)}`,
          square: true,
        })
      )
    );
  if (demo.camOn)
    demo.visibleCameras.forEach(c =>
      c.events.forEach(e =>
        marks.push({
          at: e.t,
          colour: DEMO_COLOURS.cam,
          title: `${c.name} ${demoClock(e.t)}`,
        })
      )
    );
  if (demo.trkOn && demo.trkIds.length > 0)
    [0, 10, 20, 30, 40].forEach(t =>
      marks.push({
        at: t,
        colour: DEMO_COLOURS.trk,
        title: `Tracker ${demoClock(t)}`,
      })
    );

  return (
    <div className="absolute bottom-12 left-1/2 z-30 w-[min(520px,calc(100%-24px))] -translate-x-1/2 rounded-xl border border-border bg-card px-3 py-2 shadow-lg">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={demo.togglePlay}
          aria-label={demo.playing ? "Pause" : "Play"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          {demo.playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={DEMO_MINUTES}
            step={DEMO_STEP}
            value={demo.time}
            onChange={e => demo.setTime(Number(e.target.value))}
            aria-label="Demo time"
            className="w-full accent-primary"
          />
          <div className="relative h-3">
            {marks.map((m, i) => (
              <i
                key={i}
                title={m.title}
                className={`absolute top-0 h-2 w-2 -translate-x-1/2 border border-card ${m.square ? "rounded-[2px]" : "rounded-full"}`}
                style={{
                  left: `${(m.at / DEMO_MINUTES) * 100}%`,
                  background: m.colour,
                }}
              />
            ))}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold tabular-nums leading-tight">
            {demoClock(demo.time)}
          </p>
          <p className="text-[10px] font-bold uppercase leading-tight tracking-wide text-amber-700">
            Sample
          </p>
        </div>
      </div>
    </div>
  );
}
