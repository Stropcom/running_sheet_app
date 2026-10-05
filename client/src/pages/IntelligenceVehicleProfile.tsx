import { useRoute } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { VehicleProfileContent } from "@/components/VehicleProfileContent";
import { ArrowLeft } from "lucide-react";

export default function IntelligenceVehicleProfile() {
  const [, params] = useRoute("/intelligence/vehicle/:label");
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
      <VehicleProfileContent label={label} />
    </DashboardLayout>
  );
}
