import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Asset } from "expo-asset";
import { WebView } from "react-native-webview";
import { renderMarkdownHtml } from "./MarkdownDocumentHtml";

interface MarkdownDocumentProps {
  markdown: string;
  imageBaseUrl?: string;
  isDark?: boolean;
}

export default function MarkdownDocument({ markdown, imageBaseUrl = "", isDark = false }: MarkdownDocumentProps) {
  const [fontUri, setFontUri] = useState("");
  useEffect(() => {
    Asset.fromModule(require("../../assets/fonts/MiSans-Regular.otf")).downloadAsync()
      .then((asset) => setFontUri(asset.localUri || asset.uri))
      .catch(() => setFontUri(""));
  }, []);
  const normalizedMarkdown = useMemo(() => markdown.replace(/\{\{API_BASE\}\}(\/api\/v1\/document-assets\/[^/\s)]+\/)(?:\{\{API_BASE\}\}\1)/g, "{{API_BASE}}$1"), [markdown]);
  const html = useMemo(() => renderMarkdownHtml(normalizedMarkdown.replaceAll("{{API_BASE}}", imageBaseUrl), fontUri, isDark), [normalizedMarkdown, imageBaseUrl, fontUri, isDark]);
  const [height, setHeight] = useState(320);
  const reportHeight = `
    (function () {
      var report = function () {
        var height = Math.max(
          document.body.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.scrollHeight,
          document.documentElement.offsetHeight
        );
        window.ReactNativeWebView.postMessage(String(height));
      };
      window.addEventListener('load', report);
      window.addEventListener('resize', report);
      Array.prototype.forEach.call(document.images, function (image) { image.addEventListener('load', report); image.addEventListener('error', report); });
      new MutationObserver(report).observe(document.body, { childList: true, subtree: true });
      if (window.ResizeObserver) new ResizeObserver(report).observe(document.body);
      setTimeout(report, 50); setTimeout(report, 300); setTimeout(report, 1000); setTimeout(report, 2500); setTimeout(report, 5000);
    })(); true;
  `;

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        source={{ html }}
        originWhitelist={["*"]}
        allowFileAccess
        injectedJavaScript={reportHeight}
        onMessage={(event) => {
          const nextHeight = Number(event.nativeEvent.data);
          if (Number.isFinite(nextHeight) && nextHeight > 0) setHeight(nextHeight + 8);
        }}
        scrollEnabled={false}
        style={[styles.webview, { backgroundColor: isDark ? "#191A20" : "#FFFFFF" }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%" },
  webview: { flex: 1, backgroundColor: "transparent" },
});
