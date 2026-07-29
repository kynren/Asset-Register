declare module "onvif" {
  export interface OnvifProfile {
    name?: string;
    $?: { token?: string };
    [key: string]: unknown;
  }

  export class Cam {
    constructor(options: { hostname: string; username?: string; password?: string; port?: number; timeout?: number }, callback: (err: Error | null) => void);
    getProfiles(callback: (err: Error | null, profiles: OnvifProfile[]) => void): void;
    getStreamUri(options: { protocol: string; profileToken?: string }, callback: (err: Error | null, stream: { uri: string }) => void): void;
    getSnapshotUri(options: { profileToken?: string } | undefined, callback: (err: Error | null, snapshot: { uri: string }) => void): void;
    getDeviceInformation(callback: (err: Error | null, info: Record<string, unknown>) => void): void;
  }
}
