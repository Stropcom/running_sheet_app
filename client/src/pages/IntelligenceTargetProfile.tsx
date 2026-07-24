import { useRoute } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { ArrowLeft } from "lucide-react";
import { TargetProfileContent } from "@/components/TargetProfileContent";

export default function IntelligenceTargetProfile() {
  const [, params] = useRoute("/intelligence/target/:id");
  const targetId = parseInt(params?.id ?? "0", 10);

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 pt-6">
        {/* Back button — goes to previous page in history */}
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-1"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>
      <TargetProfileContent targetId={targetId} />
    </DashboardLayout>
  );
}
