import { useEffect, useState } from "react";
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { useThemeStore } from "../store/useThemeStore";
import { colors } from "../tokens/colors";

export interface EditableQuestion {
  id?: string;
  cat: string;
  q: string;
  a: string;
}

interface QuestionEditorProps {
  visible: boolean;
  question: EditableQuestion | null;
  onClose: () => void;
  onSave: (question: EditableQuestion) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export default function QuestionEditor({ visible, question, onClose, onSave, onDelete }: QuestionEditorProps) {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === "dark";
  const surface = isDark ? colors.surfaceDark : colors.surface;
  const textColor = isDark ? colors.textDark : colors.text;
  const borderColor = isDark ? colors.borderDark : colors.border;
  const [draft, setDraft] = useState<EditableQuestion>({ cat: "", q: "", a: "" });

  useEffect(() => {
    if (visible) setDraft(question ?? { cat: "", q: "", a: "" });
  }, [question, visible]);

  const save = async () => {
    const next = { ...draft, cat: draft.cat.trim(), q: draft.q.trim(), a: draft.a.trim() };
    if (!next.cat || !next.q || !next.a) return;
    await onSave(next);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: surface }]}>
          <Text style={[styles.title, { color: textColor }]}>{question?.id ? "编辑题目" : "新增题目"}</Text>
          <TextInput
            style={[styles.input, { color: textColor, borderColor }]}
            value={draft.cat}
            onChangeText={(cat) => setDraft({ ...draft, cat })}
            placeholder="分类，例如：JavaScript"
            placeholderTextColor={colors.textTertiary}
          />
          <TextInput
            style={[styles.input, styles.multiline, { color: textColor, borderColor }]}
            value={draft.q}
            onChangeText={(q) => setDraft({ ...draft, q })}
            placeholder="题目"
            placeholderTextColor={colors.textTertiary}
            multiline
          />
          <TextInput
            style={[styles.input, styles.multiline, { color: textColor, borderColor }]}
            value={draft.a}
            onChangeText={(a) => setDraft({ ...draft, a })}
            placeholder="答案"
            placeholderTextColor={colors.textTertiary}
            multiline
          />
          <View style={styles.actions}>
            {question?.id && onDelete ? (
              <TouchableOpacity style={styles.deleteButton} onPress={onDelete}>
                <Text style={styles.deleteText}>删除</Text>
              </TouchableOpacity>
            ) : null}
            <View style={styles.rightActions}>
              <TouchableOpacity style={styles.button} onPress={onClose}>
                <Text style={[styles.cancelText, { color: colors.textSecondary }]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={save}>
                <Text style={styles.saveText}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  multiline: { minHeight: 88, textAlignVertical: "top" },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  rightActions: { flexDirection: "row", gap: 8, marginLeft: "auto" },
  button: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  saveButton: { backgroundColor: colors.primary },
  cancelText: { fontSize: 14, fontWeight: "600" },
  saveText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  deleteButton: { paddingVertical: 10, paddingHorizontal: 4 },
  deleteText: { color: colors.danger, fontSize: 14, fontWeight: "600" },
});
