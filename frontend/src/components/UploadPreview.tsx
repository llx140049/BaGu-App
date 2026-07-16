import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert } from "react-native";
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

  const [edits, setEdits] = useState<Record<number, { cat?: string; q?: string; a?: string; _deleted?: boolean }>>({});
  const [draftCategory, setDraftCategory] = useState("\u5bfc\u5165\u6587\u6863");

  useEffect(() => {
    if (previewData) {
      setDraftCategory("\u5bfc\u5165\u6587\u6863");
      setEdits({});
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
          <Text style={[styles.headerTitle, { color: c }]}>{generatesQuestions ? "AI 生成预览" : "文档导入预览"}</Text>
          <TouchableOpacity onPress={handleConfirm} disabled={uploading}>
            <Text style={[styles.headerBtn, { color: colors.document, fontWeight: "700" }]}>
              {uploading ? "提交中..." : `确认导入 (${allQuestions.filter((_, i) => !edits[i]?._deleted).length})`}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.fileName, { color: colors.textSecondary }]}>
          来源: {previewData.file_name}
        </Text>

        <ScrollView style={styles.list}>
          <View style={[styles.directoryEditor, { backgroundColor: surface }]}>
            <Text style={[styles.directoryLabel, { color: c }]}>{"\u5bfc\u5165\u76ee\u5f55"}</Text>
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
                    style={[styles.directoryChip, { backgroundColor: draftCategory === category ? colors.documentLight : (isDark ? "#2a342a" : "#e8ece4") }]}
                    onPress={() => setDraftCategory(category)}
                  >
                    <Text style={[styles.directoryChipText, { color: draftCategory === category ? colors.document : c }]}>{category}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : null}
          </View>
          <View style={[styles.documentPreviewCard, { backgroundColor: surface }]}>
            <Text style={[styles.documentPreviewTitle, { color: c }]}>{"\u539f\u6587\u9884\u89c8"}</Text>
            {!generatesQuestions ? (
              <Text style={[styles.documentPreviewHint, { color: colors.textSecondary }]}>{"\u786e\u8ba4\u540e\u5c06\u4ec5\u4fdd\u5b58\u539f\u6587\u6863\uff0c\u4e0d\u751f\u6210\u9898\u76ee\u3002"}</Text>
            ) : null}
            <Text style={[styles.documentContent, { color: c }]}>{previewData.content || "\u672a\u80fd\u83b7\u53d6\u539f\u6587\u5185\u5bb9\u3002"}</Text>
          </View>

          {generatesQuestions ? (
            <Text style={[styles.questionPreviewTitle, { color: c }]}>{"\u751f\u6210\u7684\u9898\u76ee"}</Text>
          ) : null}
          {previewData.categories.map((cat) => (
            <View key={cat.cat}>
              <Text style={[styles.catTitle, { color: colors.document }]}>
                {cat.cat} ({cat.count} 题)
              </Text>
            </View>
          ))}

          <View style={{ height: 8 }} />

          {allQuestions.map((q, idx) => {
            const edit = edits[idx] || {};
            const deleted = edit._deleted || false;
            const showCat = edit.cat ?? q.cat;
            const showQ = edit.q ?? q.q;
            const showA = edit.a ?? q.a;

            return (
              <View key={idx} style={[styles.qCard, { backgroundColor: surface, opacity: deleted ? 0.4 : 1 }]}>
                <View style={styles.qHeader}>
                  <TextInput
                    style={[styles.catInput, { color: colors.document, backgroundColor: isDark ? "#2a342a" : "#e8ece4" }]}
                    value={showCat}
                    onChangeText={(v) => handleEdit(idx, "cat", v)}
                    editable={!deleted}
                  />
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
          })}
          <View style={{ height: 48 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  headerBtn: { fontSize: 15 },
  headerTitle: { fontSize: 17, fontWeight: "600" },
  fileName: { fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 },
  list: { flex: 1, paddingHorizontal: 16 },
  directoryEditor: { borderRadius: 10, padding: 14, marginTop: 12 },
  directoryLabel: { fontSize: 15, fontWeight: "700", marginBottom: 8 },
  directoryInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  directoryOptions: { gap: 8, paddingTop: 10, paddingRight: 12 },
  directoryChip: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  directoryChipText: { fontSize: 12, fontWeight: "600" },
  documentPreviewCard: { borderRadius: 10, padding: 16, marginTop: 12, marginBottom: 8 },
  documentPreviewTitle: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  documentPreviewHint: { fontSize: 13, lineHeight: 20, marginBottom: 10 },
  documentContent: { fontSize: 14, lineHeight: 22 },
  questionPreviewTitle: { fontSize: 16, fontWeight: "700", marginTop: 12 },
  catTitle: { fontSize: 16, fontWeight: "700", marginTop: 12, marginBottom: 4 },
  qCard: { borderRadius: 10, padding: 14, marginBottom: 12 },
  qHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  catInput: { fontSize: 12, fontWeight: "600", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, minWidth: 80 },
  deleteBtn: { fontSize: 13, fontWeight: "500" },
  fieldLabel: { fontSize: 11, marginBottom: 4 },
  textInput: { fontSize: 14, borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 10, lineHeight: 20 },
});
