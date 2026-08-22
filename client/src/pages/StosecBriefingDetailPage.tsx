import { useParams } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Spinner } from "@/components/ui/spinner";
import { StosecBriefingForm } from "@/components/StosecBriefingForm";
import { StosecAcknowledgeView } from "@/components/StosecAcknowledgeView";

// A draft (not yet posted) opens as the editable form — only its creator/an
// admin can reach a meaningful view (the server scopes drafts to their
// creator in stosecBriefing.list, but getById itself has no such check, so
// this route works for the creator returning to finish a draft). Once
// posted, the exact same URL — the one the notification links to — instead
// renders the read-only acknowledgement view.
export default function StosecBriefingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const briefingId = parseInt(id ?? "0", 10);

  const { data: briefing, isLoading } = trpc.stosecBriefing.getById.useQuery(
    { id: briefingId },
    { enabled: !!briefingId }
  );

  if (isLoading) {
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

  if (briefing.status === "draft") {
    return (
      <DashboardLayout>
        <StosecBriefingForm briefingId={briefingId} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout fillViewport>
      <StosecAcknowledgeView briefing={briefing} />
    </DashboardLayout>
  );
}
