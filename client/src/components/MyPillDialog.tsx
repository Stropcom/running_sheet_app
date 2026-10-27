import { useState } from "react";
import { ChevronDown, Crosshair } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  HEADING_SHAPE_OPTIONS,
  PIN_COLOUR_SWATCHES,
  renderHeadingShapeInner,
  type PinHeadingShape,
} from "@/lib/pillOptions";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SeenAgoButtons,
  SearchButtons,
  type TargetPredictorState,
} from "@/components/TargetPredictor";

/** The officer's own live pin, as far as this popup needs it. */
export interface MyPillOwnPin {
  onFoot: boolean;
  pinVehicleIcon: PinHeadingShape;
  pinColor: string | null;
}

/** "My Pill" — opened by tapping your own name pill on the Map page (see the
 * click listener attached in createUserPinElement). Search and Track at the
 * top, Wheels / Foot, and a collapsed Customise (heading shape and pill
 * colour). The on-foot glyph is always the plain neutral one. */
export function MyPillDialog({
  open,
  onOpenChange,
  own,
  isInvestigator,
  tracking,
  onSetTracking,
  predictor,
  onSetOnFoot,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  own: MyPillOwnPin | undefined;
  isInvestigator: boolean;
  /** Trails are showing on this screen. */
  tracking: boolean;
  onSetTracking: (on: boolean) => void;
  predictor: TargetPredictorState;
  onSetOnFoot: (onFoot: boolean) => void;
}) {
  // The Search section opens from its Search button.
  const [pointerSearchOpen, setPointerSearchOpen] = useState(false);
  // "Customise" (heading shape, pill colour) starts closed.
  const [pillCustomiseOpen, setPillCustomiseOpen] = useState(false);
  const setPinAppearanceMut = trpc.intelligence.setPinAppearance.useMutation();

  const onFoot = own?.onFoot ?? false;
  const headingShape = own?.pinVehicleIcon ?? "arrow";
  const pinColor = own?.pinColor ?? null;

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        onOpenChange(next);
        if (!next) {
          setPointerSearchOpen(false);
          setPillCustomiseOpen(false);
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>My Pill</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          {/* Search and Track — at the top. Search starts Search for the
                    team on the selected running sheet; it is empty when off and
                    shaded when on. Track is a switch of its own, the same as
                    Track in the Teams panel but for everyone at once: it shows
                    the trails of me and of everyone sharing on the operation,
                    on this screen only. It stays where it is whether or not
                    Search is on; Search's options open below it. Choosing how
                    long ago he was seen closes this popup so the map can be
                    tapped for where. */}
          {!isInvestigator && (
            <div className="space-y-2" data-testid="pointer-search">
              {(() => {
                const searchOn = predictor.on && predictor.mode === "now";
                const base =
                  "flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border-2 text-sm font-semibold transition-colors disabled:opacity-50";
                return (
                  <>
                    <button
                      type="button"
                      disabled={!predictor.canSearch}
                      onClick={() => {
                        predictor.startFromPointer();
                        setPointerSearchOpen(true);
                      }}
                      aria-pressed={searchOn}
                      className={`${base} ${
                        searchOn
                          ? "border-violet-500/50 bg-violet-500/10 text-violet-500"
                          : "border-border bg-card text-foreground hover:bg-accent/40"
                      }`}
                    >
                      <Crosshair className="h-4 w-4" />
                      Search
                    </button>
                    <button
                      type="button"
                      onClick={() => onSetTracking(!tracking)}
                      aria-pressed={tracking}
                      className={`${base} ${
                        tracking
                          ? "border-indigo-500 bg-indigo-500/10 text-indigo-400"
                          : "border-border bg-card text-foreground hover:bg-accent/40"
                      }`}
                    >
                      {tracking ? "Tracking" : "Track"}
                    </button>
                    {!predictor.canSearch && (
                      <p className="text-xs text-muted-foreground">
                        Select a running sheet that has a target (Active RS) to
                        search.
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {tracking
                        ? "Trails are showing on your screen for everyone sharing on this operation. Tap to clear them."
                        : "Tap to show the trails of you and everyone sharing on this operation. A Search switches them on for you; you can switch them off any time."}
                    </p>
                    {(searchOn || pointerSearchOpen) && predictor.canSearch && (
                      <>
                        <SeenAgoButtons
                          p={predictor}
                          onPick={n => {
                            predictor.beginSighting(n);
                            setPointerSearchOpen(false);
                            onOpenChange(false);
                          }}
                        />
                        <SearchButtons
                          p={predictor}
                          showEnd
                          onDone={() => {
                            setPointerSearchOpen(false);
                            onOpenChange(false);
                          }}
                        />
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onSetOnFoot(false)}
              className={`flex flex-col items-center gap-1 rounded-lg border-2 py-3 transition-all ${
                !onFoot
                  ? "border-primary bg-primary/10 scale-105"
                  : "border-border bg-accent/30 hover:border-primary/50"
              }`}
            >
              {/* Same shape as the live pin's own arrow — see
                        renderHeadingShapeInner — not a generic ⬆️ emoji. */}
              <span
                className="w-5 h-5 flex items-center justify-center"
                dangerouslySetInnerHTML={{
                  __html: renderHeadingShapeInner("arrow"),
                }}
              />
              <span className="text-xs font-semibold">Wheels</span>
            </button>
            <button
              type="button"
              onClick={() => onSetOnFoot(true)}
              className={`flex flex-col items-center gap-1 rounded-lg border-2 py-3 transition-all ${
                onFoot
                  ? "border-primary bg-primary/10 scale-105"
                  : "border-border bg-accent/30 hover:border-primary/50"
              }`}
            >
              <span className="text-xl">🚶</span>
              <span className="text-xs font-semibold">Foot</span>
            </button>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Foot switches back to Wheels automatically once speed goes over 15
            km/h.
          </p>

          <Collapsible
            open={pillCustomiseOpen}
            onOpenChange={setPillCustomiseOpen}
            className="space-y-3"
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex min-h-[44px] w-full items-center justify-between rounded-lg border-2 border-border bg-card px-3 text-sm font-semibold hover:bg-accent/40"
              >
                Customise
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${
                    pillCustomiseOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4">
              {!onFoot && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Heading shape
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {HEADING_SHAPE_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() =>
                          setPinAppearanceMut.mutate({
                            pinVehicleIcon: opt.key,
                          })
                        }
                        title={opt.label}
                        aria-label={opt.label}
                        className={`flex items-center justify-center rounded-lg border-2 py-2 transition-all ${
                          headingShape === opt.key
                            ? "border-primary bg-primary/10 scale-105"
                            : "border-border bg-accent/30 hover:border-primary/50"
                        }`}
                      >
                        <span
                          className="w-5 h-5 flex items-center justify-center"
                          dangerouslySetInnerHTML={{
                            __html: renderHeadingShapeInner(opt.key),
                          }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Pill colour
                  </p>
                  {pinColor && (
                    <button
                      type="button"
                      onClick={() =>
                        setPinAppearanceMut.mutate({ pinColor: null })
                      }
                      className="text-[10px] font-medium text-muted-foreground hover:text-foreground underline underline-offset-2"
                    >
                      Reset to team colour
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-5 gap-2 justify-items-center">
                  {PIN_COLOUR_SWATCHES.map(swatch => (
                    <button
                      key={swatch.hex}
                      type="button"
                      onClick={() =>
                        setPinAppearanceMut.mutate({
                          pinColor: swatch.hex,
                        })
                      }
                      title={swatch.name}
                      aria-label={swatch.name}
                      className={`h-8 w-8 rounded-full border-2 transition-all ${
                        pinColor === swatch.hex
                          ? "border-foreground scale-110"
                          : "border-transparent hover:scale-105"
                      }`}
                      style={{ background: swatch.hex }}
                    />
                  ))}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </DialogContent>
    </Dialog>
  );
}
