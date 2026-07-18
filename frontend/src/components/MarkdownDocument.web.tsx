import { StyleSheet, View } from "react-native";
import { markdownCss, renderMarkdownBody } from "./MarkdownDocumentHtml";

interface MarkdownDocumentProps {
  markdown: string;
  imageBaseUrl?: string;
}

export default function MarkdownDocument({ markdown, imageBaseUrl = "" }: MarkdownDocumentProps) {
  const html = `<style>${markdownCss}</style>${renderMarkdownBody(markdown.replaceAll("{{API_BASE}}", imageBaseUrl))}`;
  return <View style={styles.container} {...({ dangerouslySetInnerHTML: { __html: html } } as any)} />;
}

const styles = StyleSheet.create({
  container: { width: "100%" },
});
