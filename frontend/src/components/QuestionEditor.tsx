import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus, X } from "lucide-react-native";
import { useThemeStore } from "../store/useThemeStore";
import { colors } from "../tokens/colors";
import { normalizeTagPath, parseQuestionTags, topLevelTag } from "../data/tagging";
import MarkdownDocument from "./MarkdownDocument";

export interface EditableQuestion {
  id?: string;
  cat: string;
  q: string;
  a: string;
  tags?: string[];
}

interface QuestionEditorProps {
  question: EditableQuestion;
  onClose: () => void;
  onSave: (question: EditableQuestion) => Promise<void>;
  onDelete?: () => Promise<void>;
  onDuplicate?: () => Promise<void>;
  isFavorite?: boolean;
  onToggleFavorite?: () => Promise<void>;
  categories?: string[];
}

export default function QuestionEditor({ question, onClose, onSave, onDelete, onDuplicate, isFavorite = false, onToggleFavorite, categories = [] }: QuestionEditorProps) {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === "dark";
  const surface = isDark ? colors.surfaceDark : colors.surface;
  const textColor = isDark ? colors.textDark : colors.text;
  const borderColor = isDark ? colors.borderDark : colors.border;
  const [draft, setDraft] = useState<EditableQuestion>(question);
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectedPrimary, setSelectedPrimary] = useState<string | null>(null);
  const [answerPreview, setAnswerPreview] = useState(false);
  const [answerHeight, setAnswerHeight] = useState(172);
  const [moreVisible, setMoreVisible] = useState(false);
  const [createdTags, setCreatedTags] = useState<string[]>([]);
  const [creationMode, setCreationMode] = useState<"primary" | "secondary" | null>(null);
  const [newTagName, setNewTagName] = useState("");

  useEffect(() => {
    const tags = parseQuestionTags(question.tags, question.cat);
    setDraft({ ...question, cat: tags[0] ?? question.cat, tags });
    setAnswerPreview(false);
    setAnswerHeight(172);
  }, [question]);

  const allCategories = useMemo(() => Array.from(new Set([...categories, ...createdTags])), [categories, createdTags]);
  const primaryTags = useMemo(() => Array.from(new Set(allCategories.map(topLevelTag))).sort((a, b) => a.localeCompare(b, "zh-CN")), [allCategories]);
  const secondaryTags = useMemo(() => selectedPrimary ? Array.from(new Set(allCategories
    .filter((tag) => tag.startsWith(`${selectedPrimary}/`))
    .map((tag) => tag.split("/")[1])
    .filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN")) : [], [allCategories, selectedPrimary]);
  const hasChanges = useMemo(() => JSON.stringify({
    tags: [...(draft.tags ?? [])].map(normalizeTagPath).filter(Boolean).sort(), q: draft.q.trim(), a: draft.a.trim(),
  }) !== JSON.stringify({
    tags: parseQuestionTags(question.tags, question.cat).sort(), q: question.q.trim(), a: question.a.trim(),
  }), [draft, question]);

  const addTag = (tag: string) => {
    const normalized = normalizeTagPath(tag);
    if (!normalized) return;
    setDraft((current) => {
      const tags = Array.from(new Set([...(current.tags ?? []), normalized]));
      return { ...current, cat: tags[0] ?? "", tags };
    });
    setSelectorVisible(false);
    setSelectedPrimary(null);
  };
  const removeTag = (tag: string) => setDraft((current) => {
    const tags = (current.tags ?? []).filter((item) => item !== tag);
    return { ...current, cat: tags[0] ?? "", tags };
  });
  const submitNewTag = () => {
    const name = topLevelTag(newTagName);
    const tag = creationMode === "secondary" && selectedPrimary ? `${selectedPrimary}/${name}` : name;
    if (!name || !tag) return;
    const normalized = normalizeTagPath(tag);
    setCreatedTags((current) => Array.from(new Set([...current, normalized])));
    setCreationMode(null);
    setNewTagName("");
    addTag(normalized);
  };
  const save = async () => {
    const tags = Array.from(new Set((draft.tags ?? []).map(normalizeTagPath).filter(Boolean)));
    if (!tags.length || !draft.q.trim() || !draft.a.trim()) return;
    await onSave({ ...draft, cat: tags[0], tags, q: draft.q.trim(), a: draft.a.trim() });
  };
  const requestClose = () => {
    if (!hasChanges) { onClose(); return; }
    Alert.alert("放弃修改？", "未保存的内容将不会保留。", [
      { text: "继续编辑", style: "cancel" },
      { text: "放弃", style: "destructive", onPress: onClose },
    ]);
  };
  const confirmDelete = () => Alert.alert("删除题目？", "删除后无法恢复。", [
    { text: "取消", style: "cancel" },
    { text: "删除", style: "destructive", onPress: onDelete },
  ]);
  return <View style={[styles.page, { backgroundColor: isDark ? colors.bgDark : colors.bg }]}>
    <View style={[styles.header, { borderBottomColor: borderColor }]}>
      <TouchableOpacity accessibilityLabel="返回" style={styles.headerButton} onPress={requestClose}><ChevronLeft size={24} color={textColor} /></TouchableOpacity>
      <Text style={[styles.headerTitle, { color: textColor }]}>编辑题目</Text>
      <View style={styles.headerActions}><TouchableOpacity accessibilityLabel="更多" style={styles.moreButton} onPress={() => setMoreVisible(true)}><MoreHorizontal size={22} color={colors.textSecondary} /></TouchableOpacity><TouchableOpacity style={styles.saveHeaderButton} onPress={save}><Text style={styles.saveHeaderText}>完成</Text></TouchableOpacity></View>
    </View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.label, styles.tagLabel, { color: colors.textSecondary }]}>标签</Text>
      <View style={styles.tagArea}>
        {(draft.tags?.length ?? 0) > 0 ? draft.tags?.map((tag) => <TouchableOpacity key={tag} style={styles.tagChip} onPress={() => removeTag(tag)}><Text style={styles.tagChipText}>{tag}</Text><X size={13} color={colors.primary} strokeWidth={2.5} /></TouchableOpacity>) : <Text style={[styles.emptyTags, { color: colors.textTertiary }]}>尚未添加标签</Text>}
        <TouchableOpacity style={[styles.addTagChip, { borderColor }]} onPress={() => setSelectorVisible(true)}><Plus size={15} color={colors.primary} /><Text style={styles.addTagText}>添加标签</Text></TouchableOpacity>
      </View>
      <Text style={[styles.label, styles.sectionLabel, { color: colors.textSecondary }]}>题目</Text>
      <TextInput style={[styles.editor, styles.contentCard, styles.questionEditor, { color: textColor }]} value={draft.q} onChangeText={(q) => setDraft({ ...draft, q })} placeholder="输入题目" placeholderTextColor={colors.textTertiary} multiline textAlignVertical="top" />
      <View style={styles.answerHeader}><Text style={[styles.label, styles.answerLabel, { color: colors.textSecondary }]}>答案</Text><View style={styles.previewToggle}><TouchableOpacity style={[styles.toggleOption, !answerPreview && styles.toggleActive]} onPress={() => setAnswerPreview(false)}><Text style={[styles.toggleText, !answerPreview && styles.toggleTextActive]}>编辑</Text></TouchableOpacity><TouchableOpacity style={[styles.toggleOption, answerPreview && styles.toggleActive]} onPress={() => setAnswerPreview(true)}><Text style={[styles.toggleText, answerPreview && styles.toggleTextActive]}>预览</Text></TouchableOpacity></View></View>
      {answerPreview ? <View style={styles.previewCard}><MarkdownDocument markdown={draft.a || "暂无答案内容"} /></View> : <TextInput style={[styles.editor, styles.contentCard, styles.answerEditor, { color: textColor, height: answerHeight }]} value={draft.a} onChangeText={(a) => setDraft({ ...draft, a })} onContentSizeChange={(event) => setAnswerHeight(Math.max(172, event.nativeEvent.contentSize.height + 32))} placeholder="支持 Markdown 和 LaTeX：$...$、$$...$$" placeholderTextColor={colors.textTertiary} multiline textAlignVertical="top" />}
    </ScrollView>
    <Modal visible={moreVisible} transparent animationType="fade" onRequestClose={() => setMoreVisible(false)}>
      <Pressable style={styles.moreOverlay} onPress={() => setMoreVisible(false)}>
        <Pressable style={[styles.moreMenu, { backgroundColor: surface }]} onPress={() => undefined}>
          {onToggleFavorite ? <TouchableOpacity style={styles.moreMenuRow} onPress={() => { setMoreVisible(false); onToggleFavorite(); }}><Text style={[styles.moreMenuText, { color: textColor }]}>{isFavorite ? "取消收藏" : "收藏"}</Text></TouchableOpacity> : null}
          {onDuplicate ? <TouchableOpacity style={styles.moreMenuRow} onPress={() => { setMoreVisible(false); onDuplicate(); }}><Text style={[styles.moreMenuText, { color: textColor }]}>复制题目</Text></TouchableOpacity> : null}
          {onDelete ? <TouchableOpacity style={styles.moreMenuRow} onPress={() => { setMoreVisible(false); confirmDelete(); }}><Text style={styles.deleteMenuText}>删除题目</Text></TouchableOpacity> : null}
        </Pressable>
      </Pressable>
    </Modal>
    <Modal visible={selectorVisible} transparent animationType="fade" onRequestClose={() => { setSelectorVisible(false); setSelectedPrimary(null); }}>
      <Pressable style={styles.selectorOverlay} onPress={() => { setSelectorVisible(false); setSelectedPrimary(null); }}>
        <Pressable style={[styles.selector, { backgroundColor: surface }]} onPress={() => undefined}>
          <View style={styles.selectorHeader}>{selectedPrimary ? <TouchableOpacity onPress={() => setSelectedPrimary(null)}><ChevronLeft size={21} color={textColor} /></TouchableOpacity> : <View style={styles.selectorBackPlaceholder} />}<Text style={[styles.selectorTitle, { color: textColor }]}>{selectedPrimary ?? "选择一级标签"}</Text><TouchableOpacity onPress={() => { setSelectorVisible(false); setSelectedPrimary(null); }}><X size={20} color={colors.textSecondary} /></TouchableOpacity></View>
          <ScrollView contentContainerStyle={styles.selectorList} showsVerticalScrollIndicator={false}>
            {!selectedPrimary ? <><TouchableOpacity style={styles.newTagRow} onPress={() => { setNewTagName(""); setCreationMode("primary"); }}><Plus size={18} color={colors.primary} /><Text style={styles.newTagText}>新增一级标签</Text></TouchableOpacity>{primaryTags.map((tag) => <TouchableOpacity key={tag} style={styles.selectorRow} onPress={() => setSelectedPrimary(tag)}><Text style={[styles.selectorText, { color: textColor }]}>{tag}</Text><ChevronRight size={18} color={colors.textSecondary} /></TouchableOpacity>)}</> : <><TouchableOpacity style={styles.newTagRow} onPress={() => { setNewTagName(""); setCreationMode("secondary"); }}><Plus size={18} color={colors.primary} /><Text style={styles.newTagText}>新增二级标签</Text></TouchableOpacity><TouchableOpacity style={styles.selectorRow} onPress={() => addTag(selectedPrimary)}><Text style={[styles.selectorText, { color: textColor }]}>仅使用“{selectedPrimary}”</Text><Plus size={18} color={colors.primary} /></TouchableOpacity>{secondaryTags.map((tag) => <TouchableOpacity key={tag} style={styles.selectorRow} onPress={() => addTag(`${selectedPrimary}/${tag}`)}><Text style={[styles.selectorText, { color: textColor }]}>{tag}</Text><Plus size={18} color={colors.primary} /></TouchableOpacity>)}</>}
            {!selectedPrimary && primaryTags.length === 0 ? <Text style={[styles.emptySelector, { color: colors.textSecondary }]}>暂无可选标签</Text> : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
    <Modal visible={creationMode !== null} transparent animationType="fade" onRequestClose={() => setCreationMode(null)}>
      <View style={styles.creationOverlay}>
        <View style={[styles.creationDialog, { backgroundColor: surface }]}>
          <Text style={[styles.creationTitle, { color: textColor }]}>新增{creationMode === "secondary" ? "二级" : "一级"}标签</Text>
          <TextInput style={[styles.creationInput, { color: textColor, borderColor }]} value={newTagName} onChangeText={setNewTagName} placeholder="输入标签名称" placeholderTextColor={colors.textTertiary} autoFocus returnKeyType="done" onSubmitEditing={submitNewTag} />
          <View style={styles.creationActions}><TouchableOpacity style={styles.creationButton} onPress={() => setCreationMode(null)}><Text style={[styles.creationCancel, { color: colors.textSecondary }]}>取消</Text></TouchableOpacity><TouchableOpacity style={styles.creationButton} onPress={submitNewTag}><Text style={styles.creationConfirm}>添加</Text></TouchableOpacity></View>
        </View>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, header: { height: 58, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth }, headerButton: { width: 40, height: 42, alignItems: "flex-start", justifyContent: "center", zIndex: 1 }, headerTitle: { position: "absolute", left: 84, right: 84, textAlign: "center", fontFamily: "MiSans-Medium", fontSize: 17 }, headerActions: { marginLeft: "auto", flexDirection: "row", alignItems: "center", zIndex: 1 }, moreButton: { width: 36, height: 42, alignItems: "center", justifyContent: "center" }, saveHeaderButton: { width: 40, height: 42, alignItems: "flex-end", justifyContent: "center" }, saveHeaderText: { color: colors.primary, fontFamily: "MiSans-Medium", fontSize: 16 }, content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 }, label: { fontFamily: "MiSans-Regular", fontSize: 13, marginBottom: 10 }, tagLabel: { marginTop: 4 }, sectionLabel: { marginTop: 28 }, answerHeader: { marginTop: 28, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, answerLabel: { marginBottom: 10 }, tagArea: { flexDirection: "row", flexWrap: "wrap", gap: 8, minHeight: 32, alignItems: "center" }, tagChip: { height: 32, backgroundColor: "#FFF4DF", borderRadius: 16, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 5 }, tagChipText: { color: colors.primary, fontFamily: "MiSans-Medium", fontSize: 13 }, addTagChip: { height: 32, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 4 }, addTagText: { color: colors.primary, fontFamily: "MiSans-Medium", fontSize: 13 }, emptyTags: { fontFamily: "MiSans-Regular", fontSize: 14 }, editor: { fontFamily: "MiSans-Regular", fontSize: 16, lineHeight: 26, textAlignVertical: "top" }, contentCard: { backgroundColor: "#F7F8FA", borderRadius: 12, padding: 16 }, questionEditor: { minHeight: 104 }, answerEditor: { minHeight: 172 }, previewCard: { backgroundColor: "#F7F8FA", borderRadius: 12, padding: 16, minHeight: 172 }, previewToggle: { flexDirection: "row", backgroundColor: "#F1F2F5", borderRadius: 8, padding: 2, marginBottom: 7 }, toggleOption: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 }, toggleActive: { backgroundColor: "#fff" }, toggleText: { color: colors.textSecondary, fontFamily: "MiSans-Medium", fontSize: 12 }, toggleTextActive: { color: colors.text }, moreOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.08)" }, moreMenu: { position: "absolute", top: 54, right: 16, width: 142, borderRadius: 12, paddingVertical: 4, shadowColor: "#171717", shadowOpacity: 0.12, shadowRadius: 16, elevation: 6 }, moreMenuRow: { minHeight: 46, justifyContent: "center", paddingHorizontal: 16 }, moreMenuText: { fontFamily: "MiSans-Regular", fontSize: 15 }, deleteMenuText: { color: colors.danger, fontFamily: "MiSans-Regular", fontSize: 15 }, selectorOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.24)", justifyContent: "flex-end" }, selector: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "58%", paddingBottom: 26 }, selectorHeader: { height: 58, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, selectorBackPlaceholder: { width: 21 }, selectorTitle: { fontFamily: "MiSans-Medium", fontSize: 16 }, selectorList: { paddingHorizontal: 20, paddingBottom: 10 }, newTagRow: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#eeeeF1" }, newTagText: { color: colors.primary, fontFamily: "MiSans-Medium", fontSize: 15 }, selectorRow: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#eeeeF1" }, selectorText: { fontFamily: "MiSans-Regular", fontSize: 16 }, emptySelector: { paddingVertical: 20, textAlign: "center", fontFamily: "MiSans-Regular" }, creationOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.28)", justifyContent: "center", padding: 28 }, creationDialog: { borderRadius: 16, padding: 20 }, creationTitle: { fontFamily: "MiSans-Medium", fontSize: 17, marginBottom: 14 }, creationInput: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontFamily: "MiSans-Regular", fontSize: 15 }, creationActions: { flexDirection: "row", justifyContent: "flex-end", gap: 14, marginTop: 16 }, creationButton: { paddingVertical: 7, paddingHorizontal: 4 }, creationCancel: { fontFamily: "MiSans-Medium", fontSize: 15 }, creationConfirm: { color: colors.primary, fontFamily: "MiSans-Medium", fontSize: 15 },
});
