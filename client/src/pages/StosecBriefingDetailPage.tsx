import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Spinner } from "@/components/ui/spinner";
import { StosecBriefingForm } from "@/components/StosecBriefingForm";

// A draft (not yet posted) opens as the editable form here — only its
// creator/an admin can reach a meaningful view (the server scopes drafts to
// their creator in stosecBriefing.list, but getById itself has no such
// check, so this route works for the creator returning to finish a draft).
//
// Once posted, this route immediately redirects to the live Mapping page
// with the briefing docked as an overlay (see StosecMapOverlay /
// IntelligenceMapping.tsx) — a posted briefing's canonical view is over the
// real map, not a page of its own, so there is only ever one place that
// shows it. The Post notification links straight to the Mapping URL and
// never passes through here at all; this redirect exists for the list page
// and any other link that still points at /administration/stosec/:id.
export default function StosecBriefingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const briefingId = parseInt(id ?? "0", 10);
  const [, setLocation] = useLocation();

  const { data: briefing, isLoading } = trpc.stosecBriefing.getById.useQuery(
    { id: briefingId },
    { enabled: !!briefingId }
  );

  useEffect(() => {
    if (briefing?.status === "posted") {
      setLocation(`/intelligence/mapping?stosec=${briefingId}`, {
        replace: true,
      });
    }
  }, [briefing?.status, briefingId, setLocation]);

  if (isLoading || briefing?.status === "posted") {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Spinner className="h-6 w-6" />
        </div>
      </DashboardLayout>
    );
  }

  if (!briefing) {
    return (
      <DashboardLayout>
        <div className="p-6 text-sm text-muted-foreground">
          Briefing not found.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <StosecBriefingForm briefingId={briefingId} />
    </DashboardLayout>
  );
}
