import { Cam } from "onvif";

export interface DiscoveredChannel {
  name: string;
  profileToken: string;
  streamUri: string | null;
  snapshotUri: string | null;
}

export interface OnvifDiscoveryResult {
  connected: boolean;
  channels: DiscoveredChannel[];
  message: string;
}

function connectCam(options: { hostname: string; port?: number; username?: string; password?: string }): Promise<Cam> {
  return new Promise((resolve, reject) => {
    const cam = new Cam({ ...options, timeout: 5000 }, (err) => {
      if (err) reject(err);
      else resolve(cam);
    });
  });
}

function getProfiles(cam: Cam): Promise<Awaited<ReturnType<typeof Array.prototype.slice>>> {
  return new Promise((resolve, reject) => {
    cam.getProfiles((err, profiles) => (err ? reject(err) : resolve(profiles)));
  });
}

function getStreamUri(cam: Cam, profileToken: string): Promise<string | null> {
  return new Promise((resolve) => {
    cam.getStreamUri({ protocol: "RTSP", profileToken }, (err, stream) => resolve(err ? null : stream.uri));
  });
}

function getSnapshotUri(cam: Cam, profileToken: string): Promise<string | null> {
  return new Promise((resolve) => {
    cam.getSnapshotUri({ profileToken }, (err, snapshot) => resolve(err ? null : snapshot.uri));
  });
}

/**
 * Attempts a real ONVIF connection + GetProfiles/GetStreamUri/GetSnapshotUri handshake against
 * the given host. Returns an empty channel list (not fabricated placeholders) when the device
 * is unreachable or doesn't speak ONVIF — this is the honest, expected outcome for any host
 * that isn't a real ONVIF-compliant NVR/camera.
 */
export async function discoverOnvifChannels(hostname: string, port: number | undefined, username?: string, password?: string): Promise<OnvifDiscoveryResult> {
  let cam: Cam;
  try {
    cam = await connectCam({ hostname, port, username, password });
  } catch (err) {
    return { connected: false, channels: [], message: `Could not connect via ONVIF: ${(err as Error).message}` };
  }

  let profiles;
  try {
    profiles = await getProfiles(cam);
  } catch (err) {
    return { connected: true, channels: [], message: `Connected, but could not read media profiles: ${(err as Error).message}` };
  }

  if (!profiles || profiles.length === 0) {
    return { connected: true, channels: [], message: "Connected via ONVIF, but the device reported no media profiles/channels." };
  }

  const channels: DiscoveredChannel[] = await Promise.all(
    profiles.map(async (profile, index) => {
      const token = profile.$?.token ?? String(index);
      const [streamUri, snapshotUri] = await Promise.all([getStreamUri(cam, token), getSnapshotUri(cam, token)]);
      return {
        name: profile.name ?? `Channel ${index + 1}`,
        profileToken: token,
        streamUri,
        snapshotUri,
      };
    })
  );

  return { connected: true, channels, message: `Found ${channels.length} channel(s) via ONVIF.` };
}
