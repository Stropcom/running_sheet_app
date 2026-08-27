import { useState } from "react";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck, X, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useFaceMatchNotification } from "@/contexts/FaceMatchNotificationContext";

// General-purpose in-app notification inbox (see notifications router /
// drizzle schema comment) — reliable regardless of browser push
// subscription state, which depends on OS permissions and is broken
// outright on iOS Safari unless installed as a home-screen PWA.
export function NotificationBell({
  className = "hover:bg-accent",
  iconClassName = "h-5 w-5 text-muted-foreground",
}: {
  className?: string;
  iconClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { openNotification } = useFaceMatchNotification();

  const { data: unread } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const { data: list } = trpc.notifications.list.useQuery(undefined, {
    enabled: open,
  });

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });
  const deleteOne = trpc.notifications.delete.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });
  const clearRead = trpc.notifications.clearRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
    },
  });

  const unreadCount = unread?.count ?? 0;
  const hasRead = (list ?? []).some(n => !!n.readAt);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "relative h-9 w-9 flex items-center justify-center rounded-lg transition-colors",
            className
          )}
          aria-label="Notifications"
        >
          <Bell className={iconClassName} />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border gap-1">
          <span className="text-sm font-semibold">Notifications</span>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs px-2"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </Button>
            )}
            {hasRead && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs px-2 text-muted-foreground"
                onClick={() => clearRead.mutate()}
                disabled={clearRead.isPending}
                title="Delete all read notifications"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear read
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="max-h-80">
          {!list || list.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No notifications yet.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {list.map(n => (
                <div
                  key={n.id}
                  className={`group flex items-start gap-1 px-3 py-2.5 hover:bg-accent/50 transition-colors ${
                    !n.readAt ? "bg-primary/5" : ""
                  }`}
                >
                  <button
                    className="flex-1 min-w-0 text-left flex items-start gap-2"
                    onClick={() => {
                      // Facial Recognition notifications are acknowledged
                      // (not just marked read) via the full-text pop-up on
                      // the running sheet itself — see FaceMatchAckDialog —
                      // since the body text here is line-clamped to 2 lines
                      // and was too little room for the full wording. That
                      // pop-up only opens from an explicit click here (never
                      // just from landing on the sheet some other way), and
                      // re-clicking an already-acknowledged one still
                      // reopens it — see FaceMatchNotificationContext.
                      if (n.sourceModule === "faceRecognition") {
                        openNotification(n.id);
                      } else if (!n.readAt) {
                        markRead.mutate({ id: n.id });
                      }
                      setOpen(false);
                      if (n.url) setLocation(n.url);
                    }}
                  >
                    {!n.readAt && (
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    )}
                    <div className={`min-w-0 ${n.readAt ? "pl-3.5" : ""}`}>
                      <p className="text-sm font-medium truncate">{n.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {n.body}
                      </p>
                      <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                        {formatDistanceToNow(new Date(n.createdAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </button>
                  <button
                    className="shrink-0 h-6 w-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-accent transition-opacity"
                    onClick={() => deleteOne.mutate({ id: n.id })}
                    aria-label="Delete notification"
                    title="Delete"
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
