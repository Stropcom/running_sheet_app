/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

// Workbox injects the precache manifest into this variable at build time
declare const __WB_MANIFEST: Array<{ url: string; revision: string | null }>;

precacheAndRoute(__WB_MANIFEST);
cleanupOutdatedCaches();

// ── Push notification handler ─────────────────────────────────────────────────
self.addEventListener("push", (event: PushEvent) => {
  let data: { title?: string; body?: string; url?: string; icon?: string } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: "RunLog", body: event.data?.text() ?? "" };
  }

  const title = data.title ?? "RunLog";
  const options: NotificationOptions = {
    body: data.body ?? "",
    icon: data.icon ?? "/manus-storage/icon-192_73e1648c.png",
    badge: "/manus-storage/icon-192_73e1648c.png",
    data: { url: data.url ?? "/" },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click handler ────────────────────────────────────────────────
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data?.url as string) ?? "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // If a window is already open, focus it and navigate
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) {
              (client as WindowClient).navigate(url);
            }
            return;
          }
        }
        // Otherwise open a new window
        return self.clients.openWindow(url);
      })
  );
});

// Skip waiting so updates activate immediately
self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
