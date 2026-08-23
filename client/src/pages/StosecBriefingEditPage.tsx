import { useParams } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { StosecBriefingForm } from "@/components/StosecBriefingForm";

// Explicit /edit route so a POSTED briefing can still be reached in form
// mode (StosecBriefingDetailPage otherwise renders the acknowledge view for
// anything already posted). StosecBriefingForm itself doesn't care about
// status — it just adapts its button labels when the briefing is posted.
export default function StosecBriefingEditPage() {
  const { id } = useParams<{ id: string }>();
  const briefingId = parseInt(id ?? "0", 10);

  return (
    <DashboardLayout>
      <StosecBriefingForm briefingId={briefingId} />
    </DashboardLayout>
  );
}
