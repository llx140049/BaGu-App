import { useEffect, useState } from "react";
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useThemeStore } from "../store/useThemeStore";
import { colors } from "../tokens/colors";
import { normalizeTagPath, parseQuestionTags } from "../data/tagging";

export interface EditableQuestion {
  id?: string;
  cat: string;
  q: string;
  a: string;
  tags?: string[];
}

interface QuestionEditorProps {
  visible: boolean;
  question: EditableQuestion | null;
  onClose: () => void;
  onSave: (question: EditableQuestion) => Promise<void>;
  onDelete?: () => Promise<void>;
  categories?: string[];
}

export default function QuestionEditor({ visible, question, onClose, onSave, onDelete, categories = [] }: QuestionEditorProps) {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === "dark";
  const surface = isDark ? colors.surfaceDark : colors.surface;
  const textColor = isDark ? colors.textDark : colors.text;
  const borderColor = isDark ? colors.borderDark : colors.border;
  const [draft, setDraft] = useState<EditableQuestion>({ cat: "", q: "", a: "", tags: [] });
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (visible) {
      const next = question ?? { cat: "", q: "", a: "", tags: [] };
      const tags = parseQuestionTags(next.tags, next.cat);
      setDraft({ ...next, cat: tags[0] ?? next.cat, tags });
      setTagInput("");
    }
  }, [question, visible]);

  const addTag = (value = tagInput) => {
    const tag = normalizeTagPath(value);
    if (!tag) return;
    setDraft((current) => {
      const tags = Array.from(new Set([...(current.tags ?? []), tag]));
      return { ...current, cat: tags[0] ?? "", tags };
    });
    setTagInput("");
  };

  const removeTag = (tag: string) => setDraft((current) => {
    const tags = (current.tags ?? []).filter((item) => item !== tag);
    return { ...current, cat: tags[0] ?? "", tags };
  });

  const save = async () => {
    const next = {
      ...draft,
      tags: Array.from(new Set((draft.tags ?? []).map(normalizeTagPath).filter(Boolean))),
      q: draft.q.trim(),
      a: draft.a.trim(),
    };
    next.cat = next.tags[0] ?? "";
    if (!next.tags.length || !next.q || !next.a) return;
    await onSave(next);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: surface }]}>
          <Text style={[styles.title, { color: textColor }]}>{question?.id ? "编辑题目" : "新增题目"}</Text>
          <Text style={[styles.categoryLabel, { color: colors.textSecondary }]}>标签（可多选，最多两级）</Text>
          <View style={styles.tagInputRow}>
            <TextInput
              style={[styles.input, styles.tagInput, { color: textColor, borderColor }]}
              value={tagInput}
              onChangeText={setTagInput}
              onSubmitEditing={() => addTag()}
              placeholder="例如：后端开发/Redis"
              placeholderTextColor={colors.textTertiary}
              returnKeyType="done"
            />
            <TouchableOpacity style={styles.addTagButton} onPress={() => addTag()}><Text style={styles.addTagText}>添加</Text></TouchableOpacity>
          </View>
          {(draft.tags?.length ?? 0) > 0 ? <View style={styles.selectedTags}>
            {draft.tags?.map((tag) => <TouchableOpacity key={tag} style={styles.selectedTag} onPress={() => removeTag(tag)}><Text style={styles.selectedTagText}>{tag} ×</Text></TouchableOpacity>)}
          </View> : null}
          {categories.length > 0 ? (
            <View>
              <Text style={[styles.categoryLabel, { color: colors.textSecondary }]}>已有标签</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>
                {categories.map((category) => (
                  <TouchableOpacity
                    key={category}
                    style={[styles.categoryChip, { backgroundColor: draft.tags?.includes(category) ? colors.primaryLight : (isDark ? "#2a342a" : "#e8ece4") }]}
                    onPress={() => draft.tags?.includes(category) ? removeTag(category) : addTag(category)}
                  >
                    <Text style={[styles.categoryChipText, { color: draft.tags?.includes(category) ? colors.primary : textColor }]}>{category}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}
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
  tagInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tagInput: { flex: 1 },
  addTagButton: { backgroundColor: colors.primary, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 9 },
  addTagText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  selectedTags: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: -2 },
  selectedTag: { backgroundColor: colors.primaryLight, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  selectedTagText: { color: colors.primary, fontSize: 12, fontWeight: "600" },
  categoryLabel: { fontSize: 12, marginBottom: 6 },
  categoryList: { gap: 8, paddingRight: 12 },
  categoryChip: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  categoryChipText: { fontSize: 12, fontWeight: "600" },
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
