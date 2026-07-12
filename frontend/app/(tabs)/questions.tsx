import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useThemeStore } from "../../src/store/useThemeStore";
import { colors } from "../../src/tokens/colors";
import { getDb, insertSampleData } from "../../src/data/db";
import { genId } from "../../src/data/utils";
import { uploadApi } from "../../src/services/api";
import FilePicker from "../../src/components/FilePicker";
import UploadPreviewModal from "../../src/components/UploadPreview";

interface DocItem { id: string; title: string; cat: string; source: string; }
interface QItem { id: string; cat: string; q: string; }
type Tab = "questions" | "knowledge";

export default function QuestionsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === "dark";
  const c = isDark ? colors.textDark : colors.text;
  const bg = isDark ? colors.bgDark : colors.bg;
  const surface = isDark ? colors.surfaceDark : colors.surface;
  const segmentBg = isDark ? colors.surfaceDark : "#e8ece4";

  const [activeTab, setActiveTab] = useState<Tab>(params.tab === "knowledge" ? "knowledge" : "questions");
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [questions, setQuestions] = useState<QItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);

  const loadData = useCallback(async () => {
    await insertSampleData();
    const database = await getDb();
    const docRows: DocItem[] = await database.getAllAsync("SELECT id, title, cat, source FROM documents ORDER BY created_at");
    setDocs(docRows);
    const qRows: QItem[] = await database.getAllAsync("SELECT id, cat, q FROM questions ORDER BY cat");
    setQuestions(qRows);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleFileSelected = async (file: { uri: string; name: string; bytes: ArrayBuffer }) => {
    setUploading(true);
    try {
      const data: any = await uploadApi.uploadPdf(file);
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
      for (const q of result.questions) {
        const id = genId();
        await database.runAsync(
          "INSERT INTO questions (id, user_id, cat, q, a) VALUES (?, 'local', ?, ?, ?)",
          [id, q.cat, q.q, q.a]
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

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Text style={[styles.title, { color: c }]}>题库</Text>

      <View style={[styles.segmentRow, { backgroundColor: segmentBg }]}>
        <TouchableOpacity
          style={[styles.segment, activeTab === "questions" && { backgroundColor: colors.primary }]}
          onPress={() => setActiveTab("questions")}
        >
          <Text style={[styles.segmentText, { color: activeTab === "questions" ? "#fff" : c }]}>题目列表</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segment, activeTab === "knowledge" && { backgroundColor: colors.primary }]}
          onPress={() => setActiveTab("knowledge")}
        >
          <Text style={[styles.segmentText, { color: activeTab === "knowledge" ? "#fff" : c }]}>知识库</Text>
        </TouchableOpacity>
      </View>

      {uploading ? (
        <View style={[styles.uploadingCard, { backgroundColor: surface }]}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={[styles.uploadingText, { color: colors.textSecondary }]}>正在上传并生成题目...</Text>
        </View>
      ) : (
        <FilePicker
          onFileSelected={handleFileSelected}
          label="📄 上传 PDF / Markdown"
          isDark={isDark}
        />
      )}

      <ScrollView style={styles.listArea}>
        {activeTab === "questions" ? (
          questions.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: surface }]}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>暂无题目</Text>
              <Text style={[styles.emptySubtext, { color: colors.textTertiary }]}>点击上方按钮上传 PDF 或 Markdown</Text>
            </View>
          ) : (
            questions.map((q) => (
              <View key={q.id} style={[styles.qCard, { backgroundColor: surface }]}>
                <Text style={[styles.qCat, { color: colors.primary }]}>{q.cat}</Text>
                <Text style={[styles.qText, { color: c }]} numberOfLines={2}>{q.q}</Text>
              </View>
            ))
          )
        ) : docs.length === 0 ? (
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
              </View>
              <Text style={[styles.docTitle, { color: c }]}>{doc.title}</Text>
              <Text style={[styles.docArrow, { color: colors.primary }]}>阅读全文 →</Text>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      <UploadPreviewModal
        visible={showPreview}
        onClose={() => { setShowPreview(false); setPreviewData(null); }}
        previewData={previewData}
        onConfirm={handleConfirm}
        uploading={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: "700", marginTop: 16, marginBottom: 12 },
  segmentRow: { flexDirection: "row", borderRadius: 10, padding: 3, marginBottom: 12 },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  segmentText: { fontSize: 14, fontWeight: "600" },
  uploadingCard: { borderRadius: 10, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 },
  uploadingText: { fontSize: 13 },
  listArea: { flex: 1, marginTop: 8 },
  emptyCard: { borderRadius: 12, padding: 32, alignItems: "center", marginTop: 20 },
  emptyText: { fontSize: 16 },
  emptySubtext: { fontSize: 13, marginTop: 6 },
  qCard: { borderRadius: 10, padding: 14, marginBottom: 8 },
  qCat: { fontSize: 11, fontWeight: "600", marginBottom: 4 },
  qText: { fontSize: 14, lineHeight: 20 },
  docCard: { borderRadius: 12, padding: 18, marginBottom: 10 },
  docHeader: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 6 },
  docCat: { fontSize: 11, fontWeight: "600", backgroundColor: "#e8ece4", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, overflow: "hidden" },
  docSource: { fontSize: 11 },
  docTitle: { fontSize: 16, fontWeight: "600", lineHeight: 22, marginBottom: 8 },
  docArrow: { fontSize: 13, fontWeight: "500" },
});
