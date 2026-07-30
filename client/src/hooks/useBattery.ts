import { useEffect, useState } from "react";

// Minimal shape of the browser's native Battery Status API. Deprecated in the spec and
// unsupported in Firefox/Safari, so every read of this must be feature-detected — there is no
// polyfill for "the real battery state" and we never fabricate one.
interface BatteryManager extends EventTarget {
  charging: boolean;
  level: number;
  chargingTime: number;
  dischargingTime: number;
}

export interface BatteryState {
  charging: boolean;
  level: number;
  chargingTime: number;
  dischargingTime: number;
}

export function useBattery() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [state, setState] = useState<BatteryState | null>(null);

  useEffect(() => {
    // Must be called as navigator.getBattery(), not destructured into a standalone reference —
    // this native method silently returns a promise that never resolves if called with the
    // wrong `this` receiver.
    if (typeof (navigator as any).getBattery !== "function") {
      setSupported(false);
      return;
    }

    let battery: BatteryManager | null = null;
    let cancelled = false;

    const sync = () => {
      if (!battery) return;
      setState({
        charging: battery.charging,
        level: battery.level,
        chargingTime: battery.chargingTime,
        dischargingTime: battery.dischargingTime,
      });
    };

    (navigator as any).getBattery().then((b: BatteryManager) => {
      if (cancelled) return;
      battery = b;
      setSupported(true);
      sync();
      b.addEventListener("levelchange", sync);
      b.addEventListener("chargingchange", sync);
    });

    return () => {
      cancelled = true;
      if (battery) {
        battery.removeEventListener("levelchange", sync);
        battery.removeEventListener("chargingchange", sync);
      }
    };
  }, []);

  return { supported, state };
}

export function formatBatteryDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
