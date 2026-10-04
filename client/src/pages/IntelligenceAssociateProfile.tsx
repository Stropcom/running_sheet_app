import { useRoute } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { AssociateProfileContent } from "@/components/AssociateProfileContent";
import { ArrowLeft } from "lucide-react";

export default function IntelligenceAssociateProfile() {
  const [, params] = useRoute("/intelligence/associate/:label");
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
      <AssociateProfileContent label={label} />
    </DashboardLayout>
  );
}
