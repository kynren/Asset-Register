import { Cam } from "onvif";
import { prisma } from "../config/prisma";

interface Watcher {
  cam: Cam;
  cameraId: number;
  status: "connecting" | "watching" | "error";
  error: string | null;
  eventsSeen: number;
}

const watchers = new Map<number, Watcher>();

const MOTION_TOPIC_PATTERN = /motion|cellmotiondetector|linedetector|tamper/i;

async function notifyEligibleUsers(message: string, linkUrl: string) {
  const eligibleRoles = await prisma.rolePermission.findMany({ where: { module: "nvr", canEdit: true }, select: { roleId: true } });
  const roleIds = eligibleRoles.map((r) => r.roleId);
  if (roleIds.length === 0) return;

  const users = await prisma.user.findMany({ where: { roleId: { in: roleIds }, isActive: true }, select: { id: true } });
  await prisma.notification.createMany({ data: users.map((u) => ({ userId: u.id, type: "camera_motion", message, linkUrl })) });
}

/**
 * Subscribes to a camera's real ONVIF PullPoint event stream and keeps the subscription alive
 * (the onvif library renews it automatically on each pull). Motion/tamper/line-crossing
 * notification topics create a real CameraEvent row and a real Notification — cameras that
 * never send an event (no hardware, or a non-ONVIF-compliant device) simply never fire one,
 * rather than this generating synthetic motion alerts.
 */
export async function startMotionWatch(cameraId: number, options: { hostname: string; port?: number; username?: string; password?: string }): Promise<{ status: string; message: string }> {
  if (watchers.has(cameraId)) {
    return { status: watchers.get(cameraId)!.status, message: "Motion watch is already active for this camera." };
  }

  return new Promise((resolve) => {
    const cam = new Cam({ ...options, timeout: 5000 }, (err) => {
      if (err) {
        resolve({ status: "error", message: `Could not connect via ONVIF: ${err.message}` });
        return;
      }

      const watcher: Watcher = { cam, cameraId, status: "watching", error: null, eventsSeen: 0 };
      watchers.set(cameraId, watcher);

      cam.on("event", (message: { topic?: { _: string }; message?: { data?: unknown } }) => {
        const topic = message.topic?._ ?? "";
        if (!MOTION_TOPIC_PATTERN.test(topic)) return;

        watcher.eventsSeen += 1;
        prisma.camera
          .findUnique({ where: { id: cameraId } })
          .then(async (camera) => {
            if (!camera) return;
            const eventMessage = `Motion event on ${camera.name} (topic: ${topic})`;
            await prisma.cameraEvent.create({ data: { cameraId, nvrId: camera.nvrId, type: "MOTION", message: eventMessage } });
            await notifyEligibleUsers(eventMessage, `/nvr`);
          })
          .catch(() => undefined);
      });

      cam.on("eventsError", (error: Error) => {
        watcher.status = "error";
        watcher.error = error.message;
      });

      resolve({ status: "watching", message: "Subscribed to real ONVIF motion/tamper events for this camera." });
    });
  });
}

export function getMotionWatchStatus(cameraId: number): { status: string; error: string | null; eventsSeen: number } | null {
  const watcher = watchers.get(cameraId);
  if (!watcher) return null;
  return { status: watcher.status, error: watcher.error, eventsSeen: watcher.eventsSeen };
}

export function stopMotionWatch(cameraId: number): boolean {
  const watcher = watchers.get(cameraId);
  if (!watcher) return false;
  watcher.cam.removeAllListeners("event");
  watcher.cam.removeAllListeners("eventsError");
  watchers.delete(cameraId);
  return true;
}
