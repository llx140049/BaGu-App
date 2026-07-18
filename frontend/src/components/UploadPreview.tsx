import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert } from "react-native";
import { Folder, Pencil } from "lucide-react-native";
import { useThemeStore } from "../store/useThemeStore";
import { colors } from "../tokens/colors";

interface QuestionItem {
  cat: string;
  q: string;
  a: string;
}

interface UploadPreviewProps {
  visible: boolean;
  onClose: () => void;
  previewData: {
    preview_token: string;
    file_name: string;
    file_type?: string;
    total: number;
    generate_questions?: boolean;
    content?: string;
    categories: { cat: string; count: number; questions: QuestionItem[] }[];
  } | null;
  onConfirm: (edits: { index: number; cat?: string; q?: string; a?: string; _deleted?: boolean }[], category: string) => void;
  uploading: boolean;
  directoryOptions?: string[];
}

export default function UploadPreviewModal({ visible, onClose, previewData, onConfirm, uploading, directoryOptions = [] }: UploadPreviewProps) {
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === "dark";
  const bg = isDark ? colors.bgDark : colors.bg;
  const surface = isDark ? colors.surfaceDark : colors.surface;
  const c = isDark ? colors.textDark : colors.text;

  // Flatten all questions with original indices
  const allQuestions = previewData
    ? previewData.categories.flatMap((cat) => cat.questions)
    : [];
  const generatesQuestions = previewData?.generate_questions !== false;
  const isConvertedPdf = previewData?.file_type === "pdf";

  const [edits, setEdits] = useState<Record<number, { cat?: string; q?: string; a?: string; _deleted?: boolean }>>({});
  const [draftCategory, setDraftCategory] = useState("");
  const [previewTab, setPreviewTab] = useState<"content" | "questions">("content");

  useEffect(() => {
    if (previewData) {
      setDraftCategory("");
      setEdits({});
      setPreviewTab("content");
    }
  }, [previewData?.preview_token]);

  // Reset edits when new preview data arrives
  if (previewData && Object.keys(edits).length === 0 && allQuestions.length > 0) {
    // Only set once
  }

  const handleEdit = (idx: number, field: string, value: string) => {
    setEdits((prev) => ({
      ...prev,
      [idx]: { ...prev[idx], [field]: value },
    }));
  };

  const handleDelete = (idx: number) => {
    setEdits((prev) => ({
      ...prev,
      [idx]: { ...prev[idx], _deleted: !prev[idx]?._deleted },
    }));
  };

  const handleConfirm = () => {
    const editList = Object.entries(edits)
      .filter(([, v]) => v.cat !== undefined || v.q !== undefined || v.a !== undefined || v._deleted !== undefined)
      .map(([idx, v]) => ({ index: parseInt(idx), ...v }));
    const category = draftCategory.split("/").map((part) => part.trim()).filter(Boolean).join("/");
    if (!category) return;
    onConfirm(editList, category);
  };

  if (!previewData) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: bg }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: surface }]}>
          <TouchableOpacity onPress={onClose}>
            <Text style={[styles.headerBtn, { color: colors.textSecondary }]}>取消</Text>
          </TouchableOpacity>
          <Text numberOfLines={1} style={[styles.headerTitle, { color: c }]}>{previewData.file_name}</Text>
          <TouchableOpacity onPress={handleConfirm} disabled={uploading || !draftCategory.trim()}>
            <Text style={[styles.headerBtn, { color: draftCategory.trim() ? colors.primary : colors.textTertiary, fontWeight: "700" }]}>
              {uploading ? "保存中..." : "确认"}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.list}>
          <View style={[styles.directoryEditor, { backgroundColor: surface }]}>
            <Text style={[styles.directoryLabel, { color: c }]}>保存位置</Text>
            <TextInput
              style={[styles.directoryInput, { color: c, borderColor: isDark ? colors.borderDark : colors.border }]}
              value={draftCategory}
              onChangeText={setDraftCategory}
              placeholder={"\u4f8b\u5982\uff1a\u9ad8\u7b49\u6570\u5b66/\u5fae\u5206\u5b66"}
              placeholderTextColor={colors.textTertiary}
            />
            {directoryOptions.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.directoryOptions}>
                {directoryOptions.map((category) => (
                  <TouchableOpacity
                    key={category}
                    style={[styles.directoryChip, draftCategory === category && styles.directoryChipSelected]}
                    onPress={() => setDraftCategory(category)}
                  >
                    <Folder size={14} color={draftCategory === category ? colors.document : colors.textSecondary} />
                    <Text style={[styles.directoryChipText, { color: draftCategory === category ? colors.document : c }]}>{category}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : null}
          </View>
          {generatesQuestions ? <View style={styles.previewTabs}><TouchableOpacity style={[styles.previewTab, previewTab === "content" && styles.previewTabActive]} onPress={() => setPreviewTab("content")}><Text style={[styles.previewTabText, previewTab === "content" && styles.previewTabTextActive]}>原文预览</Text></TouchableOpacity><TouchableOpacity style={[styles.previewTab, previewTab === "questions" && styles.previewTabActive]} onPress={() => setPreviewTab("questions")}><Text style={[styles.previewTabText, previewTab === "questions" && styles.previewTabTextActive]}>题目预览 ({allQuestions.filter((_, index) => !edits[index]?._deleted).length})</Text></TouchableOpacity></View> : null}
          {previewTab === "content" ? <View style={[styles.documentPreviewCard, { backgroundColor: surface }]}>
            {!generatesQuestions ? <Text style={[styles.documentPreviewHint, { color: colors.textSecondary }]}>{"\u786e\u8ba4\u540e\u5c06\u4ec5\u4fdd\u5b58\u539f\u6587\u6863\uff0c\u4e0d\u751f\u6210\u9898\u76ee\u3002"}</Text> : null}
            {isConvertedPdf
              ? <Text style={[styles.documentContent, { color: c }]}>PDF 将自动转换为保留原图的 Markdown 文档。确认导入后可浏览转换后的文档，也可在右上角菜单阅读原 PDF。</Text>
              : <Text style={[styles.documentContent, { color: c }]}>{previewData.content || "\u672a\u80fd\u83b7\u53d6\u539f\u6587\u5185\u5bb9\u3002"}</Text>}
          </View> : null}
          {previewTab === "questions" ? <>
          {allQuestions.map((q, idx) => {
            const edit = edits[idx] || {};
            const deleted = edit._deleted || false;
            const showCat = edit.cat ?? q.cat;
            const showQ = edit.q ?? q.q;
            const showA = edit.a ?? q.a;

            return (
              <View key={idx} style={[styles.qCard, { backgroundColor: surface, opacity: deleted ? 0.4 : 1 }]}>
                <View style={styles.qHeader}>
                  <View style={[styles.tagEditor, { backgroundColor: isDark ? "#3b2b20" : "#fff1e5" }]}><TextInput style={[styles.catInput, { color: colors.primary }]} value={showCat} onChangeText={(v) => handleEdit(idx, "cat", v)} editable={!deleted} /><Pencil size={13} color={colors.primary} /></View>
                  <TouchableOpacity onPress={() => handleDelete(idx)}>
                    <Text style={[styles.deleteBtn, { color: deleted ? colors.success : colors.danger }]}>
                      {deleted ? "恢复" : "删除"}
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>问题：</Text>
                <TextInput
                  style={[styles.textInput, { color: c, borderColor: isDark ? colors.borderDark : colors.border }]}
                  value={showQ}
                  onChangeText={(v) => handleEdit(idx, "q", v)}
                  multiline
                  editable={!deleted}
                />

                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>答案：</Text>
                <TextInput
                  style={[styles.textInput, { color: c, borderColor: isDark ? colors.borderDark : colors.border }]}
                  value={showA}
                  onChangeText={(v) => handleEdit(idx, "a", v)}
                  multiline
                  editable={!deleted}
                />
              </View>
            );
          })}</> : null}
          <View style={{ height: 48 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  headerBtn: { fontFamily: "MiSans-Medium", fontSize: 15 },
  headerTitle: { flex: 1, textAlign: "center", fontFamily: "MiSans-Semibold", fontSize: 17, marginHorizontal: 12 },
  list: { flex: 1, paddingHorizontal: 16 },
  directoryEditor: { borderRadius: 10, padding: 14, marginTop: 12 },
  directoryLabel: { fontFamily: "MiSans-Semibold", fontSize: 15, marginBottom: 8 },
  directoryInput: { fontFamily: "MiSans-Regular", borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  directoryOptions: { gap: 8, paddingTop: 10, paddingRight: 12 },
  directoryChip: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.iconBackground, borderWidth: 1, borderColor: "transparent" },
  directoryChipSelected: { borderColor: colors.document },
  directoryChipText: { fontFamily: "MiSans-Medium", fontSize: 12 },
  previewTabs: { flexDirection: "row", alignSelf: "flex-start", backgroundColor: "#f1f1f3", borderRadius: 12, padding: 3, marginTop: 14 },
  previewTab: { minHeight: 34, paddingHorizontal: 13, borderRadius: 9, justifyContent: "center" },
  previewTabActive: { backgroundColor: colors.surface },
  previewTabText: { color: colors.textSecondary, fontFamily: "MiSans-Medium", fontSize: 13 },
  previewTabTextActive: { color: colors.primary },
  documentPreviewCard: { borderRadius: 10, padding: 16, marginTop: 12, marginBottom: 8 },
  documentPreviewTitle: { fontFamily: "MiSans-Semibold", fontSize: 16, marginBottom: 6 },
  documentPreviewHint: { fontFamily: "MiSans-Regular", fontSize: 13, lineHeight: 20, marginBottom: 10 },
  documentContent: { fontFamily: "MiSans-Regular", fontSize: 14, lineHeight: 22 },
  questionPreviewTitle: { fontFamily: "MiSans-Semibold", fontSize: 16, marginTop: 12 },
  catTitle: { fontFamily: "MiSans-Semibold", fontSize: 16, marginTop: 12, marginBottom: 4 },
  qCard: { borderRadius: 10, padding: 14, marginBottom: 12 },
  qHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  tagEditor: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 5, paddingHorizontal: 8, minWidth: 80 },
  catInput: { flexShrink: 1, fontFamily: "MiSans-Medium", fontSize: 12, paddingVertical: 3 },
  deleteBtn: { fontFamily: "MiSans-Medium", fontSize: 13 },
  fieldLabel: { fontFamily: "MiSans-Regular", fontSize: 11, marginBottom: 4 },
  textInput: { fontFamily: "MiSans-Regular", fontSize: 14, borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 10, lineHeight: 20 },
});
