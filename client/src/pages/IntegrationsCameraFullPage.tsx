import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { LiveCameraViewer } from "@/components/LiveCameraViewer";
import { ShieldAlert, Loader2 } from "lucide-react";

export default function IntegrationsCameraFullPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user: currentUser, isAuthenticated } = useAuth();
  const isAdmin = isAuthenticated && currentUser?.role === "admin";

  const { data: camera, isLoading } =
    trpc.integrations.cameras.getById.useQuery(
      { id: Number(id) },
      { enabled: isAdmin && !!id }
    );

  if (!isAuthenticated) return null;

  if (!isAdmin) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-background">
        <ShieldAlert className="w-8 h-8 text-destructive" />
        <p className="text-foreground font-medium">Access Denied</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black">
        <Loader2 className="w-6 h-6 animate-spin text-white/70" />
      </div>
    );
  }

  if (!camera) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black text-white/70">
        Camera not found.
      </div>
    );
  }

  return (
    <div className="fixed inset-0">
      <LiveCameraViewer
        name={camera.name}
        webRtcUrl={camera.webRtcUrl}
        hlsUrl={camera.hlsUrl}
        onClose={() => setLocation("/integrations/cameras")}
        className="h-full"
      />
    </div>
  );
}
