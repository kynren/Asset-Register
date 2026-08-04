// Minimal, dependency-free PNG/JPEG dimension parser — just enough to size the docs watermark
// image proportionally in PDF/Word exports without pulling in a native image library (sharp etc.
// need compilation, which is finicky on Windows dev machines this app is often run from).
export function readImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (
    buffer.length >= 24 &&
    buffer.readUInt32BE(0) === 0x89504e47 &&
    buffer.readUInt32BE(4) === 0x0d0a1a0a
  ) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      // Markers with no payload length to skip.
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      if (marker === 0xd9 || offset + 4 > buffer.length) break; // EOI or truncated
      const segmentLength = buffer.readUInt16BE(offset + 2);
      // SOF0-SOF15 (excluding DHT/JPG/DAC, which reuse the SOF numeric range) carry frame dimensions.
      const isSofMarker = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSofMarker && offset + 9 <= buffer.length) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + segmentLength;
    }
  }

  return null;
}
