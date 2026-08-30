import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { MapView } from "@/components/Map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Radio,
  History,
} from "lucide-react";

const SIGNAL_TYPES = ["CELLULAR", "WIFI", "BLUETOOTH", "OTHER_RF"];

interface SensorFormData {
  name: string;
  sensorType: string;
  latitude: string;
  longitude: string;
  locationName: string;
}

function emptySensorForm(): SensorFormData {
  return {
    name: "",
    sensorType: "CELLULAR",
    latitude: "-31.9535",
    longitude: "115.8642",
    locationName: "",
  };
}

function formatTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleTimeString();
}

export default function IntegrationsSignalPage() {
  const { user: currentUser, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const isAdmin = isAuthenticated && currentUser?.role === "admin";

  const { data: connectors } = trpc.integrations.list.useQuery(undefined, {
    enabled: isAdmin,
  });
  const signalConnectors = (connectors ?? []).filter(
    c => c.connectorType === "SIGNAL"
  );

  const [connectorId, setConnectorId] = useState<string>("");
  useEffect(() => {
    if (!connectorId && signalConnectors.length > 0) {
      setConnectorId(String(signalConnectors[0].id));
    }
  }, [signalConnectors, connectorId]);

  const { data: sensors, isLoading: sensorsLoading } =
    trpc.integrations.signal.sensors.list.useQuery(
      { connectorId: connectorId ? Number(connectorId) : undefined },
      { enabled: isAdmin && !!connectorId }
    );

  const { data: detections, isLoading: detectionsLoading } =
    trpc.integrations.signal.detections.list.useQuery(
      { connectorId: Number(connectorId), status: "ACTIVE" },
      { enabled: isAdmin && !!connectorId, refetchInterval: 4000 }
    );

  const [historyTarget, setHistoryTarget] = useState<string | null>(null);
  const { data: history, isLoading: historyLoading } =
    trpc.integrations.signal.detections.history.useQuery(
      { deviceReference: historyTarget ?? "" },
      { enabled: isAdmin && !!historyTarget, refetchInterval: 4000 }
    );

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<SensorFormData>(emptySensorForm());
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const invalidateSensors = () =>
    utils.integrations.signal.sensors.list.invalidate();

  const createSensor = trpc.integrations.signal.sensors.create.useMutation({
    onSuccess: () => {
      toast.success("Sensor created.");
      setFormOpen(false);
      invalidateSensors();
    },
    onError: e => toast.error(e.message),
  });

  const deleteSensor = trpc.integrations.signal.sensors.delete.useMutation({
    onSuccess: () => {
      toast.success("Sensor deleted.");
      setDeleteTarget(null);
      invalidateSensors();
    },
    onError: e => toast.error(e.message),
  });

  // ── Map: fixed sensor markers ──
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<
    Map<number, google.maps.marker.AdvancedMarkerElement>
  >(new Map());

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sensors) return;
    const seen = new Set<number>();
    for (const sensor of sensors) {
      seen.add(sensor.id);
      if (sensor.latitude == null || sensor.longitude == null) continue;
      const position = { lat: sensor.latitude, lng: sensor.longitude };
      let marker = markersRef.current.get(sensor.id);
      if (!marker) {
        const pin = new google.maps.marker.PinElement({
          background: "#7c3aed",
          borderColor: "#5b21b6",
          glyphColor: "#ffffff",
          glyph: "S",
        });
        marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position,
          title: `${sensor.name} (${sensor.sensorType ?? "sensor"})`,
          content: pin.element,
        });
        markersRef.current.set(sensor.id, marker);
      } else {
        marker.position = position;
      }
    }
    for (const [id, marker] of Array.from(markersRef.current)) {
      if (!seen.has(id)) {
        marker.map = null;
        markersRef.current.delete(id);
      }
    }
  }, [sensors]);

  const sensorName = (sensorId: number) =>
    sensors?.find(s => s.id === sensorId)?.name ?? `Sensor #${sensorId}`;

  const handleCreateSensor = () => {
    if (!form.name.trim() || !connectorId) {
      toast.error("Name and a signal connector are required.");
      return;
    }
    createSensor.mutate({
      connectorId: Number(connectorId),
      name: form.name.trim(),
      sensorType: form.sensorType,
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      locationName: form.locationName.trim() || null,
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
              Signal / Device Detection — Test View
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sensors and simulated detections for testing a signal connector.
              All data here is demonstration data — see the connector's
              configuration for the SignalDemoConnector.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={connectorId} onValueChange={setConnectorId}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Select a signal connector…" />
              </SelectTrigger>
              <SelectContent>
                {signalConnectors.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => setFormOpen(true)} disabled={!connectorId}>
              <Plus className="w-4 h-4 mr-1.5" />
              New Sensor
            </Button>
          </div>
        </div>

        {signalConnectors.length === 0 && (
          <div className="text-center py-4 mb-4 text-sm text-muted-foreground border border-dashed rounded-xl">
            No signal connectors yet — create one on the Integrations page first
            (type "SIGNAL", provider e.g. "SignalDemoConnector", configuration{" "}
            <code>{'{"simulated": true}'}</code> to generate demo detections).
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl overflow-hidden border border-border">
            <MapView
              className="h-[440px]"
              initialCenter={{ lat: -31.9535, lng: 115.8642 }}
              initialZoom={13}
              onMapReady={map => {
                mapRef.current = map;
              }}
            />
          </div>

          <div className="space-y-2 max-h-[440px] overflow-y-auto">
            <Label className="text-xs">
              Sensors {sensorsLoading && "(loading…)"}
            </Label>
            {!sensors || sensors.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground border border-dashed rounded-xl">
                No sensors yet.
              </div>
            ) : (
              sensors.map(s => (
                <div
                  key={s.id}
                  className="border border-border rounded-lg p-2.5 text-sm flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-medium flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span className="truncate">{s.name}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] mt-1">
                      {s.sensorType ?? "OTHER_RF"}
                    </Badge>
                  </div>
                  <button
                    onClick={() => setDeleteTarget({ id: s.id, name: s.name })}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-6">
          <h2 className="text-lg font-medium text-foreground mb-3">
            Active Detections
          </h2>
          {!connectorId ? null : detectionsLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading…
            </div>
          ) : !detections || detections.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-xl">
              No active detections. If this connector is configured with{" "}
              <code>{'{"simulated": true}'}</code> and has at least one sensor,
              detections appear automatically.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {detections.map(d => (
                <div
                  key={d.id}
                  className="border border-border rounded-lg p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-medium">
                      {d.externalDeviceReference}
                    </span>
                    <Badge className="text-[10px] bg-cyan-500/15 text-cyan-400 border-cyan-500/30">
                      SIMULATED
                    </Badge>
                  </div>
                  <div className="text-muted-foreground mt-1.5 space-y-0.5">
                    <div>Sensor: {sensorName(d.sensorId)}</div>
                    <div>Signal: {d.signalType}</div>
                    <div>Confidence: {d.confidence}%</div>
                    <div>Strength: {d.signalStrength} dBm</div>
                    <div>First detected: {formatTime(d.firstDetectedAt)}</div>
                    <div>Last detected: {formatTime(d.lastDetectedAt)}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full"
                    onClick={() => setHistoryTarget(d.externalDeviceReference)}
                  >
                    <History className="w-3.5 h-3.5 mr-1" />
                    History
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* New sensor dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Signal Sensor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Sensor Alpha"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Signal type</Label>
              <Select
                value={form.sensorType}
                onValueChange={v => setForm({ ...form, sensorType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIGNAL_TYPES.map(t => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Latitude</Label>
                <Input
                  value={form.latitude}
                  onChange={e => setForm({ ...form, latitude: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Longitude</Label>
                <Input
                  value={form.longitude}
                  onChange={e =>
                    setForm({ ...form, longitude: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Location name (optional)</Label>
              <Input
                value={form.locationName}
                onChange={e =>
                  setForm({ ...form, locationName: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateSensor}
              disabled={createSensor.isPending}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog
        open={!!historyTarget}
        onOpenChange={open => !open && setHistoryTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Detection History — {historyTarget}</DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading…
            </div>
          ) : !history || history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No history yet.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
              {history.map(h => (
                <div
                  key={h.id}
                  className="text-sm flex items-center justify-between border-b border-border pb-1.5 last:border-0"
                >
                  <span>{sensorName(h.sensorId)}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(h.firstDetectedAt)}
                    {h.status === "LOST" ? "" : " (current)"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={open => !open && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Sensor</DialogTitle>
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
              disabled={deleteSensor.isPending}
              onClick={() =>
                deleteTarget && deleteSensor.mutate({ id: deleteTarget.id })
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
