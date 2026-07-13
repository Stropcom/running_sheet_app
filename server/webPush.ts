import webpush from "web-push";
import { ENV } from "./_core/env";
import { getAllPushSubscriptions, removePushSubscription } from "./db";

let _initialized = false;

function initWebPush() {
  if (_initialized) return;
  if (!ENV.vapidPublicKey || !ENV.vapidPrivateKey) {
    console.warn("[WebPush] VAPID keys not configured — push notifications disabled.");
    return;
  }
  webpush.setVapidDetails(
    "mailto:admin@runlog.com.au",
    ENV.vapidPublicKey,
    ENV.vapidPrivateKey
  );
  _initialized = true;
}

export async function sendPushToUsers(userIds: number[], title: string, body: string, url?: string) {
  initWebPush();
  if (!_initialized) return { sent: 0, failed: 0 };

  const { getPushSubscriptionsByUserId } = await import("./db");
  const allSubs = (await Promise.all(userIds.map((id) => getPushSubscriptionsByUserId(id)))).flat();

  let sent = 0;
  let failed = 0;
  const payload = JSON.stringify({
    title,
    body,
    url: url ?? "/operation-manager",
    icon: "/icons/icon-192.png",
  });

  await Promise.allSettled(
    allSubs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 410 || statusCode === 404) {
          const { removePushSubscription } = await import("./db");
          await removePushSubscription(sub.endpoint).catch(() => {});
        }
        failed++;
      }
    })
  );

  return { sent, failed };
}

export async function sendPushToAll(title: string, body: string, url?: string) {
  initWebPush();
  if (!_initialized) return { sent: 0, failed: 0 };

  const subs = await getAllPushSubscriptions();
  let sent = 0;
  let failed = 0;

  const payload = JSON.stringify({
    title,
    body,
    url: url ?? "/operation-manager",
    icon: "/icons/icon-192.png",
  });

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 410 || statusCode === 404) {
          // Subscription expired — clean up
          await removePushSubscription(sub.endpoint).catch(() => {});
        }
        failed++;
      }
    })
  );

  return { sent, failed };
}
