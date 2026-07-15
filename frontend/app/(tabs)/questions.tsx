import { useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Modal } from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useThemeStore } from "../../src/store/useThemeStore";
import { colors } from "../../src/tokens/colors";
import { getDb, insertSampleData } from "../../src/data/db";
import { genId } from "../../src/data/utils";
import { uploadApi } from "../../src/services/api";
import FilePicker from "../../src/components/FilePicker";
import UploadPreviewModal from "../../src/components/UploadPreview";
import QuestionEditor, { EditableQuestion } from "../../src/components/QuestionEditor";

interface DocItem { id: string; title: string; cat: string; source: string; questionCount: number; reading_progress?: number; last_read_at?: string | null; }
interface QItem extends EditableQuestion { id: string; source_document_id?: string | null; }
type Tab = "questions" | "knowledge";
type SourceFilter = "all" | "document" | "standalone";

export default function QuestionsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === "dark";
  const c = isDark ? colors.textDark : colors.text;
  const bg = isDark ? colors.bgDark : colors.bg;
  const surface = isDark ? colors.surfaceDark : colors.surface;
  const [activeTab, setActiveTab] = useState<Tab>(params.tab === "questions" ? "questions" : "knowledge");
  const [showLibraryMenu, setShowLibraryMenu] = useState(false);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [questions, setQuestions] = useState<QItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [editingQuestion, setEditingQuestion] = useState<QItem | null>(null);
  const [showQuestionEditor, setShowQuestionEditor] = useState(false);

  const loadData = useCallback(async () => {
    await insertSampleData();
    const database = await getDb();
    const qRows: QItem[] = await database.getAllAsync("SELECT id, cat, q, a, source_document_id FROM questions ORDER BY cat");
    setQuestions(qRows);
    const docRows: Omit<DocItem, "questionCount">[] = await database.getAllAsync("SELECT id, title, cat, source, reading_progress, last_read_at FROM documents ORDER BY created_at");
    const questionCounts = new Map<string, number>();
    for (const question of qRows) {
      if (question.source_document_id) {
        questionCounts.set(question.source_document_id, (questionCounts.get(question.source_document_id) ?? 0) + 1);
      }
    }
    setDocs(docRows.map((doc) => ({ ...doc, questionCount: questionCounts.get(doc.id) ?? 0 })));
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handleFileSelected = async (file: { uri: string; name: string; bytes?: ArrayBuffer; mimeType?: string }) => {
    Alert.alert(
      "选择导入方式",
      `已选择：${file.name}`,
      [
        { text: "取消", style: "cancel" },
        { text: "仅导入原文", onPress: () => uploadFile(file, false) },
        { text: "生成题目", onPress: () => uploadFile(file, true) },
      ]
    );
  };

  const uploadFile = async (
    file: { uri: string; name: string; bytes?: ArrayBuffer; mimeType?: string },
    generateQuestions: boolean
  ) => {
    setUploading(true);
    try {
      const data: any = await uploadApi.uploadPdf(file, generateQuestions);
      setPreviewData(data);
      setShowPreview(true);
    } catch (e: any) {
      Alert.alert("上传失败", e.message || "请检查后端是否已启动");
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = async (edits: any[]) => {
    if (!previewData) return;
    try {
      const result: any = await uploadApi.confirm({
        preview_token: previewData.preview_token,
        edits,
      });

      const database = await getDb();
      const generatedQuestionSummary = result.questions
        .map((q: any, index: number) => `## ${index + 1}. ${q.cat}\n\nQ: ${q.q}\n\nA: ${q.a}`)
        .join("\n\n");
      await database.runAsync(
        "INSERT OR REPLACE INTO documents (id, title, cat, content, source, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [
          result.document_id,
          result.file_name,
          "导入文档",
          result.content || generatedQuestionSummary || `来自 ${result.file_name} 的题库导入结果`,
          "AI 导入",
          new Date().toISOString(),
        ]
      );

      for (const q of result.questions) {
        const id = genId();
        await database.runAsync(
          "INSERT INTO questions (id, user_id, cat, q, a, source, source_document_id) VALUES (?, 'local', ?, ?, ?, ?, ?)",
          [id, q.cat, q.q, q.a, q.source || "", q.source_document_id || null]
        );
        await database.runAsync(
          "INSERT INTO card_progress (id, user_id, question_id, level) VALUES (?, 'local', ?, 0)",
          [genId(), id]
        );
      }

      Alert.alert("导入成功", `成功导入 ${result.imported} 道题`);
      setShowPreview(false);
      setPreviewData(null);
      await loadData();
    } catch (e: any) {
      Alert.alert("确认失败", e.message);
    }
  };

  const saveQuestion = async (draft: EditableQuestion) => {
    const database = await getDb();
    if (draft.id) {
      await database.runAsync("UPDATE questions SET cat = ?, q = ?, a = ? WHERE id = ?", [draft.cat, draft.q, draft.a, draft.id]);
    } else {
      const id = genId();
      await database.runAsync(
        "INSERT INTO questions (id, user_id, cat, q, a, source_document_id) VALUES (?, ?, ?, ?, ?, NULL)",
        [id, "local", draft.cat, draft.q, draft.a]
      );
      await database.runAsync(
        "INSERT INTO card_progress (id, user_id, question_id, level) VALUES (?, 'local', ?, 0)",
        [genId(), id]
      );
    }
    setShowQuestionEditor(false);
    setEditingQuestion(null);
    await loadData();
  };

  const deleteQuestion = async () => {
    if (!editingQuestion?.id) return;
    Alert.alert("删除题目？", "该题目的学习进度也会一并删除。", [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          const database = await getDb();
          await database.runAsync("DELETE FROM card_progress WHERE question_id = ?", [editingQuestion.id]);
          await database.runAsync("DELETE FROM questions WHERE id = ?", [editingQuestion.id]);
          setShowQuestionEditor(false);
          setEditingQuestion(null);
          await loadData();
        },
      },
    ]);
  };

  const filteredQuestions = questions.filter((question) => {
    if (sourceFilter === "document") return Boolean(question.source_document_id);
    if (sourceFilter === "standalone") return !question.source_document_id;
    return true;
  });

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.titleRow}>
        <TouchableOpacity style={[styles.menuButton, { backgroundColor: surface }]} onPress={() => setShowLibraryMenu(true)} accessibilityLabel="打开知识库侧边栏">
          <Text style={[styles.menuIcon, { color: c }]}>☰</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c }]}>{activeTab === "knowledge" ? "文档库" : "题库"}</Text>
      </View>

      {activeTab === "questions" ? (
        <View style={styles.questionToolbar}>
          <View style={styles.filterRow}>
            {(["all", "document", "standalone"] as SourceFilter[]).map((filter) => (
              <TouchableOpacity
                key={filter}
                style={[styles.filterButton, sourceFilter === filter && { backgroundColor: colors.primary }]}
                onPress={() => setSourceFilter(filter)}
              >
                <Text style={[styles.filterText, { color: sourceFilter === filter ? "#fff" : c }]}>
                  {filter === "all" ? "全部" : filter === "document" ? "文档题" : "独立题"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: colors.primary }]}
            onPress={() => { setEditingQuestion(null); setShowQuestionEditor(true); }}
          >
            <Text style={styles.addButtonText}>+ 新增</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {activeTab === "questions" ? (
        <ScrollView style={styles.listArea}>
          {filteredQuestions.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: surface }]}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>暂无题目</Text>
            </View>
          ) : filteredQuestions.map((question) => (
            <TouchableOpacity
              key={question.id}
              style={[styles.qCard, { backgroundColor: surface }]}
              onPress={() => { setEditingQuestion(question); setShowQuestionEditor(true); }}
            >
              <Text style={[styles.qCat, { color: colors.primary }]}>{question.cat}</Text>
              <Text style={[styles.qText, { color: c }]} numberOfLines={3}>{question.q}</Text>
              <Text style={[styles.qSource, { color: colors.textTertiary }]}>{question.source_document_id ? "关联文档题目" : "独立题目"}</Text>
            </TouchableOpacity>
          ))}
          <View style={{ height: 32 }} />
        </ScrollView>
      ) : uploading ? (
        <View style={[styles.uploadingCard, { backgroundColor: surface }]}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={[styles.uploadingText, { color: colors.textSecondary }]}>正在上传并生成题目...</Text>
        </View>
      ) : null}

      {activeTab === "knowledge" ? <ScrollView style={styles.listArea}>
        {docs.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: surface }]}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>知识库为空</Text>
          </View>
        ) : (
          docs.map((doc) => (
            <TouchableOpacity
              key={doc.id}
              style={[styles.docCard, { backgroundColor: surface }]}
              activeOpacity={0.8}
              onPress={() => router.push({ pathname: "/(tabs)/doc-reader", params: { id: doc.id } })}
            >
              <View style={styles.docHeader}>
                <Text style={[styles.docCat, { color: colors.primary }]}>{doc.cat}</Text>
                <Text style={[styles.docSource, { color: colors.textTertiary }]}>{doc.source}</Text>
                <TouchableOpacity
                  style={[styles.practiceLink, { backgroundColor: doc.questionCount > 0 ? colors.primaryLight : colors.border }]}
                  disabled={doc.questionCount === 0}
                  onPress={() => router.push({ pathname: "/(tabs)/study", params: { documentId: doc.id, documentTitle: doc.title } })}
                >
                  <Text style={[styles.practiceLinkText, { color: doc.questionCount > 0 ? colors.primary : colors.textTertiary }]}>关联题库</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.docTitle, { color: c }]}>{doc.title}</Text>
              <Text style={[styles.docMeta, { color: colors.textTertiary }]}>{doc.questionCount} 道关联题目</Text>
              {doc.last_read_at ? <View style={styles.readingTrack}><View style={[styles.readingFill, { width: `${Math.min(100, Math.max(0, doc.reading_progress ?? 0))}%` }]} /></View> : null}
              <Text style={[styles.docArrow, { color: colors.primary }]}>阅读全文 →</Text>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 32 }} />
      </ScrollView> : null}

      {activeTab === "knowledge" && !uploading ? (
        <View style={styles.floatingUpload}>
          <FilePicker onFileSelected={handleFileSelected} label="＋" isDark={isDark} floating />
        </View>
      ) : null}

      <Modal visible={showLibraryMenu} transparent animationType="fade" onRequestClose={() => setShowLibraryMenu(false)}>
        <TouchableOpacity style={styles.drawerBackdrop} activeOpacity={1} onPress={() => setShowLibraryMenu(false)}>
          <View style={[styles.drawer, { backgroundColor: surface }]}>
            <Text style={[styles.drawerTitle, { color: c }]}>知识库</Text>
            <TouchableOpacity style={[styles.drawerItem, activeTab === "knowledge" && { backgroundColor: colors.primaryLight }]} onPress={() => { setActiveTab("knowledge"); setShowLibraryMenu(false); }}>
              <Text style={[styles.drawerItemText, { color: c }]}>文档</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.drawerItem, activeTab === "questions" && { backgroundColor: colors.primaryLight }]} onPress={() => { setActiveTab("questions"); setShowLibraryMenu(false); }}>
              <Text style={[styles.drawerItemText, { color: c }]}>题库（待开发）</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <UploadPreviewModal
        visible={showPreview}
        onClose={() => { setShowPreview(false); setPreviewData(null); }}
        previewData={previewData}
        onConfirm={handleConfirm}
        uploading={false}
      />
      <QuestionEditor
        visible={showQuestionEditor}
        question={editingQuestion}
        onClose={() => { setShowQuestionEditor(false); setEditingQuestion(null); }}
        onSave={saveQuestion}
        onDelete={editingQuestion ? deleteQuestion : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: "700" },
  menuButton: { width: 38, height: 38, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  menuIcon: { fontSize: 22, fontWeight: "600" },
  segmentRow: { flexDirection: "row", borderRadius: 10, padding: 3, marginBottom: 12 },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  segmentText: { fontSize: 14, fontWeight: "600" },
  questionToolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  filterRow: { flexDirection: "row", gap: 6 },
  filterButton: { borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  filterText: { fontSize: 12, fontWeight: "600" },
  addButton: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  addButtonText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  uploadingCard: { borderRadius: 10, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 },
  uploadingText: { fontSize: 13 },
  listArea: { flex: 1, marginTop: 8 },
  emptyCard: { borderRadius: 12, padding: 32, alignItems: "center", marginTop: 20 },
  emptyText: { fontSize: 16 },
  emptySubtext: { fontSize: 13, marginTop: 6 },
  qCard: { borderRadius: 10, padding: 14, marginBottom: 8 },
  qCat: { fontSize: 11, fontWeight: "600", marginBottom: 4 },
  qText: { fontSize: 14, lineHeight: 20 },
  qSource: { fontSize: 11, marginTop: 6 },
  docCard: { borderRadius: 12, padding: 18, marginBottom: 10 },
  docHeader: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 6 },
  docCat: { fontSize: 11, fontWeight: "600", backgroundColor: "#e8ece4", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, overflow: "hidden" },
  docSource: { fontSize: 11 },
  practiceLink: { marginLeft: "auto", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6 },
  practiceLinkText: { fontSize: 11, fontWeight: "600" },
  docTitle: { fontSize: 16, fontWeight: "600", lineHeight: 22, marginBottom: 8 },
  docMeta: { fontSize: 12, marginBottom: 8 },
  docArrow: { fontSize: 13, fontWeight: "500" },
  readingTrack: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: "hidden", marginBottom: 10 },
  readingFill: { height: "100%", borderRadius: 2, backgroundColor: colors.primary },
  floatingUpload: { position: "absolute", right: 24, bottom: 24 },
  drawerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  drawer: { width: "72%", height: "100%", paddingTop: 64, paddingHorizontal: 20 },
  drawerTitle: { fontSize: 22, fontWeight: "700", marginBottom: 20 },
  drawerItem: { paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, marginBottom: 8 },
  drawerItemText: { fontSize: 16, fontWeight: "600" },
});
