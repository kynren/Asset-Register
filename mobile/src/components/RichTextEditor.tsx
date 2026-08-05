import { useRef, useState } from "react";
import { View, TouchableOpacity, Text } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

const TOOLBAR_ACTIONS: { icon: keyof typeof Ionicons.glyphMap; command: string; value?: string }[] = [
  { icon: "text", command: "bold" },
  { icon: "reorder-four-outline", command: "italic" },
  { icon: "remove-outline", command: "underline" },
  { icon: "list-outline", command: "insertUnorderedList" },
  { icon: "reorder-three-outline", command: "insertOrderedList" },
];

function buildHtml(initialValue: string, placeholder: string, textColor: string, mutedColor: string) {
  const escaped = initialValue.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  body { font-family: -apple-system, Roboto, sans-serif; font-size: 15px; color: ${textColor}; padding: 10px 12px; }
  #editor { min-height: 100px; outline: none; line-height: 1.4; }
  #editor:empty:before { content: attr(data-placeholder); color: ${mutedColor}; }
  ul, ol { padding-left: 22px; margin: 4px 0; }
</style></head>
<body>
  <div id="editor" contenteditable="true" data-placeholder="${placeholder.replace(/"/g, "&quot;")}">${escaped}</div>
  <script>
    const editor = document.getElementById('editor');
    function post(type, payload) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type, payload }));
    }
    editor.addEventListener('input', () => post('change', editor.innerHTML));
    document.addEventListener('message', handleMessage);
    window.addEventListener('message', handleMessage);
    function handleMessage(e) {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'exec') {
          editor.focus();
          document.execCommand(msg.command, false, msg.value);
          post('change', editor.innerHTML);
        } else if (msg.type === 'setValue') {
          editor.innerHTML = msg.value;
        }
      } catch (err) {}
    }
  </script>
</body></html>`;
}

// Native RN has no rich-text-editing component and no WYSIWYG library is installed, but
// react-native-webview already is — so this hosts a small contenteditable page and bridges
// toolbar taps + content changes over postMessage, rather than pulling in a native rich-text
// dependency. Mirrors client/src/components/RichTextEditor.tsx's role (bold/italic/underline/
// lists) without the TipTap media-embed extensions, which stay web-only.
export function RichTextEditor({ value, onChange, placeholder = "", minHeight = 140 }: Props) {
  const { colors, radius } = useTheme();
  const webviewRef = useRef<WebView>(null);
  const [html] = useState(() => buildHtml(value, placeholder, colors.text, colors.textMuted));

  function exec(command: string, execValue?: string) {
    webviewRef.current?.postMessage(JSON.stringify({ type: "exec", command, value: execValue }));
  }

  function handleMessage(e: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "change") onChange(msg.payload);
    } catch {
      // ignore malformed bridge messages
    }
  }

  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 6, paddingVertical: 4 }}>
        {TOOLBAR_ACTIONS.map((a) => (
          <TouchableOpacity key={a.command} style={{ padding: 6, marginRight: 2 }} onPress={() => exec(a.command, a.value)}>
            <Ionicons name={a.icon} size={16} color={colors.text} />
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={{ padding: 6, marginRight: 2 }}
          onPress={() => webviewRef.current?.postMessage(JSON.stringify({ type: "exec", command: "removeFormat" }))}
        >
          <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: "700" }}>CLEAR</Text>
        </TouchableOpacity>
      </View>
      <WebView
        ref={webviewRef}
        originWhitelist={["*"]}
        source={{ html }}
        onMessage={handleMessage}
        style={{ minHeight, backgroundColor: "transparent" }}
        scrollEnabled
        hideKeyboardAccessoryView
      />
    </View>
  );
}
