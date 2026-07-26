import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Users, Car, User, MapPin, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Category = "target" | "vehicle" | "associate" | "location";

const CATEGORY_TABS: { key: Category; label: string; icon: typeof Users }[] = [
  { key: "target", label: "Targets", icon: Users },
  { key: "vehicle", label: "Vehicles", icon: Car },
  { key: "associate", label: "Associates", icon: User },
  { key: "location", label: "Locations", icon: MapPin },
];

const CATEGORY_ICON: Record<Category, typeof Users> = {
  target: Users,
  vehicle: Car,
  associate: User,
  location: MapPin,
};

function categoryForEntity(e: { type: string; isTarget?: boolean }): Category {
  if (e.isTarget) return "target";
  if (e.type === "vehicle") return "vehicle";
  if (e.type === "address" || e.type === "business") return "location";
  return "associate";
}

export function LinkAttachmentDialog({
  attachmentId,
  open,
  onOpenChange,
}: {
  attachmentId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState<Category>("target");
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();

  const { data: entities, isLoading } = trpc.intelligence.getEntities.useQuery(undefined, {
    enabled: open,
  });

  const { data: currentLinks } = trpc.attachment.linksFor.useQuery(
    { attachmentId },
    { enabled: open }
  );

  const invalidateLinkViews = () => {
    utils.attachment.linksFor.invalidate({ attachmentId });
    utils.attachment.entityLinkCounts.invalidate();
    // Refresh every place a linked/unlinked badge is shown for this photo
    utils.attachment.listBySheet.invalidate();
    utils.attachment.listByOperation.invalidate();
    utils.row.list.invalidate();
    utils.export.sheetData.invalidate();
  };

  const linkToEntity = trpc.attachment.linkToEntity.useMutation({
    onSuccess: () => {
      toast.success("Photo linked");
      invalidateLinkViews();
    },
    onError: e => toast.error(e.message),
  });

  const unlinkFromEntity = trpc.attachment.unlinkFromEntity.useMutation({
    onSuccess: () => {
      toast.success("Photo unlinked");
      invalidateLinkViews();
    },
    onError: e => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    if (!entities) return [];
    const q = search.trim().toLowerCase();
    return (entities as any[])
      .filter(e => categoryForEntity(e) === tab)
      .filter(e => !q || e.shortForm.toLowerCase().includes(q));
  }, [entities, tab, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link photo to entity</DialogTitle>
        </DialogHeader>

        {currentLinks && currentLinks.length > 0 && (
          <div className="flex flex-col gap-1.5 pb-2 border-b border-border">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Currently linked</p>
            <div className="flex flex-wrap gap-1.5">
              {currentLinks.map((link: any) => {
                const Icon = CATEGORY_ICON[link.category as Category] ?? Users;
                return (
                  <span
                    key={link.id}
                    className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 text-xs font-medium"
                  >
                    <Icon className="h-3 w-3 shrink-0" />
                    <span className="truncate max-w-[160px]">{link.entityLabel}</span>
                    <button
                      onClick={() => unlinkFromEntity.mutate({ linkId: link.id })}
                      disabled={unlinkFromEntity.isPending}
                      title="Unlink"
                      className="h-4 w-4 rounded-full flex items-center justify-center hover:bg-emerald-600/20 transition-colors"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {currentLinks && currentLinks.length > 0 ? "Link to another" : "Link to"}
        </p>

        <div className="flex gap-1 border-b border-border pb-2">
          {CATEGORY_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === t.key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="pl-8 h-9 text-sm"
          />
        </div>

        <div className="max-h-72 overflow-y-auto flex flex-col gap-1">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No matches</p>
          ) : (
            filtered.map((e, idx) => (
              <button
                key={`${e.shortForm}-${idx}`}
                disabled={linkToEntity.isPending}
                onClick={() =>
                  linkToEntity.mutate({
                    attachmentId,
                    category: tab,
                    targetId: e.targetId,
                    entityLabel: e.shortForm,
                  })
                }
                className="text-left px-3 py-2 rounded-lg text-sm hover:bg-accent/50 transition-colors truncate"
              >
                {e.shortForm}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
