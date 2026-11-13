import DashboardLayout from "@/components/DashboardLayout";
import { useMapScreen } from "./intelligenceMapping/useMapScreen";
import { MapArea } from "./intelligenceMapping/MapArea";
import { RsActionsPane } from "./intelligenceMapping/RsActionsPane";
import { MapPopups } from "./intelligenceMapping/MapPopups";
import { ShapePlacementPanel } from "./intelligenceMapping/ShapePlacementPanel";
import { MapBanners } from "./intelligenceMapping/MapBanners";
import { IntelPinEditDialog } from "./intelligenceMapping/IntelPinEditDialog";
import { MapQeModal } from "./intelligenceMapping/MapQeModal";
import { CustomMarkerModal } from "./intelligenceMapping/CustomMarkerModal";
import { MapDialogs } from "./intelligenceMapping/MapDialogs";

// ── Main Component ─────────────────────────────────────────────────────────────
export default function IntelligenceMapping() {
  const s = useMapScreen();
  const { rsActionsPaneOpen, setRsActionsPaneOpen } = s;

  return (
    <DashboardLayout
      fillViewport
      rightPaneToggle={{
        isOpen: rsActionsPaneOpen,
        onToggle: () => setRsActionsPaneOpen(o => !o),
      }}
    >
      <div className="relative flex w-full h-full overflow-hidden">
        <MapArea s={s} />

        <RsActionsPane s={s} />

        <MapPopups s={s} />

        <ShapePlacementPanel s={s} />

        <MapBanners s={s} />

        <IntelPinEditDialog s={s} />

        <MapQeModal s={s} />

        <CustomMarkerModal s={s} />
      </div>

      <MapDialogs s={s} />
    </DashboardLayout>
  );
}
