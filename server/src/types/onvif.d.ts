declare module "onvif" {
  export interface OnvifProfile {
    name?: string;
    $?: { token?: string };
    [key: string]: unknown;
  }

  export interface OnvifPreset {
    $: { token: string };
    Name?: string;
    name?: string;
    [key: string]: unknown;
  }

  export class Cam {
    constructor(options: { hostname: string; username?: string; password?: string; port?: number; timeout?: number }, callback: (err: Error | null) => void);
    getProfiles(callback: (err: Error | null, profiles: OnvifProfile[]) => void): void;
    getStreamUri(options: { protocol: string; profileToken?: string }, callback: (err: Error | null, stream: { uri: string }) => void): void;
    getSnapshotUri(options: { profileToken?: string } | undefined, callback: (err: Error | null, snapshot: { uri: string }) => void): void;
    getDeviceInformation(callback: (err: Error | null, info: Record<string, unknown>) => void): void;

    // PTZ
    gotoHomePosition(options: { profileToken?: string; speed?: unknown }, callback: (err: Error | null) => void): void;
    continuousMove(options: { profileToken?: string; x?: number; y?: number; zoom?: number; timeout?: number }, callback: (err: Error | null) => void): void;
    stop(options: { profileToken?: string; panTilt?: boolean; zoom?: boolean }, callback: (err: Error | null) => void): void;
    getPresets(options: { profileToken?: string }, callback: (err: Error | null, presets: Record<string, OnvifPreset>) => void): void;
    gotoPreset(options: { profileToken?: string; preset: string; speed?: unknown }, callback: (err: Error | null) => void): void;

    // Events (Cam extends EventEmitter — subscribing to "event" auto-starts ONVIF PullPoint pulling)
    on(event: "event", listener: (message: { topic?: { _: string }; message?: { data?: unknown } }, xml: string) => void): this;
    on(event: "eventsError", listener: (error: Error) => void): this;
    removeAllListeners(event?: string): this;
  }
}
