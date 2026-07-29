import { Cam } from "onvif";

export interface PtzResult {
  ok: boolean;
  message: string;
}

export interface PtzPreset {
  token: string;
  name: string;
}

type CamOptions = { hostname: string; port?: number; username?: string; password?: string };

function connectCam(options: CamOptions): Promise<Cam> {
  return new Promise((resolve, reject) => {
    const cam = new Cam({ ...options, timeout: 5000 }, (err) => {
      if (err) reject(err);
      else resolve(cam);
    });
  });
}

const MOVE_VECTORS: Record<string, { x: number; y: number; zoom: number }> = {
  UP: { x: 0, y: 0.5, zoom: 0 },
  DOWN: { x: 0, y: -0.5, zoom: 0 },
  LEFT: { x: -0.5, y: 0, zoom: 0 },
  RIGHT: { x: 0.5, y: 0, zoom: 0 },
  ZOOM_IN: { x: 0, y: 0, zoom: 0.5 },
  ZOOM_OUT: { x: 0, y: 0, zoom: -0.5 },
};

/**
 * Sends a real ONVIF PTZ command to the camera. Connects fresh per-command (PTZ operators are
 * infrequent and cameras can drop idle SOAP sessions), issues a bounded ContinuousMove, then
 * stops the movement after a short burst — mirrors how iVMS/Blue Iris "nudge" controls behave.
 * Honestly reports connection/command failure rather than pretending the move happened.
 */
export async function sendPtzCommand(options: CamOptions, command: string): Promise<PtzResult> {
  let cam: Cam;
  try {
    cam = await connectCam(options);
  } catch (err) {
    return { ok: false, message: `Could not connect via ONVIF: ${(err as Error).message}` };
  }

  if (command === "HOME") {
    return new Promise((resolve) => {
      cam.gotoHomePosition({}, (err: Error | null) => {
        resolve(err ? { ok: false, message: `ONVIF home command failed: ${err.message}` } : { ok: true, message: "Moved to home position" });
      });
    });
  }

  const vector = MOVE_VECTORS[command];
  if (!vector) return { ok: false, message: `Unknown PTZ command: ${command}` };

  return new Promise((resolve) => {
    cam.continuousMove({ x: vector.x, y: vector.y, zoom: vector.zoom, timeout: 800 }, (err: Error | null) => {
      if (err) {
        resolve({ ok: false, message: `ONVIF PTZ command failed: ${err.message}` });
        return;
      }
      setTimeout(() => cam.stop({ panTilt: true, zoom: true }, () => {}), 800);
      resolve({ ok: true, message: `Sent ${command} command` });
    });
  });
}

export async function listPtzPresets(options: CamOptions): Promise<{ ok: boolean; presets: PtzPreset[]; message: string }> {
  let cam: Cam;
  try {
    cam = await connectCam(options);
  } catch (err) {
    return { ok: false, presets: [], message: `Could not connect via ONVIF: ${(err as Error).message}` };
  }

  return new Promise((resolve) => {
    cam.getPresets({}, (err: Error | null, presets: Record<string, { $: { token: string }; Name?: string; name?: string }>) => {
      if (err) {
        resolve({ ok: true, presets: [], message: `Connected, but could not read presets: ${err.message}` });
        return;
      }
      const list = Object.values(presets ?? {}).map((p) => ({ token: p.$.token, name: p.Name ?? p.name ?? p.$.token }));
      resolve({ ok: true, presets: list, message: `Found ${list.length} preset(s).` });
    });
  });
}

export async function gotoPtzPreset(options: CamOptions, presetToken: string): Promise<PtzResult> {
  let cam: Cam;
  try {
    cam = await connectCam(options);
  } catch (err) {
    return { ok: false, message: `Could not connect via ONVIF: ${(err as Error).message}` };
  }

  return new Promise((resolve) => {
    cam.gotoPreset({ preset: presetToken }, (err: Error | null) => {
      resolve(err ? { ok: false, message: `ONVIF goto-preset failed: ${err.message}` } : { ok: true, message: `Moved to preset ${presetToken}` });
    });
  });
}
