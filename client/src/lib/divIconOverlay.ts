/// <reference types="@types/google.maps" />

/**
 * DivIconOverlay — a google.maps.OverlayView-based drop-in replacement for
 * google.maps.marker.AdvancedMarkerElement, written to fix a confirmed
 * AdvancedMarkerElement bug: its on-screen position visibly drifts away
 * from its true lat/lng the further the map is zoomed from wherever it was
 * last drawn (see CLAUDE.md, "Known issue — AdvancedMarkerElement
 * positioning drift"). Confirmed present under both a real vector and a
 * real raster Map ID, so it isn't a rendering-mode issue — it's
 * AdvancedMarkerElement itself recalculating its position incorrectly as
 * part of the map's own render loop, in a way nothing outside the class
 * can intercept or correct.
 *
 * OverlayView is the older, plain-DOM overlay API that Circle/Rectangle/
 * Polygon/Polyline (map shapes) already render through — which is exactly
 * why shapes never drift. It recomputes its own pixel position from the
 * map's live projection on every redraw (see draw() below) instead of
 * trusting any internally-cached position, which is what fixes the bug.
 *
 * API shape is intentionally close to AdvancedMarkerElement so call sites
 * change minimally: `.map` / `.position` / `.content` / `.zIndex` /
 * `.title` / `.gmpDraggable` are get/set properties, and `.addListener(...)`
 * behaves like the real google.maps.MVCObject method (returns a genuine
 * MapsEventListener, compatible with google.maps.event.removeListener).
 * Internally, custom events ("click", "gmp-click", "rightclick", "dragend")
 * are fired via google.maps.event.trigger(...).
 *
 * IMPORTANT: the actual `extends google.maps.OverlayView` class is built
 * lazily, on first construction (see getImplCtor below), NOT declared at
 * module scope. `google.maps.OverlayView` doesn't exist until the Maps JS
 * API script has finished loading (loadGoogleMaps(), invoked from
 * components/Map.tsx's effect) — but this module is imported from
 * IntelligenceMapping.tsx, which App.tsx imports eagerly, so it gets
 * evaluated as part of the app's single main JS bundle on every page load,
 * well before Maps has loaded. A top-level `class X extends
 * google.maps.OverlayView {}` would throw the instant this file loads
 * (google.maps is undefined at that point), crashing the entire app before
 * React ever renders anything — a real incident this caused once already.
 * Deferring the `extends` into a function that only runs the first time a
 * DivIconOverlay is actually constructed avoids this: by the time any code
 * places a marker, Maps has always finished loading.
 *
 * Two behaviours AdvancedMarkerElement provides natively have no
 * equivalent on OverlayView and are hand-rolled in the lazily-built impl:
 *  - Drag-to-move (gmpDraggable + "dragend"): implemented via pointerdown/
 *    pointermove/pointerup on the container, converting pixel deltas to
 *    lat/lng through the map's projection.
 *  - Collision behaviour / z-index: not used anywhere in this codebase
 *    (nothing sets collisionBehavior), so only zIndex is replicated, via
 *    a plain CSS z-index on the container.
 */

export type DivIconOverlayAnchor = "center" | "none";

export interface DivIconOverlayOptions {
  map?: google.maps.Map | null;
  position: google.maps.LatLngLiteral;
  content: HTMLElement;
  zIndex?: number;
  title?: string;
  // "center" (default) centers the whole content element on `position`,
  // matching AdvancedMarkerElement's default anchor — used for custom
  // markers, live team pins, intel pins, and the address search pin.
  // "none" leaves the container un-transformed and positioned with its
  // top-left corner at `position`, so a caller-set transform on `content`
  // itself (e.g. shape note-label pills offsetting beside their anchor)
  // stays authoritative. Only shape note-labels use "none".
  anchor?: DivIconOverlayAnchor;
}

// Deliberately no `map` property here — see getImplCtor's comment on why
// the class extending google.maps.OverlayView must never define one.
interface DivIconOverlayImpl extends google.maps.OverlayView {
  position: google.maps.LatLngLiteral;
  content: HTMLElement;
  zIndex: number;
  title: string | undefined;
  gmpDraggable: boolean;
}

type DivIconOverlayImplCtor = new (
  options: DivIconOverlayOptions
) => DivIconOverlayImpl;

let ImplCtor: DivIconOverlayImplCtor | null = null;

function getImplCtor(): DivIconOverlayImplCtor {
  if (ImplCtor) return ImplCtor;

  // Impl must NEVER define its own `map` getter/setter. OverlayView's real
  // setMap()/getMap() implementation reads/writes a property literally
  // named `map` on the instance internally — defining our own `map`
  // accessor on this class (or a subclass of it) shadows that and creates
  // infinite recursion the instant setMap() is called (setMap -> assigns
  // `this.map` -> invokes our setter -> calls setMap() again -> ...),
  // surfacing as "RangeError: Maximum call stack size exceeded at
  // t.setMap". The outer DivIconOverlay wrapper class below is a separate,
  // non-OverlayView class, so it's safe for IT to expose `.map` — it just
  // has to call `impl.getMap()`/`impl.setMap()` directly rather than
  // `impl.map`.
  class Impl extends google.maps.OverlayView {
    private _position: google.maps.LatLngLiteral;
    private _content: HTMLElement;
    private _zIndex: number;
    private _title: string | undefined;
    private readonly _anchor: DivIconOverlayAnchor;
    private _container: HTMLDivElement | null = null;
    private _draggable = false;
    private _suppressNextClick = false;

    constructor(options: DivIconOverlayOptions) {
      super();
      this._position = options.position;
      this._content = options.content;
      this._zIndex = options.zIndex ?? 0;
      this._anchor = options.anchor ?? "center";
      this._title = options.title;
      if (options.title) this._content.title = options.title;
      if (options.map) this.setMap(options.map);
    }

    get title(): string | undefined {
      return this._title;
    }
    set title(t: string | undefined) {
      this._title = t;
      this._content.title = t ?? "";
    }

    get position(): google.maps.LatLngLiteral {
      return this._position;
    }
    set position(p: google.maps.LatLngLiteral) {
      this._position = p;
      this.draw();
    }

    get content(): HTMLElement {
      return this._content;
    }
    set content(el: HTMLElement) {
      const old = this._content;
      this._content = el;
      if (this._container) {
        if (old.parentElement === this._container) {
          this._container.removeChild(old);
        }
        this._container.appendChild(el);
      }
    }

    get zIndex(): number {
      return this._zIndex;
    }
    set zIndex(z: number) {
      this._zIndex = z;
      if (this._container) this._container.style.zIndex = String(z);
    }

    get gmpDraggable(): boolean {
      return this._draggable;
    }
    set gmpDraggable(v: boolean) {
      this._draggable = v;
    }

    onAdd(): void {
      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.zIndex = String(this._zIndex);
      container.appendChild(this._content);
      container.addEventListener("click", this.handleClick);
      container.addEventListener("contextmenu", this.handleContextMenu);
      container.addEventListener("pointerdown", this.handlePointerDown);
      this._container = container;
      this.getPanes()?.overlayMouseTarget.appendChild(container);
      this.draw();
    }

    draw(): void {
      if (!this._container) return;
      const projection = this.getProjection();
      if (!projection) return;
      const point = projection.fromLatLngToDivPixel(
        new google.maps.LatLng(this._position.lat, this._position.lng)
      );
      if (!point) return;
      this._container.style.left = `${point.x}px`;
      this._container.style.top = `${point.y}px`;
      this._container.style.transform =
        this._anchor === "center" ? "translate(-50%, -50%)" : "";
    }

    onRemove(): void {
      if (this._container) {
        this._container.removeEventListener("click", this.handleClick);
        this._container.removeEventListener(
          "contextmenu",
          this.handleContextMenu
        );
        this._container.removeEventListener(
          "pointerdown",
          this.handlePointerDown
        );
        this._container.parentElement?.removeChild(this._container);
      }
      this._container = null;
    }

    private handleClick = (e: MouseEvent) => {
      // Without this, a marker placed exactly on top of a Google-labelled
      // business/POI icon baked into the map tiles lets this click bubble
      // past our container to the map's own click listener underneath,
      // which sees the same click land on that POI and opens the
      // business/place action-chooser sheet on top of this marker's own
      // popup — two popups for one tap. Plain address/residential markers
      // never showed this because there's no POI icon under them to catch
      // the bubbled click.
      e.stopPropagation();
      if (this._suppressNextClick) {
        this._suppressNextClick = false;
        return;
      }
      google.maps.event.trigger(this, "click", e);
      google.maps.event.trigger(this, "gmp-click", e);
    };

    private handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      google.maps.event.trigger(this, "rightclick", e);
    };

    private handlePointerDown = (e: PointerEvent) => {
      if (!this._draggable) return;
      const projection = this.getProjection();
      if (!projection) return;
      const startPoint = projection.fromLatLngToDivPixel(
        new google.maps.LatLng(this._position.lat, this._position.lng)
      );
      if (!startPoint) return;
      e.preventDefault();
      e.stopPropagation();
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      let moved = false;

      const onMove = (moveEvent: PointerEvent) => {
        moved = true;
        const dx = moveEvent.clientX - startClientX;
        const dy = moveEvent.clientY - startClientY;
        const newLatLng = projection.fromDivPixelToLatLng(
          new google.maps.Point(startPoint.x + dx, startPoint.y + dy)
        );
        if (newLatLng) {
          this._position = { lat: newLatLng.lat(), lng: newLatLng.lng() };
          this.draw();
        }
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (moved) {
          this._suppressNextClick = true;
          google.maps.event.trigger(this, "dragend");
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };
  }

  ImplCtor = Impl as unknown as DivIconOverlayImplCtor;
  return ImplCtor;
}

export class DivIconOverlay {
  private impl: DivIconOverlayImpl;

  constructor(options: DivIconOverlayOptions) {
    const Ctor = getImplCtor();
    this.impl = new Ctor(options);
  }

  // Calls the real inherited getMap()/setMap() directly rather than a
  // `.map` property on impl — see getImplCtor's comment on why Impl itself
  // must never define a `map` accessor.
  get map(): google.maps.Map | null {
    return (this.impl.getMap() as google.maps.Map | null) ?? null;
  }
  set map(m: google.maps.Map | null) {
    this.impl.setMap(m);
  }

  get position(): google.maps.LatLngLiteral {
    return this.impl.position;
  }
  set position(p: google.maps.LatLngLiteral) {
    this.impl.position = p;
  }

  get content(): HTMLElement {
    return this.impl.content;
  }
  set content(el: HTMLElement) {
    this.impl.content = el;
  }

  get zIndex(): number {
    return this.impl.zIndex;
  }
  set zIndex(z: number) {
    this.impl.zIndex = z;
  }

  get title(): string | undefined {
    return this.impl.title;
  }
  set title(t: string | undefined) {
    this.impl.title = t;
  }

  get gmpDraggable(): boolean {
    return this.impl.gmpDraggable;
  }
  set gmpDraggable(v: boolean) {
    this.impl.gmpDraggable = v;
  }

  addListener(
    eventName: string,
    handler: (...args: any[]) => void
  ): google.maps.MapsEventListener {
    return this.impl.addListener(eventName, handler);
  }
}
