import { ReactNode, useEffect, useRef, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import * as SplashScreen from "expo-splash-screen";
import { axiosClient } from "../api/axiosClient";
import { API_ORIGIN } from "../config/env";
import { useAuth } from "../auth/AuthContext";

interface MobileSplashSettings {
  enabled: boolean;
  mediaType: "PHOTO" | "GIF" | "VIDEO";
  mediaUrl: string | null;
  backgroundColor: string;
  minDisplayMs: number;
}

// Both Apple and Google forbid anything but a static image at the native OS-level launch-screen
// layer, so an admin-selectable photo/gif/video can only live here: a custom JS-rendered screen
// shown immediately after the native splash (see expo-splash-screen config in app.json) hides.
// SplashScreen.preventAutoHideAsync() is called at module scope in App.tsx so the native splash
// stays up while this component mounts and fetches the org's configured media underneath it.
export function AppLoadingScreen({ children }: { children: ReactNode }) {
  const { loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<MobileSplashSettings | null>(null);
  const [settingsFetched, setSettingsFetched] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [nativeSplashHidden, setNativeSplashHidden] = useState(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;
    axiosClient
      .get("/settings/public/mobile-splash")
      .then((res) => {
        if (!cancelled) setSettings(res.data);
      })
      .catch(() => {
        if (!cancelled) setSettings(null);
      })
      .finally(() => {
        if (!cancelled) setSettingsFetched(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const active = Boolean(settingsFetched && settings?.enabled && settings.mediaUrl);
  const mediaUrl = active ? `${API_ORIGIN}${settings!.mediaUrl}` : null;

  // Reveal whatever this component has already rendered underneath the native splash — either the
  // custom media (once its first frame is ready) or, if nothing is configured, straight through to
  // the real app. Deliberately waits for settingsFetched so this doesn't fire on the transient
  // pre-fetch render where `active` is trivially false.
  useEffect(() => {
    if (!settingsFetched || nativeSplashHidden) return;
    if (!active || mediaReady) {
      SplashScreen.hideAsync().catch(() => undefined);
      setNativeSplashHidden(true);
    }
  }, [settingsFetched, active, mediaReady, nativeSplashHidden]);

  // Only an admin-configured splash enforces a minimum display time — an idle floor with nothing to
  // show would just be an artificial delay. Waits for settingsFetched so the correct duration (0 vs
  // the configured minDisplayMs) is known before the timer starts.
  useEffect(() => {
    if (!settingsFetched) return;
    const targetMs = active ? settings!.minDisplayMs : 0;
    const remaining = Math.max(0, targetMs - (Date.now() - startedAt.current));
    const timer = setTimeout(() => setMinTimeElapsed(true), remaining);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsFetched, active]);

  const player = useVideoPlayer(active && settings!.mediaType === "VIDEO" ? mediaUrl : null, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    if (active && settings!.mediaType === "VIDEO") setMediaReady(true);
  }, [active, settings]);

  const showOverlay = !settingsFetched || !minTimeElapsed || authLoading;
  if (!showOverlay) return <>{children}</>;

  if (!active) {
    return <View style={{ flex: 1, backgroundColor: settings?.backgroundColor ?? "#0d1117" }} />;
  }

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: settings!.backgroundColor }]}>
      {settings!.mediaType !== "VIDEO" ? (
        <Image source={{ uri: mediaUrl! }} style={StyleSheet.absoluteFill} resizeMode="cover" onLoadEnd={() => setMediaReady(true)} onError={() => setMediaReady(true)} />
      ) : (
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      )}
    </View>
  );
}
