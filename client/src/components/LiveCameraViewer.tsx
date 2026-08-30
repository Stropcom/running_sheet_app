/**
 * LiveCameraViewer — a reusable WebRTC (WHEP) video viewer, not tied to any
 * particular camera source. Eufy/MediaMTX is simply the first provider;
 * anything that exposes a MediaMTX-style WHEP endpoint (Milestone XProtect,
 * Axis, Hanwha, other ONVIF/RTSP cameras via MediaMTX) plugs into this same
 * component unchanged.
 *
 * WHEP (WebRTC-HTTP Egress Protocol) is what MediaMTX speaks for WebRTC
 * playback: POST an SDP offer to `webRtcUrl`, get an SDP answer back (plus a
 * `Location` header identifying the session for teardown), then it's a
 * normal RTCPeerConnection from there.
 *
 * HLS fallback (hlsUrl) is intentionally NOT implemented yet — plumbed
 * through as a prop for later, but wiring an actual player (native only
 * works in Safari; everywhere else needs hls.js) is left to when it's
 * actually needed rather than half-built now.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Volume2,
  VolumeX,
  RefreshCw,
  X,
  Maximize,
  Minimize,
  Loader2,
  VideoOff,
} from "lucide-react";

type ConnectionState = "connecting" | "live" | "error" | "reconnecting";

interface LiveCameraViewerProps {
  name: string;
  webRtcUrl: string | null;
  hlsUrl?: string | null;
  className?: string;
  onClose?: () => void;
}

function usePerthClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const format = () =>
      new Intl.DateTimeFormat("en-AU", {
        timeZone: "Australia/Perth",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date());
    setTime(format());
    const id = setInterval(() => setTime(format()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export function LiveCameraViewer({
  name,
  webRtcUrl,
  className,
  onClose,
}: LiveCameraViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const whepResourceUrlRef = useRef<string | null>(null);

  const [state, setState] = useState<ConnectionState>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [connectAttempt, setConnectAttempt] = useState(0);

  const perthTime = usePerthClock();

  const teardown = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    if (whepResourceUrlRef.current) {
      // Best-effort — tells MediaMTX to release the session. Ignored if it
      // fails; the connection is already torn down locally either way.
      fetch(whepResourceUrlRef.current, { method: "DELETE" }).catch(() => {});
      whepResourceUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!webRtcUrl) {
      setState("error");
      setErrorMessage("No WebRTC URL configured for this camera.");
      return;
    }
    let cancelled = false;
    setState(connectAttempt === 0 ? "connecting" : "reconnecting");
    setErrorMessage(null);

    (async () => {
      try {
        const pc = new RTCPeerConnection();
        pcRef.current = pc;
        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("audio", { direction: "recvonly" });

        pc.ontrack = event => {
          if (videoRef.current && event.streams[0]) {
            videoRef.current.srcObject = event.streams[0];
          }
        };
        pc.onconnectionstatechange = () => {
          if (cancelled) return;
          if (pc.connectionState === "connected") setState("live");
          if (
            pc.connectionState === "failed" ||
            pc.connectionState === "disconnected"
          ) {
            setState("error");
            setErrorMessage("Connection lost.");
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const res = await fetch(webRtcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: offer.sdp,
        });
        if (!res.ok) {
          throw new Error(`WHEP endpoint returned ${res.status}`);
        }
        const location = res.headers.get("Location");
        whepResourceUrlRef.current = location
          ? new URL(location, webRtcUrl).toString()
          : null;
        const answerSdp = await res.text();
        if (cancelled) return;
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      } catch (err) {
        if (cancelled) return;
        setState("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to connect."
        );
      }
    })();

    return () => {
      cancelled = true;
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webRtcUrl, connectAttempt]);

  const reconnect = () => {
    teardown();
    setConnectAttempt(a => a + 1);
  };

  const toggleMute = () => {
    if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
    setMuted(m => !m);
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-black overflow-hidden ${className ?? ""}`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="w-full h-full object-contain"
      />

      {state !== "live" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80 bg-black/60">
          {state === "error" ? (
            <>
              <VideoOff className="w-8 h-8" />
              <p className="text-sm">{errorMessage ?? "Unable to connect."}</p>
            </>
          ) : (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-sm">
                {state === "reconnecting" ? "Reconnecting…" : "Connecting…"}
              </p>
            </>
          )}
        </div>
      )}

      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 flex items-center justify-between px-3 py-2 bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-center gap-2 min-w-0">
          {state === "live" && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-white bg-red-600 rounded px-1.5 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              LIVE
            </span>
          )}
          <span className="text-white text-sm font-medium truncate">
            {name}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-white/70 text-xs font-mono tabular-nums mr-1">
            {perthTime} AWST
          </span>
          <button
            onClick={toggleMute}
            className="p-1.5 rounded-md text-white/80 hover:bg-white/10"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={reconnect}
            className="p-1.5 rounded-md text-white/80 hover:bg-white/10"
            aria-label="Reconnect"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-md text-white/80 hover:bg-white/10"
            aria-label="Toggle fullscreen"
          >
            {isFullscreen ? (
              <Minimize className="w-4 h-4" />
            ) : (
              <Maximize className="w-4 h-4" />
            )}
          </button>
          {onClose && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-white/80 hover:bg-white/10 hover:text-white"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
