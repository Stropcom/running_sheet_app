import { useParams } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { UcoGuideForm } from "@/components/UcoGuideForm";

// Explicit /edit route so a POSTED guide can still be reached in form mode —
// UcoGuideDetailPage otherwise renders the acknowledge view for anything
// already posted. UcoGuideForm itself doesn't care about status; it just
// adapts its button labels when the guide is posted.
export default function UcoGuideEditPage() {
  const { id } = useParams<{ id: string }>();
  const guideId = parseInt(id ?? "0", 10);

  return (
    <DashboardLayout>
      <UcoGuideForm briefingId={guideId} />
    </DashboardLayout>
  );
}
