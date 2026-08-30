import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  Camera,
  MapPin,
  Radio,
  Cpu,
  Video,
  Boxes,
  ShieldAlert,
  Loader2,
  Pencil,
  Trash2,
  PlugZap,
  ScrollText,
  MapPinned,
} from "lucide-react";

type ConnectorType = "CAMERA" | "GPS" | "SIGNAL" | "SENSOR" | "VMS" | "OTHER";
type ConnectionStatus =
  | "CONNECTED"
  | "DISCONNECTED"
  | "CONNECTING"
  | "ERROR"
  | "DISABLED";
type HealthStatus = "HEALTHY" | "DEGRADED" | "OFFLINE" | "UNKNOWN";

const TYPE_ICONS: Record<ConnectorType, React.ReactNode> = {
  CAMERA: <Camera className="w-4 h-4" />,
  GPS: <MapPin className="w-4 h-4" />,
  SIGNAL: <Radio className="w-4 h-4" />,
  SENSOR: <Cpu className="w-4 h-4" />,
  VMS: <Video className="w-4 h-4" />,
  OTHER: <Boxes className="w-4 h-4" />,
};

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  CONNECTED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  DISCONNECTED: "bg-muted text-muted-foreground border-border",
  CONNECTING: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  ERROR: "bg-red-500/15 text-red-400 border-red-500/30",
  DISABLED: "bg-muted text-muted-foreground border-border",
};

const HEALTH_COLORS: Record<HealthStatus, string> = {
  HEALTHY: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  DEGRADED: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  OFFLINE: "bg-red-500/15 text-red-400 border-red-500/30",
  UNKNOWN: "bg-muted text-muted-foreground border-border",
};

const CONNECTOR_TYPES: ConnectorType[] = [
  "CAMERA",
  "GPS",
  "SIGNAL",
  "SENSOR",
  "VMS",
  "OTHER",
];

interface ConnectorFormData {
  name: string;
  connectorType: ConnectorType;
  provider: string;
  description: string;
  operationId: string; // "" = unassigned
  configurationJson: string;
  credentialsJson: string;
}

function emptyForm(): ConnectorFormData {
  return {
    name: "",
    connectorType: "CAMERA",
    provider: "",
    description: "",
    operationId: "",
    configurationJson: "",
    credentialsJson: "",
  };
}

function formatTimestamp(ms: number | null | undefined): string {
  if (!ms) return "Never";
  return new Date(ms).toLocaleString();
}

export default function IntegrationsConnectorsPage() {
  const [, setLocation] = useLocation();
  const { user: currentUser, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const isAdmin = isAuthenticated && currentUser?.role === "admin";

  const { data: connectors, isLoading } = trpc.integrations.list.useQuery(
    undefined,
    { enabled: isAdmin }
  );
  const { data: operations } = trpc.operation.list.useQuery(undefined, {
    enabled: isAdmin,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ConnectorFormData>(emptyForm());
  const [logsTarget, setLogsTarget] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const invalidate = () => utils.integrations.list.invalidate();

  const createConnector = trpc.integrations.create.useMutation({
    onSuccess: () => {
      toast.success("Connector created.");
      setFormOpen(false);
      invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const updateConnector = trpc.integrations.update.useMutation({
    onSuccess: () => {
      toast.success("Connector updated.");
      setFormOpen(false);
      invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const setEnabled = trpc.integrations.setEnabled.useMutation({
    onSuccess: () => invalidate(),
    onError: e => toast.error(e.message),
  });

  const testConnection = trpc.integrations.testConnection.useMutation({
    onSuccess: () => {
      toast.success("Connection test recorded.");
      invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const deleteConnector = trpc.integrations.delete.useMutation({
    onSuccess: () => {
      toast.success("Connector deleted.");
      setDeleteTarget(null);
      invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const { data: auditLog, isLoading: logsLoading } =
    trpc.integrations.auditLog.useQuery(
      { connectorId: logsTarget?.id ?? 0 },
      { enabled: !!logsTarget }
    );

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (c: NonNullable<typeof connectors>[number]) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      connectorType: c.connectorType as ConnectorType,
      provider: c.provider,
      description: c.description ?? "",
      operationId: c.operationId ? String(c.operationId) : "",
      configurationJson: Object.keys(c.configuration ?? {}).length
        ? JSON.stringify(c.configuration, null, 2)
        : "",
      // Never pre-filled — credentials are never returned to the browser.
      // Leaving this blank on save means "leave credentials unchanged".
      credentialsJson: "",
    });
    setFormOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim() || !form.provider.trim()) {
      toast.error("Name and provider are required.");
      return;
    }
    let configuration: Record<string, unknown> | undefined;
    if (form.configurationJson.trim()) {
      try {
        configuration = JSON.parse(form.configurationJson);
      } catch {
        toast.error("Configuration must be valid JSON.");
        return;
      }
    }
    let credentials: Record<string, unknown> | null | undefined = undefined;
    if (form.credentialsJson.trim()) {
      try {
        credentials = JSON.parse(form.credentialsJson);
      } catch {
        toast.error("Credentials must be valid JSON.");
        return;
      }
    }
    const payload = {
      name: form.name.trim(),
      connectorType: form.connectorType,
      provider: form.provider.trim(),
      description: form.description.trim() || null,
      operationId: form.operationId ? Number(form.operationId) : null,
      configuration,
      credentials,
    };
    if (editingId) {
      updateConnector.mutate({ id: editingId, ...payload });
    } else {
      createConnector.mutate(payload);
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

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              External Integrations
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Connectors for external camera, GPS, and signal-detection systems.
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Connector
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading connectors…
          </div>
        ) : !connectors || connectors.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed rounded-xl">
            No connectors yet. Add one to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {connectors.map(c => {
              const operationName = c.operationId
                ? (operations?.find(o => o.id === c.operationId)?.name ??
                  `Operation #${c.operationId}`)
                : "Unassigned";
              return (
                <Card key={c.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-muted-foreground shrink-0">
                          {TYPE_ICONS[c.connectorType as ConnectorType]}
                        </span>
                        <CardTitle className="text-base truncate">
                          {c.name}
                        </CardTitle>
                      </div>
                      <Switch
                        checked={c.enabled}
                        onCheckedChange={enabled =>
                          setEnabled.mutate({ id: c.id, enabled })
                        }
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {c.connectorType}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-xs ${STATUS_COLORS[c.connectionStatus as ConnectionStatus]}`}
                      >
                        {c.connectionStatus}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-xs ${HEALTH_COLORS[c.healthStatus as HealthStatus]}`}
                      >
                        {c.healthStatus}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-1.5 text-sm">
                    <div className="text-muted-foreground">
                      Provider:{" "}
                      <span className="text-foreground">{c.provider}</span>
                    </div>
                    <div className="text-muted-foreground">
                      Operation:{" "}
                      <span className="text-foreground">{operationName}</span>
                    </div>
                    <div className="text-muted-foreground">
                      Last connected:{" "}
                      <span className="text-foreground">
                        {formatTimestamp(c.lastConnectedAt)}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      Last data received:{" "}
                      <span className="text-foreground">
                        {formatTimestamp(c.lastDataReceivedAt)}
                      </span>
                    </div>
                    {c.description && (
                      <p className="text-muted-foreground pt-1 line-clamp-2">
                        {c.description}
                      </p>
                    )}
                  </CardContent>
                  <CardFooter className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(c)}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1" />
                      Configure
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={testConnection.isPending}
                      onClick={() => testConnection.mutate({ id: c.id })}
                    >
                      <PlugZap className="w-3.5 h-3.5 mr-1" />
                      Test
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setLogsTarget({ id: c.id, name: c.name })}
                    >
                      <ScrollText className="w-3.5 h-3.5 mr-1" />
                      Logs
                    </Button>
                    {c.connectorType === "GPS" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLocation("/integrations/gps")}
                      >
                        <MapPinned className="w-3.5 h-3.5 mr-1" />
                        Tracked Assets
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive ml-auto"
                      onClick={() =>
                        setDeleteTarget({ id: c.id, name: c.name })
                      }
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Configure Connector" : "New Connector"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Front Window Camera"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={form.connectorType}
                  onValueChange={v =>
                    setForm({ ...form, connectorType: v as ConnectorType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONNECTOR_TYPES.map(t => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Provider</Label>
                <Input
                  value={form.provider}
                  onChange={e => setForm({ ...form, provider: e.target.value })}
                  placeholder="e.g. MediaMTX"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={e =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Assigned operation</Label>
              <Select
                value={form.operationId || "none"}
                onValueChange={v =>
                  setForm({
                    ...form,
                    operationId: v === "none" ? "" : v,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {operations?.map(o => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Configuration (JSON)</Label>
              <Textarea
                value={form.configurationJson}
                onChange={e =>
                  setForm({ ...form, configurationJson: e.target.value })
                }
                placeholder={'{\n  "url": "..."\n}'}
                rows={3}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Provider-specific, non-secret settings. Later phases add
                structured fields per connector type.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Credentials (JSON)</Label>
              <Textarea
                value={form.credentialsJson}
                onChange={e =>
                  setForm({ ...form, credentialsJson: e.target.value })
                }
                placeholder={
                  editingId
                    ? "Leave blank to keep existing credentials"
                    : '{\n  "apiKey": "..."\n}'
                }
                rows={3}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Encrypted at rest and never sent back to the browser.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createConnector.isPending || updateConnector.isPending}
            >
              {editingId ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logs dialog */}
      <Dialog
        open={!!logsTarget}
        onOpenChange={open => !open && setLogsTarget(null)}
      >
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Logs — {logsTarget?.name}</DialogTitle>
          </DialogHeader>
          {logsLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading…
            </div>
          ) : !auditLog || auditLog.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No activity recorded yet.
            </p>
          ) : (
            <div className="space-y-2">
              {auditLog.map(entry => (
                <div
                  key={entry.id}
                  className="text-sm border-b border-border pb-2 last:border-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {entry.action}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {entry.detail && (
                    <p className="text-muted-foreground text-xs mt-0.5">
                      {entry.detail}
                    </p>
                  )}
                  {entry.userCIN && (
                    <p className="text-muted-foreground text-xs">
                      by {entry.userCIN}
                    </p>
                  )}
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
            <DialogTitle>Delete Connector</DialogTitle>
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
              disabled={deleteConnector.isPending}
              onClick={() =>
                deleteTarget && deleteConnector.mutate({ id: deleteTarget.id })
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
