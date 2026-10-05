import { useRoute } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { LocationProfileContent } from "@/components/LocationProfileContent";
import { ArrowLeft } from "lucide-react";

export default function IntelligenceLocationProfile() {
  const [, params] = useRoute("/intelligence/location/:label");
  const label = decodeURIComponent(params?.label ?? "");
  return (
    <DashboardLayout>
      <div className="px-4 pt-6">
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>
      <LocationProfileContent label={label} />
    </DashboardLayout>
  );
}
