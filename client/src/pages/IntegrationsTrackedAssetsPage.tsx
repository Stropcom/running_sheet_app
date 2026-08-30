import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { MapView } from "@/components/Map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  ShieldAlert,
  Loader2,
  Trash2,
  MapPin,
  Wand2,
} from "lucide-react";

type AssetType =
  | "VEHICLE"
  | "MEMBER"
  | "DEVICE"
  | "EQUIPMENT"
  | "TARGET"
  | "OTHER";

const ASSET_TYPES: AssetType[] = [
  "VEHICLE",
  "MEMBER",
  "DEVICE",
  "EQUIPMENT",
  "TARGET",
  "OTHER",
];

// A small square loop around Perth CBD, ~700m per side — fast enough to see
// move within a minute or two when testing.
const DEMO_LOOP_WAYPOINTS = [
  { lat: -31.9505, lng: 115.8605 },
  { lat: -31.9505, lng: 115.868 },
  { lat: -31.9565, lng: 115.868 },
  { lat: -31.9565, lng: 115.8605 },
];
const DEMO_LOOP_SECONDS = 120;

const TRACK_TAIL_OPTIONS = [
  { label: "Off", minutes: 0 },
  { label: "Previous 5 minutes", minutes: 5 },
  { label: "Previous 15 minutes", minutes: 15 },
  { label: "Previous 30 minutes", minutes: 30 },
  { label: "Previous 60 minutes", minutes: 60 },
];

interface AssetFormData {
  name: string;
  assetType: AssetType;
  connectorId: string;
  externalDeviceId: string;
  waypointsJson: string;
  loopSeconds: string;
}

function emptyForm(defaultConnectorId?: number): AssetFormData {
  return {
    name: "",
    assetType: "VEHICLE",
    connectorId: defaultConnectorId ? String(defaultConnectorId) : "",
    externalDeviceId: "",
    waypointsJson: "",
    loopSeconds: "",
  };
}

function formatTimestamp(ms: number | null | undefined): string {
  if (!ms) return "Never";
  return new Date(ms).toLocaleTimeString();
}

export default function IntegrationsTrackedAssetsPage() {
  const { user: currentUser, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const isAdmin = isAuthenticated && currentUser?.role === "admin";

  const { data: connectors } = trpc.integrations.list.useQuery(undefined, {
    enabled: isAdmin,
  });
  const gpsConnectors = (connectors ?? []).filter(
    c => c.connectorType === "GPS"
  );

  const [connectorFilter, setConnectorFilter] = useState<string>("all");
  const { data: assets, isLoading } =
    trpc.integrations.trackedAssets.list.useQuery(
      connectorFilter === "all" ? {} : { connectorId: Number(connectorFilter) },
      { enabled: isAdmin, refetchInterval: 4000 }
    );

  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [tailMinutes, setTailMinutes] = useState(0);
  const { data: positions } =
    trpc.integrations.trackedAssets.positions.useQuery(
      {
        trackedAssetId: selectedAssetId ?? 0,
        sinceMs:
          tailMinutes > 0 ? Date.now() - tailMinutes * 60_000 : undefined,
      },
      {
        enabled: isAdmin && !!selectedAssetId && tailMinutes > 0,
        refetchInterval: 4000,
      }
    );

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<AssetFormData>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const invalidate = () => utils.integrations.trackedAssets.list.invalidate();

  const createAsset = trpc.integrations.trackedAssets.create.useMutation({
    onSuccess: () => {
      toast.success("Tracked asset created.");
      setFormOpen(false);
      invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const deleteAsset = trpc.integrations.trackedAssets.delete.useMutation({
    onSuccess: () => {
      toast.success("Tracked asset deleted.");
      setDeleteTarget(null);
      if (selectedAssetId === deleteTarget?.id) setSelectedAssetId(null);
      invalidate();
    },
    onError: e => toast.error(e.message),
  });

  // ── Map ──
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<
    Map<number, google.maps.marker.AdvancedMarkerElement>
  >(new Map());
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !assets) return;
    const seen = new Set<number>();
    for (const asset of assets) {
      seen.add(asset.id);
      if (asset.latitude == null || asset.longitude == null) continue;
      const position = { lat: asset.latitude, lng: asset.longitude };
      let marker = markersRef.current.get(asset.id);
      if (!marker) {
        const isSimulated = asset.simulatedWaypoints.length > 0;
        const pin = new google.maps.marker.PinElement({
          background: isSimulated ? "#0891b2" : "#dc2626",
          borderColor: isSimulated ? "#0e7490" : "#991b1b",
          glyphColor: "#ffffff",
        });
        marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position,
          title: asset.name,
          content: pin.element,
        });
        marker.addListener("click", () => setSelectedAssetId(asset.id));
        markersRef.current.set(asset.id, marker);
      } else {
        marker.position = position;
        marker.title = `${asset.name} — ${asset.onlineStatus}`;
      }
    }
    for (const [id, marker] of Array.from(markersRef.current)) {
      if (!seen.has(id)) {
        marker.map = null;
        markersRef.current.delete(id);
      }
    }
  }, [assets]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!positions || positions.length < 2) {
      polylineRef.current?.setMap(null);
      polylineRef.current = null;
      return;
    }
    const path = positions.map(p => ({ lat: p.latitude, lng: p.longitude }));
    if (!polylineRef.current) {
      polylineRef.current = new google.maps.Polyline({
        map,
        path,
        strokeColor: "#0891b2",
        strokeOpacity: 0.8,
        strokeWeight: 3,
      });
    } else {
      polylineRef.current.setPath(path);
    }
  }, [positions]);

  const openCreate = () => {
    setForm(emptyForm(gpsConnectors[0] ? gpsConnectors[0].id : undefined));
    setFormOpen(true);
  };

  const fillDemoLoop = () => {
    setForm(f => ({
      ...f,
      waypointsJson: JSON.stringify(DEMO_LOOP_WAYPOINTS, null, 2),
      loopSeconds: String(DEMO_LOOP_SECONDS),
    }));
  };

  const handleSubmit = () => {
    if (!form.name.trim() || !form.connectorId) {
      toast.error("Name and a GPS connector are required.");
      return;
    }
    let simulatedWaypoints: { lat: number; lng: number }[] | undefined;
    if (form.waypointsJson.trim()) {
      try {
        simulatedWaypoints = JSON.parse(form.waypointsJson);
      } catch {
        toast.error("Simulated path must be valid JSON.");
        return;
      }
    }
    createAsset.mutate({
      name: form.name.trim(),
      assetType: form.assetType,
      connectorId: Number(form.connectorId),
      externalDeviceId: form.externalDeviceId.trim() || null,
      simulatedWaypoints,
      simulatedLoopSeconds: form.loopSeconds ? Number(form.loopSeconds) : null,
    });
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

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              GPS Tracking — Test Map
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live tracked-asset positions for testing a GPS connector before
              it's trusted. Not the operational map — see the plan for how this
              folds into it later.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={connectorFilter} onValueChange={setConnectorFilter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All GPS connectors</SelectItem>
                {gpsConnectors.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={openCreate} disabled={gpsConnectors.length === 0}>
              <Plus className="w-4 h-4 mr-1.5" />
              New Tracked Asset
            </Button>
          </div>
        </div>

        {gpsConnectors.length === 0 && (
          <div className="text-center py-4 mb-4 text-sm text-muted-foreground border border-dashed rounded-xl">
            No GPS connectors yet — create one on the Integrations page first
            (type "GPS", provider e.g. "RunLog GPS Simulator").
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl overflow-hidden border border-border">
            <MapView
              className="h-[520px]"
              initialCenter={{ lat: -31.9535, lng: 115.8642 }}
              initialZoom={14}
              onMapReady={map => {
                mapRef.current = map;
              }}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs shrink-0">Track tail</Label>
              <Select
                value={String(tailMinutes)}
                onValueChange={v => setTailMinutes(Number(v))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRACK_TAIL_OPTIONS.map(o => (
                    <SelectItem key={o.minutes} value={String(o.minutes)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Loading…
              </div>
            ) : !assets || assets.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-xl">
                No tracked assets yet.
              </div>
            ) : (
              <div className="space-y-2 max-h-[460px] overflow-y-auto">
                {assets.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAssetId(a.id)}
                    className={`w-full text-left border rounded-lg p-3 text-sm transition-colors ${
                      selectedAssetId === a.id
                        ? "border-cyan-500/60 bg-cyan-500/5"
                        : "border-border hover:bg-accent/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium flex items-center gap-1.5 min-w-0">
                        <MapPin className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{a.name}</span>
                      </span>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setDeleteTarget({ id: a.id, name: a.name });
                        }}
                        className="text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        {a.assetType}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {a.onlineStatus}
                      </Badge>
                      {a.simulatedWaypoints.length > 0 && (
                        <Badge className="text-[10px] bg-cyan-500/15 text-cyan-400 border-cyan-500/30">
                          SIMULATED
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Last position: {formatTimestamp(a.lastPositionTime)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Tracked Asset</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Surveillance Vehicle 1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Asset type</Label>
                <Select
                  value={form.assetType}
                  onValueChange={v =>
                    setForm({ ...form, assetType: v as AssetType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSET_TYPES.map(t => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>GPS connector</Label>
                <Select
                  value={form.connectorId}
                  onValueChange={v => setForm({ ...form, connectorId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {gpsConnectors.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>External device ID (optional)</Label>
              <Input
                value={form.externalDeviceId}
                onChange={e =>
                  setForm({ ...form, externalDeviceId: e.target.value })
                }
                placeholder="e.g. this connector's own device identifier"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Simulated path (JSON)</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={fillDemoLoop}
                >
                  <Wand2 className="w-3.5 h-3.5 mr-1" />
                  Generate demo loop
                </Button>
              </div>
              <Textarea
                value={form.waypointsJson}
                onChange={e =>
                  setForm({ ...form, waypointsJson: e.target.value })
                }
                placeholder='[{"lat": -31.95, "lng": 115.86}, ...]'
                rows={4}
                className="font-mono text-xs"
              />
              <div className="flex items-center gap-2">
                <Label className="text-xs shrink-0">Loop duration (sec)</Label>
                <Input
                  type="number"
                  className="h-8 w-28"
                  value={form.loopSeconds}
                  onChange={e =>
                    setForm({ ...form, loopSeconds: e.target.value })
                  }
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Leave blank for a real (non-simulated) asset — a later phase's
                real connector (Traccar, a phone tracker) would report its
                position instead.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createAsset.isPending}>
              Create
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
            <DialogTitle>Delete Tracked Asset</DialogTitle>
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
              disabled={deleteAsset.isPending}
              onClick={() =>
                deleteTarget && deleteAsset.mutate({ id: deleteTarget.id })
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
