/**
 * Docks a LiveCameraViewer to the right edge of whatever page renders it —
 * the same absolutely-positioned shell SmeacMapOverlay.tsx uses to dock a
 * SMEAC briefing over the live Mapping page. Meant to drop into the
 * operational map unchanged once that integration happens; the host page
 * just needs `position: relative` on its container.
 */
import { LiveCameraViewer } from "./LiveCameraViewer";

export function LiveCameraDockPanel({
  name,
  webRtcUrl,
  hlsUrl,
  onClose,
}: {
  name: string;
  webRtcUrl: string | null;
  hlsUrl?: string | null;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-y-0 right-0 z-30 w-full sm:w-[420px] flex flex-col bg-card/97 backdrop-blur-sm border-l border-border shadow-2xl">
      <LiveCameraViewer
        name={name}
        webRtcUrl={webRtcUrl}
        hlsUrl={hlsUrl}
        onClose={onClose}
        className="flex-1"
      />
    </div>
  );
}
