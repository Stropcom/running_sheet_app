import { useRoute } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { ArrowLeft } from "lucide-react";
import { OperationProfileContent } from "@/components/OperationProfileContent";

export default function IntelligenceOperationProfile() {
  const [, params] = useRoute("/intelligence/operation/:id");
  const operationId = parseInt(params?.id ?? "0", 10);

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-1"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>
      <OperationProfileContent operationId={operationId} />
    </DashboardLayout>
  );
}
