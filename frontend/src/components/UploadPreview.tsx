import { useState } from "react";
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
    categories: { cat: string; count: number; questions: QuestionItem[] }[];
  } | null;
  onConfirm: (edits: { index: number; cat?: string; q?: string; a?: string; _deleted?: boolean }[]) => void;
  uploading: boolean;
}

export default function UploadPreviewModal({ visible, onClose, previewData, onConfirm, uploading }: UploadPreviewProps) {
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === "dark";
  const bg = isDark ? colors.bgDark : colors.bg;
  const surface = isDark ? colors.surfaceDark : colors.surface;
  const c = isDark ? colors.textDark : colors.text;

  // Flatten all questions with original indices
  const allQuestions = previewData
    ? previewData.categories.flatMap((cat) => cat.questions)
    : [];

  const [edits, setEdits] = useState<Record<number, { cat?: string; q?: string; a?: string; _deleted?: boolean }>>({});

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
    onConfirm(editList);
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
          <Text style={[styles.headerTitle, { color: c }]}>AI 生成预览</Text>
          <TouchableOpacity onPress={handleConfirm} disabled={uploading}>
            <Text style={[styles.headerBtn, { color: colors.primary, fontWeight: "700" }]}>
              {uploading ? "提交中..." : `确认导入 (${allQuestions.filter((_, i) => !edits[i]?._deleted).length})`}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.fileName, { color: colors.textSecondary }]}>
          来源: {previewData.file_name}
        </Text>

        <ScrollView style={styles.list}>
          {previewData.categories.map((cat) => (
            <View key={cat.cat}>
              <Text style={[styles.catTitle, { color: colors.primary }]}>
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
                    style={[styles.catInput, { color: colors.primary, backgroundColor: isDark ? "#2a342a" : "#e8ece4" }]}
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
  catTitle: { fontSize: 16, fontWeight: "700", marginTop: 12, marginBottom: 4 },
  qCard: { borderRadius: 10, padding: 14, marginBottom: 12 },
  qHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  catInput: { fontSize: 12, fontWeight: "600", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, minWidth: 80 },
  deleteBtn: { fontSize: 13, fontWeight: "500" },
  fieldLabel: { fontSize: 11, marginBottom: 4 },
  textInput: { fontSize: 14, borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 10, lineHeight: 20 },
});
