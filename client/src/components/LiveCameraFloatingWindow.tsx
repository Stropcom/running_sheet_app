/**
 * A draggable, closable floating window hosting a LiveCameraViewer. Several
 * can be open at once (the host page renders one of these per open camera
 * id and manages that list) — dragging is handled here via a dedicated
 * handle bar rather than LiveCameraViewer's own top bar, so its buttons
 * (mute, reconnect, fullscreen, close) stay clickable without fighting the
 * drag gesture.
 */
import { useRef, useState } from "react";
import { GripHorizontal, X } from "lucide-react";
import { LiveCameraViewer } from "./LiveCameraViewer";

export function LiveCameraFloatingWindow({
  name,
  webRtcUrl,
  hlsUrl,
  onClose,
  stackIndex = 0,
}: {
  name: string;
  webRtcUrl: string | null;
  hlsUrl?: string | null;
  onClose: () => void;
  // Staggers each new window's default position so several don't open
  // exactly on top of each other.
  stackIndex?: number;
}) {
  const [position, setPosition] = useState({
    x: 80 + stackIndex * 32,
    y: 80 + stackIndex * 32,
  });
  const dragState = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: position.x,
      origY: position.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setPosition({
      x: Math.max(0, dragState.current.origX + dx),
      y: Math.max(0, dragState.current.origY + dy),
    });
  };
  const onPointerUp = () => {
    dragState.current = null;
  };

  return (
    <div
      className="fixed z-40 w-[360px] h-[240px] rounded-lg overflow-hidden shadow-2xl border border-border flex flex-col bg-black"
      style={{ left: position.x, top: position.y }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex items-center justify-between px-2 py-1 bg-card border-b border-border cursor-grab active:cursor-grabbing shrink-0 select-none"
      >
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground min-w-0">
          <GripHorizontal className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{name}</span>
        </div>
        <button
          onClick={onClose}
          className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <LiveCameraViewer
        name={name}
        webRtcUrl={webRtcUrl}
        hlsUrl={hlsUrl}
        className="flex-1"
      />
    </div>
  );
}
