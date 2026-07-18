import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Asset } from "expo-asset";
import { WebView } from "react-native-webview";
import { renderMarkdownHtml } from "./MarkdownDocumentHtml";

interface MarkdownDocumentProps {
  markdown: string;
  imageBaseUrl?: string;
}

export default function MarkdownDocument({ markdown, imageBaseUrl = "" }: MarkdownDocumentProps) {
  const [fontUri, setFontUri] = useState("");
  useEffect(() => {
    Asset.fromModule(require("../../assets/fonts/MiSans-Regular.otf")).downloadAsync()
      .then((asset) => setFontUri(asset.localUri || asset.uri))
      .catch(() => setFontUri(""));
  }, []);
  const normalizedMarkdown = useMemo(() => markdown.replace(/\{\{API_BASE\}\}(\/api\/v1\/document-assets\/[^/\s)]+\/)(?:\{\{API_BASE\}\}\1)/g, "{{API_BASE}}$1"), [markdown]);
  const html = useMemo(() => renderMarkdownHtml(normalizedMarkdown.replaceAll("{{API_BASE}}", imageBaseUrl), fontUri), [normalizedMarkdown, imageBaseUrl, fontUri]);
  const [height, setHeight] = useState(320);
  const reportHeight = `
    (function () {
      var report = function () { window.ReactNativeWebView.postMessage(String(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight))); };
      window.addEventListener('load', report);
      window.addEventListener('resize', report);
      Array.prototype.forEach.call(document.images, function (image) { image.addEventListener('load', report); image.addEventListener('error', report); });
      new MutationObserver(report).observe(document.body, { childList: true, subtree: true });
      setTimeout(report, 50); setTimeout(report, 300); setTimeout(report, 1000); setTimeout(report, 2500);
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
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%" },
  webview: { flex: 1, backgroundColor: "transparent" },
});
