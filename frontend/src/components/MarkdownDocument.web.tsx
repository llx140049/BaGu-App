import { StyleSheet, View } from "react-native";
import { markdownCss, renderMarkdownBody } from "./MarkdownDocumentHtml";

interface MarkdownDocumentProps {
  markdown: string;
}

export default function MarkdownDocument({ markdown }: MarkdownDocumentProps) {
  const html = `<style>${markdownCss}</style>${renderMarkdownBody(markdown)}`;
  return <View style={styles.container} {...({ dangerouslySetInnerHTML: { __html: html } } as any)} />;
}

const styles = StyleSheet.create({
  container: { width: "100%" },
});
