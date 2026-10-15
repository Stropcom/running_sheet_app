/**
 * The "Integrations (sample)" section of the Map page's right-hand pane: how
 * Milestone cameras, trackers and JSI 4Sight phone pings could be picked and
 * shown. Every source is chosen the same way — the operation first, then what
 * is available — and several of each can be ticked at once.
 *
 * It is a MOCK-UP: the pings, trackers and cameras are made up
 * (shared/integrationDemo.ts) and drawn against the REAL operations and
 * targets in the list, so the choices behave like the real thing. Nothing is
 * saved and nothing is added to a running sheet — "Add to draft" only fills
 * the list at the bottom of this card, which is thrown away with the page.
 */
import { Crosshair, FlaskConical } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEMO_CAMERAS,
  DEMO_TRACKERS,
  cameraRowText,
  demoClock,
  demoSurname,
  routeSpeedKmh,
  trackerRowText,
  demoTracker,
  demoPingsForSlot,
  demoCamera,
  type CameraType,
} from "@shared/integrationDemo";
import type { IntegrationsDemo } from "@/lib/useIntegrationsDemo";
import { DEMO_COLOURS } from "@/components/IntegrationsDemoOverlay";

interface OpOption {
  id: number;
  name: string;
}

function Switch({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        on ? "bg-primary" : "bg-muted-foreground/40"
      }`}
    >
      <span
        className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function SourceHeader({
  colour,
  square,
  title,
  sub,
  on,
  onToggle,
}: {
  colour: string;
  square?: boolean;
  title: string;
  sub: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`h-3 w-3 shrink-0 ${square ? "rounded-[3px]" : "rounded-full"}`}
        style={{ background: colour }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold leading-tight text-foreground">
          {title}
        </p>
        <p className="text-[11px] leading-tight text-muted-foreground">{sub}</p>
      </div>
      <Switch on={on} onClick={onToggle} label={title} />
    </div>
  );
}

const LABEL =
  "text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block";

function OperationSelect({
  value,
  onChange,
  operations,
  defaultOpId,
}: {
  value: number | null;
  onChange: (id: number) => void;
  operations: OpOption[];
  defaultOpId: number | null;
}) {
  const shown = value ?? defaultOpId;
  return (
    <div className="space-y-1">
      <span className={LABEL}>Operation</span>
      <Select
        value={shown != null ? String(shown) : undefined}
        onValueChange={v => onChange(Number(v))}
      >
        <SelectTrigger className="w-full h-9 text-xs rounded-xl border-2">
          <SelectValue placeholder="Choose an operation…" />
        </SelectTrigger>
        <SelectContent>
          {operations.map(o => (
            <SelectItem key={o.id} value={String(o.id)}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Tick({
  checked,
  onChange,
  title,
  sub,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  sub?: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2.5 rounded-xl border-2 px-2.5 py-2 transition-colors ${
        checked ? "border-primary/50 bg-primary/10" : "border-border bg-card"
      }`}
    >
      <Checkbox checked={checked} onCheckedChange={onChange} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold leading-tight text-foreground break-words">
          {title}
        </span>
        {sub && (
          <span className="block text-[11px] leading-tight text-muted-foreground break-words">
            {sub}
          </span>
        )}
      </span>
    </label>
  );
}

const NOTE = "text-[11px] leading-snug text-muted-foreground";

export function IntegrationsDemoPane({
  demo,
  operations,
  defaultOpId,
  onGoToArea,
}: {
  demo: IntegrationsDemo;
  operations: OpOption[];
  defaultOpId: number | null;
  onGoToArea: () => void;
}) {
  const telOp = demo.telOpId ?? defaultOpId;
  const { data: targets } = trpc.target.list.useQuery(
    { operationId: telOp! },
    { enabled: demo.telOn && telOp != null }
  );
  const targetList = (targets ?? []) as Array<{ id: number; name: string }>;
  const camsHere = DEMO_CAMERAS;
  const typeCams = DEMO_CAMERAS.filter(c => c.type === demo.camType);

  // ── The card for whatever was last clicked on the map ──
  let selected: React.ReactNode = null;
  if (demo.sel?.kind === "ping") {
    const found = demo.shownPings.find(s => s.ping.id === demo.sel!.id);
    if (found) {
      const { ping, surname } = found;
      selected = (
        <>
          <p className="text-xs font-bold text-foreground">
            Phone ping, {surname}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
            <dt className="text-muted-foreground">Time</dt>
            <dd className="font-semibold">{demoClock(ping.at)}</dd>
            <dt className="text-muted-foreground">Activity</dt>
            <dd className="font-semibold">
              {ping.kind}
              {ping.duration ? `, ${ping.duration}` : ""}
            </dd>
            <dt className="text-muted-foreground">Area</dt>
            <dd className="font-semibold">
              {ping.type === "CAD"
                ? `up to ${(ping.outerM / 1000).toFixed(1)} km from the cell site`
                : `${(ping.innerM / 1000).toFixed(1)} to ${(ping.outerM / 1000).toFixed(1)} km from the cell site`}
            </dd>
          </dl>
          <p className={NOTE}>
            Shown as an area, not a point, because that is what telephone data
            gives.
          </p>
        </>
      );
    }
  } else if (demo.sel?.kind === "trk") {
    const tk = demoTracker(demo.sel.id);
    if (tk) {
      selected = (
        <>
          <p className="text-xs font-bold text-foreground">
            {tk.kind === "vehicle" ? "Vehicle tracker" : "Item tracker"} {tk.id}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
            <dt className="text-muted-foreground">
              {tk.kind === "vehicle" ? "Vehicle" : "Item"}
            </dt>
            <dd className="font-semibold">
              {tk.kind === "vehicle" ? `${tk.label}, ${tk.name}` : tk.name}
            </dd>
            <dt className="text-muted-foreground">Time</dt>
            <dd className="font-semibold">{demoClock(demo.time)}</dd>
            <dt className="text-muted-foreground">Speed</dt>
            <dd className="font-semibold">
              {routeSpeedKmh(tk.route, demo.time)} km/h
            </dd>
          </dl>
          <button
            type="button"
            onClick={() =>
              demo.addDraft(demoClock(demo.time), trackerRowText(tk, demo.time))
            }
            className="w-full rounded-xl border-2 border-primary/50 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-primary/20"
          >
            Add to draft (sample)
          </button>
        </>
      );
    }
  } else if (demo.sel?.kind === "cam") {
    const cam = demoCamera(demo.sel.id);
    if (cam) {
      const past = cam.events.filter(e => demo.time >= e.t);
      selected = (
        <>
          <p className="text-xs font-bold text-foreground">{cam.name}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
            <dt className="text-muted-foreground">Type</dt>
            <dd className="font-semibold">
              {cam.type}, {cam.kind}
            </dd>
            <dt className="text-muted-foreground">Address</dt>
            <dd className="font-semibold">{cam.address}</dd>
          </dl>
          <ul className="divide-y divide-border">
            {cam.events.map(e => {
              const done = demo.time >= e.t;
              const text = cameraRowText(cam, e);
              const added = demo.drafts.some(d => d.text === text);
              return (
                <li
                  key={e.t}
                  className={`flex items-start gap-2 py-1.5 text-[11px] ${done ? "" : "opacity-45"}`}
                >
                  <span className="w-[54px] shrink-0 font-bold tabular-nums text-muted-foreground">
                    {demoClock(e.t, true)}
                  </span>
                  <span className="min-w-0 flex-1">{e.text}</span>
                  {done && (
                    <button
                      type="button"
                      disabled={added}
                      onClick={() => demo.addDraft(demoClock(e.t), text)}
                      className="shrink-0 rounded-md border border-primary/50 px-2 py-0.5 text-[11px] font-semibold text-primary disabled:border-border disabled:text-muted-foreground"
                    >
                      {added ? "Added" : "Add"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={past.length === 0}
              onClick={() =>
                past.forEach(e =>
                  demo.addDraft(demoClock(e.t), cameraRowText(cam, e))
                )
              }
              className="rounded-xl border-2 border-primary/50 bg-primary/10 px-2 py-1.5 text-xs font-semibold text-foreground hover:bg-primary/20 disabled:opacity-50"
            >
              Add all so far
            </button>
            <button
              type="button"
              onClick={() => demo.openPip(cam.id)}
              className="rounded-xl border-2 border-border px-2 py-1.5 text-xs font-semibold text-foreground hover:bg-accent/40"
            >
              Open live view
            </button>
          </div>
        </>
      );
    }
  }

  return (
    <div className="px-3 py-3 border-b border-border space-y-3">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex-1">
          Integrations
        </span>
        <span className="rounded-md border border-amber-500/60 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
          Sample data
        </span>
      </div>
      <p className={NOTE}>
        Made-up pings, trackers and cameras, drawn against your real operations
        and targets. Nothing is saved, and nothing is added to any running
        sheet.
      </p>
      <button
        type="button"
        onClick={onGoToArea}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent/40"
      >
        <Crosshair className="h-3.5 w-3.5" />
        Go to sample area
      </button>

      {/* ── 4Sight: operation, then target(s) ── */}
      <div className="space-y-2 rounded-xl border border-border p-2.5">
        <SourceHeader
          colour={DEMO_COLOURS.tel}
          square
          title="Telephone data"
          sub="JSI 4Sight"
          on={demo.telOn}
          onToggle={() => demo.setTelOn(!demo.telOn)}
        />
        {demo.telOn && (
          <div className="space-y-2">
            <OperationSelect
              value={demo.telOpId}
              onChange={demo.changeTelOp}
              operations={operations}
              defaultOpId={defaultOpId}
            />
            <div className="space-y-1">
              <span className={LABEL}>Targets</span>
              <div className="space-y-1.5">
                {targetList.map(t => (
                  <Tick
                    key={t.id}
                    checked={demo.telTargets.some(x => x.id === t.id)}
                    onChange={() =>
                      demo.toggleTelTarget({ id: t.id, name: t.name })
                    }
                    title={t.name}
                    sub={`Written on the map as ${demoSurname(t.name)}`}
                  />
                ))}
              </div>
              {targetList.length === 0 && (
                <p className={NOTE}>No targets at this operation.</p>
              )}
              {targetList.length > 0 && demo.telTargets.length === 0 && (
                <p className={NOTE}>Tick one or more targets.</p>
              )}
              {demo.telTargets.length > 0 &&
                demo.shownPings.length === 0 &&
                demoPingsForSlot(0).length > 0 && (
                  <p className={NOTE}>
                    No ping yet at {demoClock(demo.time)} — move the time bar.
                  </p>
                )}
            </div>
          </div>
        )}
      </div>

      {/* ── Trackers: operation, then tracker(s) ── */}
      <div className="space-y-2 rounded-xl border border-border p-2.5">
        <SourceHeader
          colour={DEMO_COLOURS.trk}
          title="Trackers"
          sub="Vehicles by rego, items such as a box or crate"
          on={demo.trkOn}
          onToggle={() => demo.setTrkOn(!demo.trkOn)}
        />
        {demo.trkOn && (
          <div className="space-y-2">
            <OperationSelect
              value={demo.trkOpId}
              onChange={demo.setTrkOpId}
              operations={operations}
              defaultOpId={defaultOpId}
            />
            <div className="space-y-1">
              <span className={LABEL}>Trackers</span>
              <div className="space-y-1.5">
                {DEMO_TRACKERS.map(t => (
                  <Tick
                    key={t.id}
                    checked={demo.trkIds.includes(t.id)}
                    onChange={() => demo.toggleTrk(t.id)}
                    title={t.label}
                    sub={t.kind === "vehicle" ? `Vehicle, ${t.name}` : "Item"}
                  />
                ))}
              </div>
              {demo.trkIds.length === 0 && (
                <p className={NOTE}>Tick one or more trackers.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Milestone: surveillance cameras (Clay / T-Box), or operation then location ── */}
      <div className="space-y-2 rounded-xl border border-border p-2.5">
        <SourceHeader
          colour={DEMO_COLOURS.cam}
          title="Cameras"
          sub="Milestone"
          on={demo.camOn}
          onToggle={() => demo.setCamOn(!demo.camOn)}
        />
        {demo.camOn && (
          <div className="space-y-2">
            <div
              className="grid grid-cols-2 overflow-hidden rounded-xl border-2 border-border"
              role="group"
              aria-label="How to find a camera"
            >
              {(
                [
                  [1, "Surveillance cameras"],
                  [2, "Operation, location"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={demo.camMode === m}
                  onClick={() => demo.setCamMode(m)}
                  className={`px-1.5 py-1.5 text-[11px] font-semibold transition-colors ${
                    demo.camMode === m
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-foreground hover:bg-accent/40"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {demo.camMode === 1 ? (
              <div className="space-y-2">
                <div className="space-y-1">
                  <span className={LABEL}>Camera type</span>
                  <Select
                    value={demo.camType}
                    onValueChange={v => demo.setCamType(v as CameraType)}
                  >
                    <SelectTrigger className="w-full h-9 text-xs rounded-xl border-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Clay">Clay</SelectItem>
                      <SelectItem value="T-Box">T-Box</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <span className={LABEL}>Cameras</span>
                  <div className="space-y-1.5">
                    {typeCams.map(c => (
                      <Tick
                        key={c.id}
                        checked={demo.camIds.includes(c.id)}
                        onChange={() => demo.toggleCam(c.id)}
                        title={c.name}
                        sub={c.address}
                      />
                    ))}
                  </div>
                  {demo.camIds.length === 0 && (
                    <p className={NOTE}>Tick one or more cameras.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <OperationSelect
                  value={demo.camOpId}
                  onChange={demo.setCamOpId}
                  operations={operations}
                  defaultOpId={defaultOpId}
                />
                <div className="space-y-1">
                  <span className={LABEL}>Locations</span>
                  <div className="space-y-1.5">
                    {camsHere.map(c => (
                      <Tick
                        key={c.id}
                        checked={demo.camLocs.includes(c.locationLabel)}
                        onChange={() => demo.toggleCamLoc(c.locationLabel)}
                        title={c.locationLabel.split(", ")[0]}
                        sub={c.locationLabel.split(", ").slice(1).join(", ")}
                      />
                    ))}
                  </div>
                  {demo.camLocs.length === 0 && (
                    <p className={NOTE}>Tick one or more locations.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {selected && (
        <div className="space-y-2 rounded-xl border border-border p-2.5">
          {selected}
        </div>
      )}

      {demo.drafts.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border p-2.5">
          <div className="flex items-center gap-2">
            <span className={`${LABEL} flex-1`}>Draft rows (sample)</span>
            <button
              type="button"
              onClick={demo.clearDrafts}
              className="text-[11px] font-semibold text-primary"
            >
              Clear
            </button>
          </div>
          <ul className="space-y-1.5">
            {demo.drafts.map(d => (
              <li
                key={d.id}
                className="grid grid-cols-[44px_1fr] gap-2 rounded-lg border border-border px-2 py-1 text-[11px]"
              >
                <span className="font-bold tabular-nums text-muted-foreground">
                  {d.time}
                </span>
                <span className="break-words">{d.text}</span>
              </li>
            ))}
          </ul>
          <p className={NOTE}>
            These are not saved and are not on any running sheet. An officer
            would check each one before anything were added.
          </p>
        </div>
      )}
    </div>
  );
}

// Re-exported so the page can label the time bar without a second import.
export { demoClock };
