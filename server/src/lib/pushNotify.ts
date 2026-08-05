import { prisma } from "../config/prisma";

// Plain HTTPS call to Expo's push API — no SDK needed, Expo push tokens don't require a server
// access token for basic sends (see https://docs.expo.dev/push-notifications/sending-notifications/).
const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// Mirrors notify.ts's in-app Notification row — called with the same recipient list so push
// mirrors the in-app feed rather than being a separately-triggered channel. Best-effort: a failed
// or unreachable Expo push service should never break the caller's in-app/email notification flow.
export async function sendPushToUsers(userIds: number[], payload: PushPayload) {
  if (userIds.length === 0) return;

  const tokens = await prisma.pushToken.findMany({ where: { userId: { in: userIds } }, select: { id: true, token: true } });
  if (tokens.length === 0) return;

  const messages = tokens.map((t) => ({ to: t.token, title: payload.title, body: payload.body, data: payload.data ?? {}, sound: "default" }));

  type ExpoPushResponse = { data?: { status: string; details?: { error?: string } }[] };
  let responseBody: ExpoPushResponse | null = null;
  try {
    const res = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });
    responseBody = (await res.json()) as ExpoPushResponse;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Expo push send failed:", err);
    return;
  }

  // A per-message "DeviceNotRegistered" error means the app was uninstalled or the token expired
  // — prune it so future sends don't keep paying the round trip for a dead token.
  const staleTokenIds: number[] = [];
  responseBody?.data?.forEach((result, i) => {
    if (result.status === "error" && result.details?.error === "DeviceNotRegistered") {
      staleTokenIds.push(tokens[i].id);
    }
  });
  if (staleTokenIds.length > 0) {
    await prisma.pushToken.deleteMany({ where: { id: { in: staleTokenIds } } });
  }
}
