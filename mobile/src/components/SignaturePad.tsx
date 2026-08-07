import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { PanResponder, Text, TouchableOpacity, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import * as FileSystem from "expo-file-system/legacy";
import { useTheme } from "../theme/ThemeContext";

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  clear: () => void;
  /** Rasterizes the drawn strokes via react-native-svg's built-in toDataURL (no extra native
   * module needed — it's already part of the react-native-svg dependency), writes the PNG to
   * cache, and returns a file:// uri ready to attach to a multipart FormData part. */
  exportAsync: () => Promise<string>;
}

// Touch-drawn signature capture for the mobile Issue Stock flow, mirroring the web SignaturePad's
// role (proof of receipt on the issuance PDF) without pulling in a native canvas library.
export const SignaturePad = forwardRef<SignaturePadHandle, { height?: number; onChange?: (hasSignature: boolean) => void }>(function SignaturePad({ height = 160, onChange }, ref) {
  const { colors, radius } = useTheme();
  const svgRef = useRef<Svg>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [current, setCurrent] = useState("");

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        setCurrent(`M${locationX.toFixed(1)},${locationY.toFixed(1)}`);
      },
      onPanResponderMove: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        setCurrent((prev) => `${prev} L${locationX.toFixed(1)},${locationY.toFixed(1)}`);
      },
      onPanResponderRelease: () => {
        setCurrent((prev) => {
          if (prev) {
            setPaths((all) => [...all, prev]);
            onChange?.(true);
          }
          return "";
        });
      },
    })
  ).current;

  function clear() {
    setPaths([]);
    setCurrent("");
    onChange?.(false);
  }

  useImperativeHandle(ref, () => ({
    isEmpty: () => paths.length === 0,
    clear,
    exportAsync: () =>
      new Promise((resolve, reject) => {
        if (!svgRef.current) return reject(new Error("Signature not ready"));
        svgRef.current.toDataURL(async (base64) => {
          try {
            const uri = `${FileSystem.cacheDirectory}signature-${Date.now()}.png`;
            await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
            resolve(uri);
          } catch (err) {
            reject(err);
          }
        });
      }),
  }));

  return (
    <View>
      <View {...panResponder.panHandlers} style={{ height, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden" }}>
        <Svg ref={svgRef} width="100%" height={height}>
          <Rect x={0} y={0} width="100%" height="100%" fill="#fff" />
          {paths.map((d, i) => (
            <Path key={i} d={d} stroke="#111" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {current ? <Path d={current} stroke="#111" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
        </Svg>
      </View>
      {paths.length > 0 && (
        <TouchableOpacity onPress={clear} style={{ marginTop: 6, alignSelf: "flex-end" }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>Clear</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});
