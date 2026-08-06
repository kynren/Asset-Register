import * as ImagePicker from "expo-image-picker";

export interface PickedMedia {
  uri: string;
  fileName: string;
  mimeType: string;
}

async function ensurePermission(useCamera: boolean): Promise<boolean> {
  const result = useCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  return result.granted;
}

// Shared by AssetFormScreen (stage locally, upload after create) and AssetDetailScreen (upload
// immediately) — both attach photos/videos to an asset via the same /asset-resources/:id/photos
// endpoint, which accepts any file type (no image-only mimetype filter server-side).
export async function pickAssetMedia(useCamera: boolean): Promise<PickedMedia[]> {
  const granted = await ensurePermission(useCamera);
  if (!granted) return [];

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images", "videos"],
    quality: 0.8,
    allowsMultipleSelection: !useCamera,
  };

  const result = useCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets) return [];

  return result.assets.map((a, i) => ({
    uri: a.uri,
    fileName: a.fileName ?? `media-${Date.now()}-${i}.${a.type === "video" ? "mp4" : "jpg"}`,
    mimeType: a.mimeType ?? (a.type === "video" ? "video/mp4" : "image/jpeg"),
  }));
}

export function buildMediaFormData(media: PickedMedia): FormData {
  const fd = new FormData();
  // React Native's FormData accepts this {uri,name,type} shape for file parts; it isn't a real Blob.
  fd.append("file", { uri: media.uri, name: media.fileName, type: media.mimeType } as unknown as Blob);
  return fd;
}

export function isVideo(url: string): boolean {
  return /\.(mp4|mov|m4v|avi|webm)$/i.test(url);
}
