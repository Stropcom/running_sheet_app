import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import DashboardLayout from "@/components/DashboardLayout";
import { FileText, Plus, Trash2, ChevronRight, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { format } from "date-fns";

export default function Home() {
  const { user, isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const utils = trpc.useUtils();
  const { data: sheets, isLoading } = trpc.sheet.list.useQuery(undefined, { enabled: isAuthenticated });

  const createSheet = trpc.sheet.create.useMutation({
    onSuccess: (data) => {
      utils.sheet.list.invalidate();
      setCreateOpen(false);
      setTitle("");
      setDescription("");
      toast.success("Running sheet created");
      navigate(`/sheet/${data.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteSheet = trpc.sheet.delete.useMutation({
    onSuccess: () => { utils.sheet.list.invalidate(); toast.success("Sheet deleted"); },
    onError: (e) => toast.error(e.message),
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <ShieldCheck className="w-10 h-10 text-primary animate-pulse" />
          <p className="text-muted-foreground text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6 max-w-sm text-center px-4">
          <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
            <ShieldCheck className="w-12 h-12 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground mb-2">Secure Running Sheet</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              A protected log management system with multi-member certification and full audit trail.
            </p>
          </div>
          <Button asChild size="lg" className="w-full">
            <a href={getLoginUrl()}>Sign in to continue</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Running Sheets</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage and certify your protected log documents
            </p>
          </div>
          {(user?.role === "admin" || user?.role === "certifier") && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  New Sheet
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Create Running Sheet</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4 mt-2">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Title</label>
                    <Input
                      placeholder="e.g. Operations Log — June 2026"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
                    <Textarea
                      placeholder="Brief description of this running sheet…"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <Button
                    onClick={() => createSheet.mutate({ title, description })}
                    disabled={!title.trim() || createSheet.isPending}
                    className="w-full"
                  >
                    {createSheet.isPending ? "Creating…" : "Create Sheet"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Sheets list */}
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : !sheets || sheets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-4 rounded-2xl bg-muted/50 mb-4">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-foreground font-medium mb-1">No running sheets yet</p>
            <p className="text-muted-foreground text-sm">
              {user?.role === "observer"
                ? "No sheets have been created yet."
                : "Create your first running sheet to get started."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sheets.map((sheet, i) => (
              <Card
                key={sheet.id}
                className="stagger-item group cursor-pointer hover:border-primary/40 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5"
                onClick={() => navigate(`/sheet/${sheet.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                        <FileText className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base font-semibold truncate">{sheet.title}</CardTitle>
                        {sheet.description && (
                          <CardDescription className="text-xs mt-0.5 truncate">{sheet.description}</CardDescription>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {user?.role === "admin" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-8 h-8 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("Delete this sheet and all its data?")) {
                              deleteSheet.mutate({ id: sheet.id });
                            }
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground">
                    Created {format(new Date(sheet.createdAt), "MMM d, yyyy 'at' HH:mm")}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
