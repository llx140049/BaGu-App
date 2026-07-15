import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { renderMarkdownHtml } from "./MarkdownDocumentHtml";

interface MarkdownDocumentProps {
  markdown: string;
}

export default function MarkdownDocument({ markdown }: MarkdownDocumentProps) {
  const html = useMemo(() => renderMarkdownHtml(markdown), [markdown]);
  const [height, setHeight] = useState(320);
  const reportHeight = `
    (function () {
      var report = function () { window.ReactNativeWebView.postMessage(String(document.documentElement.scrollHeight)); };
      window.addEventListener('load', report);
      setTimeout(report, 50); setTimeout(report, 300);
    })(); true;
  `;

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        source={{ html }}
        originWhitelist={["*"]}
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
