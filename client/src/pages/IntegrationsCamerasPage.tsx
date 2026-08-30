import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { LiveCameraFloatingWindow } from "@/components/LiveCameraFloatingWindow";
import { LiveCameraDockPanel } from "@/components/LiveCameraDockPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus,
  Camera as CameraIcon,
  ShieldAlert,
  Loader2,
  Trash2,
  Pencil,
  PlugZap,
  Expand,
  PictureInPicture,
  PanelRight,
} from "lucide-react";

interface CameraFormData {
  name: string;
  manufacturer: string;
  model: string;
  locationName: string;
  mediaPath: string;
  webRtcUrl: string;
  hlsUrl: string;
  rtspUrl: string;
  rtspUsername: string;
  rtspPassword: string;
}

function emptyForm(): CameraFormData {
  return {
    name: "",
    manufacturer: "",
    model: "",
    locationName: "",
    mediaPath: "",
    webRtcUrl: "",
    hlsUrl: "",
    rtspUrl: "",
    rtspUsername: "",
    rtspPassword: "",
  };
}

const STATUS_COLORS: Record<string, string> = {
  ONLINE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  OFFLINE: "bg-red-500/15 text-red-400 border-red-500/30",
  UNKNOWN: "bg-muted text-muted-foreground border-border",
};

export default function IntegrationsCamerasPage() {
  const [, setLocation] = useLocation();
  const { user: currentUser, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const isAdmin = isAuthenticated && currentUser?.role === "admin";

  const { data: connectors } = trpc.integrations.list.useQuery(undefined, {
    enabled: isAdmin,
  });
  const cameraConnectors = (connectors ?? []).filter(
    c => c.connectorType === "CAMERA"
  );

  const [connectorId, setConnectorId] = useState<string>("");
  const { data: cameras, isLoading } = trpc.integrations.cameras.list.useQuery(
    { connectorId: connectorId ? Number(connectorId) : undefined },
    { enabled: isAdmin }
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CameraFormData>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const [floatingIds, setFloatingIds] = useState<number[]>([]);
  const [dockedId, setDockedId] = useState<number | null>(null);

  const invalidate = () => utils.integrations.cameras.list.invalidate();

  const createCamera = trpc.integrations.cameras.create.useMutation({
    onSuccess: () => {
      toast.success("Camera created.");
      setFormOpen(false);
      invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const updateCamera = trpc.integrations.cameras.update.useMutation({
    onSuccess: () => {
      toast.success("Camera updated.");
      setFormOpen(false);
      invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const testConnection = trpc.integrations.cameras.testConnection.useMutation({
    onSuccess: () => {
      toast.success("Connection test recorded.");
      invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const deleteCamera = trpc.integrations.cameras.delete.useMutation({
    onSuccess: () => {
      toast.success("Camera deleted.");
      setDeleteTarget(null);
      invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (c: NonNullable<typeof cameras>[number]) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      manufacturer: c.manufacturer ?? "",
      model: c.model ?? "",
      locationName: c.locationName ?? "",
      mediaPath: c.mediaPath ?? "",
      webRtcUrl: c.webRtcUrl ?? "",
      hlsUrl: c.hlsUrl ?? "",
      rtspUrl: "",
      rtspUsername: "",
      rtspPassword: "",
    });
    setFormOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim() || !connectorId) {
      toast.error("Name and a camera connector are required.");
      return;
    }
    const rtspCredentials =
      form.rtspUrl || form.rtspUsername || form.rtspPassword
        ? {
            url: form.rtspUrl || undefined,
            username: form.rtspUsername || undefined,
            password: form.rtspPassword || undefined,
          }
        : undefined;
    const payload = {
      connectorId: Number(connectorId),
      name: form.name.trim(),
      manufacturer: form.manufacturer.trim() || null,
      model: form.model.trim() || null,
      locationName: form.locationName.trim() || null,
      mediaPath: form.mediaPath.trim() || null,
      webRtcUrl: form.webRtcUrl.trim() || null,
      hlsUrl: form.hlsUrl.trim() || null,
      rtspCredentials,
    };
    if (editingId) {
      updateCamera.mutate({ id: editingId, ...payload });
    } else {
      createCamera.mutate(payload);
    }
  };

  if (!isAuthenticated) return null;

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="p-6 flex flex-col items-center justify-center min-h-[60vh]">
          <div className="p-4 rounded-2xl bg-destructive/10 mb-4">
            <ShieldAlert className="w-8 h-8 text-destructive" />
          </div>
          <p className="text-foreground font-medium">Access Denied</p>
          <p className="text-muted-foreground text-sm mt-1">
            Admin role required.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const dockedCamera = cameras?.find(c => c.id === dockedId);

  return (
    <DashboardLayout>
      <div className="relative p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              Cameras — Test View
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              No live camera or MediaMTX instance exists to verify against in
              this build — the viewer will show "Unable to connect" until a real
              WebRTC (WHEP) URL is configured and reachable.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={connectorId} onValueChange={setConnectorId}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="All camera connectors" />
              </SelectTrigger>
              <SelectContent>
                {cameraConnectors.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={openCreate}
              disabled={cameraConnectors.length === 0}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              New Camera
            </Button>
          </div>
        </div>

        {cameraConnectors.length === 0 && (
          <div className="text-center py-4 mb-4 text-sm text-muted-foreground border border-dashed rounded-xl">
            No camera connectors yet — create one on the Integrations page first
            (type "CAMERA", provider e.g. "MediaMTX").
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading cameras…
          </div>
        ) : !cameras || cameras.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed rounded-xl">
            No cameras yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cameras.map(c => (
              <Card key={c.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <CameraIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <CardTitle className="text-base truncate">
                        {c.name}
                      </CardTitle>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-xs ${STATUS_COLORS[c.status]}`}
                    >
                      {c.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                  {(c.manufacturer || c.model) && (
                    <div>
                      {c.manufacturer} {c.model}
                    </div>
                  )}
                  {c.locationName && <div>{c.locationName}</div>}
                  {c.mediaPath && (
                    <div className="font-mono text-xs">{c.mediaPath}</div>
                  )}
                </CardContent>
                <CardFooter className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setLocation(`/integrations/cameras/${c.id}/view`)
                    }
                  >
                    <Expand className="w-3.5 h-3.5 mr-1" />
                    Full Page
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setFloatingIds(ids =>
                        ids.includes(c.id) ? ids : [...ids, c.id]
                      )
                    }
                  >
                    <PictureInPicture className="w-3.5 h-3.5 mr-1" />
                    Float
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDockedId(c.id)}
                  >
                    <PanelRight className="w-3.5 h-3.5 mr-1" />
                    Dock
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(c)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={testConnection.isPending}
                    onClick={() => testConnection.mutate({ id: c.id })}
                  >
                    <PlugZap className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive ml-auto"
                    onClick={() => setDeleteTarget({ id: c.id, name: c.name })}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {dockedCamera && (
          <LiveCameraDockPanel
            name={dockedCamera.name}
            webRtcUrl={dockedCamera.webRtcUrl}
            hlsUrl={dockedCamera.hlsUrl}
            onClose={() => setDockedId(null)}
          />
        )}
      </div>

      {floatingIds.map((id, i) => {
        const cam = cameras?.find(c => c.id === id);
        if (!cam) return null;
        return (
          <LiveCameraFloatingWindow
            key={id}
            name={cam.name}
            webRtcUrl={cam.webRtcUrl}
            hlsUrl={cam.hlsUrl}
            stackIndex={i}
            onClose={() => setFloatingIds(ids => ids.filter(fid => fid !== id))}
          />
        );
      })}

      {/* Create / edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Configure Camera" : "New Camera"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Front Window"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Manufacturer</Label>
                <Input
                  value={form.manufacturer}
                  onChange={e =>
                    setForm({ ...form, manufacturer: e.target.value })
                  }
                  placeholder="Eufy"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Model</Label>
                <Input
                  value={form.model}
                  onChange={e => setForm({ ...form, model: e.target.value })}
                  placeholder="E220"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input
                value={form.locationName}
                onChange={e =>
                  setForm({ ...form, locationName: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>MediaMTX path</Label>
              <Input
                value={form.mediaPath}
                onChange={e => setForm({ ...form, mediaPath: e.target.value })}
                placeholder="e.g. front-window"
              />
            </div>
            <div className="space-y-1.5">
              <Label>WebRTC (WHEP) URL</Label>
              <Input
                value={form.webRtcUrl}
                onChange={e => setForm({ ...form, webRtcUrl: e.target.value })}
                placeholder="https://mediamtx.example/front-window/whep"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label>HLS URL (fallback — not yet playable)</Label>
              <Input
                value={form.hlsUrl}
                onChange={e => setForm({ ...form, hlsUrl: e.target.value })}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5 border-t border-border pt-3">
              <Label>RTSP source (optional, encrypted at rest)</Label>
              <Input
                value={form.rtspUrl}
                onChange={e => setForm({ ...form, rtspUrl: e.target.value })}
                placeholder="rtsp://camera-ip:554/stream"
                className="font-mono text-xs"
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  value={form.rtspUsername}
                  onChange={e =>
                    setForm({ ...form, rtspUsername: e.target.value })
                  }
                  placeholder="Username"
                />
                <Input
                  type="password"
                  value={form.rtspPassword}
                  onChange={e =>
                    setForm({ ...form, rtspPassword: e.target.value })
                  }
                  placeholder={
                    editingId ? "Leave blank to keep existing" : "Password"
                  }
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Never sent back to the browser once saved.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createCamera.isPending || updateCamera.isPending}
            >
              {editingId ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={open => !open && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Camera</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete "{deleteTarget?.name}"? It will be removed from this list
            immediately.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteCamera.isPending}
              onClick={() =>
                deleteTarget && deleteCamera.mutate({ id: deleteTarget.id })
              }
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
