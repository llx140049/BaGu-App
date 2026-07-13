import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { useThemeStore } from "../../src/store/useThemeStore";
import { colors } from "../../src/tokens/colors";
import { getDb } from "../../src/data/db";

interface DocData {
  id: string;
  title: string;
  cat: string;
  content: string;
  source: string;
}

function renderContent(text: string, isDark: boolean): React.ReactNode[] {
  const c = isDark ? colors.textDark : colors.text;
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeKey = 0;

  const flushCode = () => {
    if (codeLines.length > 0) {
      elements.push(
        <View key={"code-" + codeKey++} style={[s.codeBlock, { backgroundColor: isDark ? "#1e281e" : "#e8ece4" }]}>
          <Text style={[s.codeText, { color: c }]}>{codeLines.join("\n")}</Text>
        </View>
      );
      codeLines = [];
    }
  };

  lines.forEach((line, i) => {
    if (line.trimStart().startsWith("```")) {
      if (inCodeBlock) { flushCode(); inCodeBlock = false; }
      else { flushCode(); inCodeBlock = true; }
      return;
    }
    if (inCodeBlock) { codeLines.push(line); return; }

    const trimmed = line.trim();
    if (trimmed === "") { elements.push(<View key={"sp-" + i} style={{ height: 8 }} />); return; }
    if (trimmed.startsWith("# ")) { elements.push(<Text key={"h1-" + i} style={[s.h1, { color: c }]}>{trimmed.slice(2)}</Text>); return; }
    if (trimmed.startsWith("## ")) { elements.push(<Text key={"h2-" + i} style={[s.h2, { color: c }]}>{trimmed.slice(3)}</Text>); return; }
    if (trimmed.startsWith("### ")) { elements.push(<Text key={"h3-" + i} style={[s.h3, { color: colors.primary }]}>{trimmed.slice(4)}</Text>); return; }
    if (trimmed.startsWith("> ")) {
      elements.push(
        <View key={"bq-" + i} style={[s.blockquote, { borderLeftColor: colors.primary }]}>
          <Text style={[s.blockquoteText, { color: colors.textSecondary }]}>{trimmed.slice(2)}</Text>
        </View>
      );
      return;
    }
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      elements.push(
        <View key={"li-" + i} style={s.listItem}>
          <Text style={[s.bullet, { color: colors.primary }]}>·</Text>
          <Text style={[s.listText, { color: c }]}>{trimmed.slice(2)}</Text>
        </View>
      );
      return;
    }
    if (trimmed.startsWith("|--") || trimmed.startsWith("|---")) return;
    if (trimmed.startsWith("|")) {
      const cells = trimmed.split("|").filter(Boolean).map((s) => s.trim());
      elements.push(
        <View key={"tr-" + i} style={s.tableRow}>
          {cells.map((cell, ci) => (
            <Text key={"td-" + ci} style={[s.tableCell, { color: c }]}>{cell}</Text>
          ))}
        </View>
      );
      return;
    }

    const parts = trimmed.split(/(\*\*[^*]+\*\*)/g);
    if (parts.length > 1) {
      elements.push(
        <Text key={"p-" + i} style={[s.paragraph, { color: c }]}>
          {parts.map((part, pi) =>
            part.startsWith("**") && part.endsWith("**")
              ? <Text key={"b-" + pi} style={s.bold}>{part.slice(2, -2)}</Text>
              : <Text key={"t-" + pi}>{part}</Text>
          )}
        </Text>
      );
    } else {
      elements.push(<Text key={"p-" + i} style={[s.paragraph, { color: c }]}>{trimmed}</Text>);
    }
  });

  flushCode();
  return elements;
}

export default function DocReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === "dark";
  const bg = isDark ? colors.bgDark : colors.bg;
  const surface = isDark ? colors.surfaceDark : colors.surface;
  const c = isDark ? colors.textDark : colors.text;

  const [doc, setDoc] = useState<DocData | null>(null);
  const [questionCount, setQuestionCount] = useState(0);

  useEffect(() => {
    (async () => {
      const database = await getDb();
      const rows: DocData[] = await database.getAllAsync(
        "SELECT * FROM documents WHERE id = ?",
        [id]
      );
      if (rows.length > 0) setDoc(rows[0]);
      const questions = await database.getAllAsync(
        "SELECT id FROM questions WHERE source_document_id = ?",
        [id]
      );
      setQuestionCount(questions.length);
    })();
  }, [id]);

  const startPractice = () => {
    if (!doc || questionCount === 0) return;
    router.push({ pathname: "/(tabs)/study", params: { documentId: doc.id, documentTitle: doc.title } });
  };

  const deleteDocument = () => {
    if (!doc) return;
    Alert.alert(
      "删除文档？",
      "关联题目会保留为独立题目，原文档将无法恢复。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: async () => {
            const database = await getDb();
            await database.runAsync("UPDATE questions SET source_document_id = NULL WHERE source_document_id = ?", [doc.id]);
            await database.runAsync("DELETE FROM documents WHERE id = ?", [doc.id]);
            router.back();
          },
        },
      ]
    );
  };

  if (!doc) {
    return (
      <View style={[s.container, { backgroundColor: bg, justifyContent: "center" }]}>
        <Text style={[{ color: colors.textSecondary, textAlign: "center" }]}>加载中...</Text>
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      <View style={[s.header, { backgroundColor: surface }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[s.backBtn, { color: colors.primary }]}>← 返回</Text>
        </TouchableOpacity>
        <View style={s.headerInfo}>
          <Text style={[s.catBadge, { color: colors.primary }]}>{doc.cat}</Text>
          <Text style={[s.sourceText, { color: colors.textTertiary }]}>{doc.source}</Text>
        </View>
      </View>

      <ScrollView style={s.scrollArea} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={true}>
        <Text style={[s.docTitle, { color: c }]}>{doc.title}</Text>
        <View style={[s.practiceCard, { backgroundColor: surface }]}>
          <View>
            <Text style={[s.practiceTitle, { color: c }]}>关联题目</Text>
            <Text style={[s.practiceMeta, { color: colors.textSecondary }]}>{questionCount} 道题目</Text>
          </View>
          <TouchableOpacity
            style={[s.practiceButton, { backgroundColor: questionCount > 0 ? colors.primary : colors.border }]}
            disabled={questionCount === 0}
            onPress={startPractice}
          >
            <Text style={s.practiceButtonText}>开始练习</Text>
          </TouchableOpacity>
        </View>
        {renderContent(doc.content, isDark)}
        <TouchableOpacity style={s.deleteButton} onPress={deleteDocument}>
          <Text style={s.deleteText}>删除文档</Text>
        </TouchableOpacity>
        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: { fontSize: 16, fontWeight: "500" },
  headerInfo: { flexDirection: "row", alignItems: "center", gap: 8 },
  catBadge: { fontSize: 12, fontWeight: "600", backgroundColor: "#e8ece4", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, overflow: "hidden" },
  sourceText: { fontSize: 11 },
  scrollArea: { flex: 1 },
  scrollContent: { padding: 20 },
  docTitle: { fontSize: 24, fontWeight: "700", marginBottom: 20, lineHeight: 32 },
  practiceCard: { borderRadius: 12, padding: 14, marginBottom: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  practiceTitle: { fontSize: 15, fontWeight: "600" },
  practiceMeta: { fontSize: 12, marginTop: 4 },
  practiceButton: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  practiceButtonText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  deleteButton: { marginTop: 20, alignItems: "center", paddingVertical: 12 },
  deleteText: { color: colors.danger, fontSize: 14 },
  h1: { fontSize: 20, fontWeight: "700", marginTop: 20, marginBottom: 10 },
  h2: { fontSize: 17, fontWeight: "600", marginTop: 18, marginBottom: 8 },
  h3: { fontSize: 15, fontWeight: "600", marginTop: 14, marginBottom: 6 },
  paragraph: { fontSize: 15, lineHeight: 24, marginBottom: 6 },
  bold: { fontWeight: "700" },
  codeBlock: { padding: 14, borderRadius: 8, marginVertical: 8, overflow: "hidden" },
  codeText: { fontSize: 13, fontFamily: "monospace", lineHeight: 20 },
  blockquote: { borderLeftWidth: 3, paddingLeft: 12, marginVertical: 6 },
  blockquoteText: { fontSize: 14, lineHeight: 22, fontStyle: "italic" },
  listItem: { flexDirection: "row", marginBottom: 4, paddingLeft: 8 },
  bullet: { fontSize: 16, lineHeight: 24, marginRight: 8 },
  listText: { fontSize: 15, lineHeight: 24, flex: 1 },
  tableRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#ccc", paddingVertical: 6 },
  tableCell: { flex: 1, fontSize: 13, paddingHorizontal: 4 },
});
