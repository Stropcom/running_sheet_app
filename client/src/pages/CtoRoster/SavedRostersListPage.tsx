import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen,
  Trash2,
  CalendarDays,
  Clock,
  Pencil,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, isValid } from "date-fns";
import DashboardLayout from "@/components/DashboardLayout";

function safeFormat(
  d: Date | string | null | undefined,
  fmt: string,
  fallback = ""
): string {
  if (!d) return fallback;
  try {
    const dt = typeof d === "string" ? parseISO(d) : d;
    if (!isValid(dt)) return fallback;
    return format(dt, fmt);
  } catch {
    return fallback;
  }
}

export default function SavedRostersListPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const rostersQuery = trpc.ctoRoster.savedRoster.list.useQuery();
  const rosters = rostersQuery.data ?? [];

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameId, setRenameId] = useState<number | null>(null);
  const [renameName, setRenameName] = useState("");

  const deleteMutation = trpc.ctoRoster.savedRoster.delete.useMutation({
    onSuccess: () => {
      toast.success("Roster deleted.");
      utils.ctoRoster.savedRoster.list.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  const renameMutation = trpc.ctoRoster.savedRoster.rename.useMutation({
    onSuccess: () => {
      toast.success("Roster renamed.");
      utils.ctoRoster.savedRoster.list.invalidate();
      setRenameOpen(false);
    },
    onError: err => toast.error(err.message),
  });

  const isAdmin = user?.role === "admin";

  return (
    <DashboardLayout>
      <div className="container max-w-3xl py-6 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-purple-500" />
              Saved Rosters
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Named rosters saved from standalone drafts. Fully editable and
              EA-checkable.
            </p>
          </div>
        </div>

        {/* Roster list */}
        {rostersQuery.isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2].map(i => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : rosters.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
            <BookOpen className="h-12 w-12 opacity-30" />
            <div>
              <div className="font-semibold">No saved rosters yet</div>
              <div className="text-sm">
                Create a standalone draft and use{" "}
                <strong>Save as Roster</strong> to create one.
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {rosters.map(roster => (
              <Card
                key={roster.id}
                className="transition-all hover:shadow-md cursor-pointer"
                onClick={() =>
                  navigate(`/cto-roster/saved-roster/${roster.id}`)
                }
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-base">
                          {roster.name}
                        </span>
                        <Badge className="text-xs bg-purple-100 text-purple-700 border-purple-200">
                          Saved Roster
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {safeFormat(roster.startDate, "d MMM yyyy")} –{" "}
                          {safeFormat(roster.endDate, "d MMM yyyy")}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          Saved {safeFormat(roster.createdAt, "d MMM yyyy")}
                        </span>
                      </div>
                      {roster.createdByName && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          by {roster.createdByName}
                        </div>
                      )}
                    </div>
                    {isAdmin && (
                      <div
                        className="flex items-center gap-1.5 shrink-0"
                        onClick={e => e.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          title="Rename"
                          onClick={e => {
                            e.stopPropagation();
                            setRenameId(roster.id);
                            setRenameName(roster.name);
                            setRenameOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={e => {
                            e.stopPropagation();
                            navigate(
                              `/cto-roster/ea-compliance?scope=saved&id=${roster.id}`
                            );
                          }}
                        >
                          <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                          EA Check
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50"
                          onClick={e => {
                            e.stopPropagation();
                            if (
                              confirm(
                                `Delete roster "${roster.name}"? This cannot be undone.`
                              )
                            ) {
                              deleteMutation.mutate({ id: roster.id });
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Rename dialog */}
        <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Rename Roster</DialogTitle>
            </DialogHeader>
            <div className="py-2">
              <Label>New Name</Label>
              <Input
                className="mt-1.5"
                value={renameName}
                onChange={e => setRenameName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenameOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!renameId || !renameName.trim()) return;
                  renameMutation.mutate({
                    id: renameId,
                    name: renameName.trim(),
                  });
                }}
                disabled={renameMutation.isPending}
              >
                {renameMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
