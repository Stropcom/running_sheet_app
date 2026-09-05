import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Spinner } from "@/components/ui/spinner";
import { UcoGuideForm } from "@/components/UcoGuideForm";

// A draft (not yet posted) opens as the editable form here. Once posted,
// this route immediately redirects to the live Mapping page with the guide
// docked as an overlay (see UcoGuideMapOverlay / IntelligenceMapping.tsx) —
// a posted guide's canonical view is over the real map, not a page of its
// own, mirroring SmeacBriefingDetailPage's redirect for the same reason.
export default function UcoGuideDetailPage() {
  const { id } = useParams<{ id: string }>();
  const guideId = parseInt(id ?? "0", 10);
  const [, setLocation] = useLocation();

  const { data: guide, isLoading } = trpc.ucoGuide.getById.useQuery(
    { id: guideId },
    { enabled: !!guideId }
  );

  useEffect(() => {
    if (guide?.status === "posted") {
      setLocation(`/intelligence/mapping?ucoGuide=${guideId}`, {
        replace: true,
      });
    }
  }, [guide?.status, guideId, setLocation]);

  if (isLoading || guide?.status === "posted") {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Spinner className="h-6 w-6" />
        </div>
      </DashboardLayout>
    );
  }

  if (!guide) {
    return (
      <DashboardLayout>
        <div className="p-6 text-sm text-muted-foreground">
          Guide not found.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <UcoGuideForm briefingId={guideId} />
    </DashboardLayout>
  );
}
