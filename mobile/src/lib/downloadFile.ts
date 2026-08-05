// expo-file-system v57 replaced the old cacheDirectory/writeAsStringAsync API with a class-based
// File/Directory API; the "legacy" subpath keeps the old free-function shape, which is all this
// one-shot "write blob, then share it" helper needs.
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { axiosClient } from "../api/axiosClient";

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Hermes has no Buffer/btoa for arbitrary binary data, so arraybuffer -> base64 is done by hand here
// rather than pulling in a Buffer polyfill for this one call site.
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let result = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = bytes[i + 1];
    const b3 = bytes[i + 2];
    result += BASE64_CHARS[b1 >> 2];
    result += BASE64_CHARS[((b1 & 0x03) << 4) | (b2 === undefined ? 0 : b2 >> 4)];
    result += b2 === undefined ? "=" : BASE64_CHARS[((b2 & 0x0f) << 2) | (b3 === undefined ? 0 : b3 >> 6)];
    result += b3 === undefined ? "=" : BASE64_CHARS[b3 & 0x3f];
  }
  return result;
}

// Shared by every "download a report/export" action ported from the web app (which just triggers a
// browser <a download>). Mobile has no download folder to drop a file into by default, so instead
// this pulls the blob into cache and opens the native share sheet — the user picks Save to Files,
// AirDrop, email, etc. from there.
export async function downloadAndShare(url: string, filename: string, params?: Record<string, unknown>) {
  const res = await axiosClient.get(url, { params, responseType: "arraybuffer" });
  const contentType = (res.headers?.["content-type"] as string) ?? "application/octet-stream";
  const base64 = arrayBufferToBase64(res.data as ArrayBuffer);
  const fileUri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, { mimeType: contentType, dialogTitle: filename });
  }
  return fileUri;
}
