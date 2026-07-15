import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Modal, TextInput, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { useThemeStore } from "../../src/store/useThemeStore";
import { colors } from "../../src/tokens/colors";
import { getDb } from "../../src/data/db";
import { syncApi } from "../../src/services/api";
import MarkdownDocument from "../../src/components/MarkdownDocument";

interface DocData {
  id: string;
  title: string;
  cat: string;
  content: string;
  source: string;
  scroll_offset?: number;
  reading_progress?: number;
  last_read_at?: string | null;
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
  const [showRename, setShowRename] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [showCategoryEditor, setShowCategoryEditor] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [draftCategory, setDraftCategory] = useState("");
  const [directoryOptions, setDirectoryOptions] = useState<string[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestReading = useRef({ offset: 0, progress: 0 });
  const restored = useRef(false);

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
      const documentCategories: { cat: string }[] = await database.getAllAsync("SELECT cat FROM documents");
      const questionCategories: { cat: string }[] = await database.getAllAsync("SELECT cat FROM questions");
      setDirectoryOptions(
        Array.from(new Set([...documentCategories, ...questionCategories].map((row) => row.cat).filter(Boolean)))
          .sort((a, b) => a.localeCompare(b, "zh-CN"))
      );
    })();
  }, [id]);

  const saveReadingProgress = async () => {
    if (!doc) return;
    const database = await getDb();
    await database.runAsync(
      "UPDATE documents SET scroll_offset = ?, reading_progress = ?, last_read_at = ? WHERE id = ?",
      [latestReading.current.offset, latestReading.current.progress, new Date().toISOString(), doc.id]
    );
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const maxOffset = Math.max(1, contentSize.height - layoutMeasurement.height);
    latestReading.current = {
      offset: contentOffset.y,
      progress: Math.max(0, Math.min(100, (contentOffset.y / maxOffset) * 100)),
    };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { saveReadingProgress().catch(() => {}); }, 800);
  };

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveReadingProgress().catch(() => {});
    };
  }, [doc]);

  const startPractice = () => {
    if (!doc) return;
    if (questionCount === 0) { Alert.alert("暂无题目", "这篇文档暂时没有关联题目。"); return; }
    router.push({ pathname: "/(tabs)/study", params: { documentId: doc.id, documentTitle: doc.title } });
  };

  const openRename = () => {
    if (!doc) return;
    setDraftTitle(doc.title);
    setShowRename(true);
  };

  const saveRename = async () => {
    const title = draftTitle.trim();
    if (!doc || !title) return;
    const database = await getDb();
    await database.runAsync("UPDATE documents SET title = ? WHERE id = ?", [title, doc.id]);
    setDoc({ ...doc, title });
    setShowRename(false);
  };

  const openCategoryEditor = () => {
    if (!doc) return;
    setDraftCategory(doc.cat);
    setShowCategoryEditor(true);
  };

  const saveCategory = async () => {
    const category = draftCategory.split("/").map((part) => part.trim()).filter(Boolean).join("/");
    if (!doc || !category) return;
    try {
      await syncApi.updateDocumentCategory(doc.id, category);
      const database = await getDb();
      await database.runAsync("UPDATE documents SET cat = ? WHERE id = ?", [category, doc.id]);
      await database.runAsync("UPDATE questions SET cat = ? WHERE source_document_id = ?", [category, doc.id]);
      setDoc({ ...doc, cat: category });
      setShowCategoryEditor(false);
    } catch (e: any) {
      Alert.alert("\u4fdd\u5b58\u5931\u8d25", e.message || "\u8bf7\u68c0\u67e5\u767b\u5f55\u72b6\u6001\u548c\u7f51\u7edc");
    }
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
      <View style={s.header}>
        <TouchableOpacity accessibilityLabel="返回" style={s.headerButton} onPress={() => router.back()}><Text style={s.backBtn}>{"<"}</Text></TouchableOpacity>
        <Text numberOfLines={1} style={[s.headerTitle, { color: c }]}>{doc.title}</Text>
        <View style={s.headerActions}>
          <TouchableOpacity accessibilityLabel="做题" style={s.headerButton} onPress={startPractice}><Text style={s.practiceGlyph}>▷</Text></TouchableOpacity>
          <TouchableOpacity accessibilityLabel="更多" style={s.headerButton} onPress={() => setShowMore((visible) => !visible)}><Text style={s.moreGlyph}>•••</Text></TouchableOpacity>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={s.scrollArea}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={true}
        scrollEventThrottle={250}
        onScroll={handleScroll}
        onContentSizeChange={() => {
          if (!restored.current && doc.scroll_offset) {
            restored.current = true;
            scrollRef.current?.scrollTo({ y: doc.scroll_offset, animated: false });
          }
        }}
      >
        <MarkdownDocument markdown={doc.content} />
      </ScrollView>
      {showMore ? <View style={[s.moreMenu, { backgroundColor: surface }]}>
        <TouchableOpacity style={s.moreRow} onPress={() => { setShowMore(false); scrollRef.current?.scrollTo({ y: 0, animated: true }); }}><Text style={s.moreRowIcon}>☷</Text><Text style={[s.moreRowText, { color: c }]}>目录</Text></TouchableOpacity>
        <TouchableOpacity style={s.moreRow} onPress={() => { setShowMore(false); Alert.alert("搜索", "文档内搜索将在下一阶段开放。"); }}><Text style={s.moreRowIcon}>⌕</Text><Text style={[s.moreRowText, { color: c }]}>搜索</Text></TouchableOpacity>
        <View style={s.moreDivider} />
        <TouchableOpacity style={s.moreRow} onPress={() => { setShowMore(false); Alert.alert("分享", "分享功能将在下一阶段开放。"); }}><Text style={s.moreRowIcon}>⇧</Text><Text style={[s.moreRowText, { color: c }]}>分享</Text></TouchableOpacity>
        <TouchableOpacity style={s.moreRow} onPress={() => { setShowMore(false); Alert.alert("导出", "导出功能将在下一阶段开放。"); }}><Text style={s.moreRowIcon}>⇩</Text><Text style={[s.moreRowText, { color: c }]}>导出</Text></TouchableOpacity>
        <View style={s.moreDivider} />
        <TouchableOpacity style={s.moreRow} onPress={() => { setShowMore(false); Alert.alert("阅读设置", "阅读设置将在下一阶段开放。"); }}><Text style={s.moreRowIcon}>⚙</Text><Text style={[s.moreRowText, { color: c }]}>阅读设置</Text></TouchableOpacity>
      </View> : null}
      <Modal visible={showCategoryEditor} transparent animationType="fade" onRequestClose={() => setShowCategoryEditor(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.renameModal, { backgroundColor: surface }]}>
            <Text style={[s.modalTitle, { color: c }]}>{"\u6574\u7406\u6587\u6863\u76ee\u5f55"}</Text>
            <TextInput
              style={[s.renameInput, { color: c, borderColor: isDark ? colors.borderDark : colors.border }]}
              value={draftCategory}
              onChangeText={setDraftCategory}
              autoFocus
              placeholder={"\u4f8b\u5982\uff1a\u9ad8\u7b49\u6570\u5b66/\u591a\u5143\u51fd\u6570"}
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
            />
            <Text style={[s.categoryHint, { color: colors.textSecondary }]}>{"\u4f7f\u7528 / \u5206\u9694\u591a\u7ea7\u76ee\u5f55\uff0c\u5173\u8054\u9898\u76ee\u4f1a\u540c\u6b65\u79fb\u52a8\u3002"}</Text>
            {directoryOptions.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.directoryOptions}>
                {directoryOptions.map((category) => (
                  <TouchableOpacity
                    key={category}
                    style={[s.directoryChip, { backgroundColor: draftCategory === category ? colors.primaryLight : (isDark ? "#2a342a" : "#e8ece4") }]}
                    onPress={() => setDraftCategory(category)}
                  >
                    <Text style={[s.directoryChipText, { color: draftCategory === category ? colors.primary : c }]}>{category}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : null}
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalButton} onPress={() => setShowCategoryEditor(false)}>
                <Text style={[s.cancelText, { color: colors.textSecondary }]}>{"\u53d6\u6d88"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalButton, s.saveButton]} onPress={saveCategory}>
                <Text style={s.saveText}>{"\u4fdd\u5b58"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showRename} transparent animationType="fade" onRequestClose={() => setShowRename(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.renameModal, { backgroundColor: surface }]}>
            <Text style={[s.modalTitle, { color: c }]}>重命名文档</Text>
            <TextInput
              style={[s.renameInput, { color: c, borderColor: isDark ? colors.borderDark : colors.border }]}
              value={draftTitle}
              onChangeText={setDraftTitle}
              autoFocus
              placeholder="输入文档标题"
              placeholderTextColor={colors.textTertiary}
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalButton} onPress={() => setShowRename(false)}>
                <Text style={[s.cancelText, { color: colors.textSecondary }]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalButton, s.saveButton]} onPress={saveRename}>
                <Text style={s.saveText}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { height: 76, paddingHorizontal: 18, flexDirection: "row", alignItems: "center" },
  headerButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  backBtn: { color: colors.text, fontSize: 31, fontWeight: "300", lineHeight: 34, marginTop: -2 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: "600", marginLeft: 3 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  practiceGlyph: { color: colors.text, fontSize: 32, fontWeight: "300", lineHeight: 34 },
  moreGlyph: { color: colors.text, fontSize: 18, letterSpacing: 1.5 },
  scrollArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 26, paddingTop: 14, paddingBottom: 36 },
  docTitle: { fontSize: 29, fontWeight: "700", marginBottom: 24, lineHeight: 39 },
  renameButton: { alignSelf: "flex-start", marginTop: -12, marginBottom: 16 },
  renameText: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  categoryButton: { alignSelf: "flex-start", marginTop: -10, marginBottom: 16 },
  categoryText: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  practiceCard: { borderRadius: 12, padding: 14, marginBottom: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  practiceTitle: { fontSize: 15, fontWeight: "600" },
  practiceMeta: { fontSize: 12, marginTop: 4 },
  practiceButton: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  practiceButtonText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  deleteButton: { marginTop: 20, alignItems: "center", paddingVertical: 12 },
  deleteText: { color: colors.danger, fontSize: 14 },
  moreMenu: { position: "absolute", top: 70, right: 18, width: 178, borderRadius: 16, paddingVertical: 8, shadowColor: "#171717", shadowOpacity: 0.12, shadowRadius: 20, elevation: 7, zIndex: 10 },
  moreRow: { minHeight: 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 18 },
  moreRowIcon: { width: 31, color: colors.text, fontSize: 25, fontWeight: "300" },
  moreRowText: { fontSize: 16, fontWeight: "500", marginLeft: 8 },
  moreDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 4, marginHorizontal: 16 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
  renameModal: { borderRadius: 14, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 16 },
  renameInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  categoryHint: { fontSize: 12, lineHeight: 18, marginTop: 8 },
  directoryOptions: { gap: 8, paddingTop: 10, paddingRight: 12 },
  directoryChip: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  directoryChipText: { fontSize: 12, fontWeight: "600" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 18 },
  modalButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  saveButton: { backgroundColor: colors.primary },
  cancelText: { fontSize: 14, fontWeight: "600" },
  saveText: { color: "#fff", fontSize: 14, fontWeight: "600" },
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
