import { useParams } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { SmeacBriefingForm } from "@/components/SmeacBriefingForm";

// Explicit /edit route so a POSTED briefing can still be reached in form
// mode (SmeacBriefingDetailPage otherwise renders the acknowledge view for
// anything already posted). SmeacBriefingForm itself doesn't care about
// status — it just adapts its button labels when the briefing is posted.
export default function SmeacBriefingEditPage() {
  const { id } = useParams<{ id: string }>();
  const briefingId = parseInt(id ?? "0", 10);

  return (
    <DashboardLayout>
      <SmeacBriefingForm briefingId={briefingId} />
    </DashboardLayout>
  );
}
