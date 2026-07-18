import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { BookOpen, CalendarDays, CheckCircle2, ChevronRight, Download, FolderCog, MoreHorizontal, PenLine, Play, Plus, Star, Tag, Trash2 } from "lucide-react-native";
import { getDb } from "../../src/data/db";
import { isCardDue, MASTERED_LEVEL } from "../../src/data/sm2";
import { colors } from "../../src/tokens/colors";
import { BackButton } from "../../src/components/PrototypeUI";
import StudyScopeBottomSheet, { StudyScope, StudyScopeOption } from "../../src/components/StudyScopeBottomSheet";
import { cardHasTag, normalizeTagPath, parseQuestionTags } from "../../src/data/tagging";
import { genId } from "../../src/data/utils";
import { getStudyPlan, saveStudyPlan } from "../../src/data/study-plan";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useThemeStore } from "../../src/store/useThemeStore";

interface DbCardRow { id: string; cat: string; q: string; a: string; tags?: string | null; level: number; incorrect: number; isStarred: number | boolean; lastReview?: string | null; nextReview?: string | null; }
interface CardRow extends DbCardRow { tagPaths: string[]; }
interface ChildTag { name: string; path: string; count: number; }

const scopeFor = (scope: StudyScope) => scope === "review" ? "review" : scope === "wrong" ? "mistakes" : scope === "favorite" ? "starred" : scope === "unlearned" ? "new" : "all";

export default function TopicDetailScreen() {
  const router = useRouter();
  const isDark = useThemeStore((state) => state.theme === "dark");
  const bg = isDark ? colors.bgDark : colors.bg;
  const surface = isDark ? colors.surfaceDark : colors.surface;
  const text = isDark ? colors.textDark : colors.text;
  const { topic } = useLocalSearchParams<{ topic: string }>();
  const title = topic || "专题";
  const [cards, setCards] = useState<CardRow[]>([]);
  const [scopeSheetVisible, setScopeSheetVisible] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState<"batch" | "export" | null>(null);
  const longPressTriggered = useRef(false);
  const [moreVisible, setMoreVisible] = useState(false);
  const [movePathVisible, setMovePathVisible] = useState(false);
  const [nextPath, setNextPath] = useState("");
  const [tagManagerVisible, setTagManagerVisible] = useState(false);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [exportVisible, setExportVisible] = useState(false);
  const [exportFormat, setExportFormat] = useState<"markdown" | "json">("markdown");

  const loadCards = useCallback(async () => {
    const database = await getDb();
    const rows: DbCardRow[] = await database.getAllAsync("SELECT q.id, q.cat, q.tags, q.q, q.a, COALESCE(cp.level, 0) AS level, COALESCE(cp.incorrect, 0) AS incorrect, COALESCE(cp.is_starred, 0) AS isStarred, cp.last_review AS lastReview, cp.next_review AS nextReview FROM questions q LEFT JOIN card_progress cp ON q.id = cp.question_id");
    const tagged = rows.map((card) => ({ ...card, tagPaths: parseQuestionTags(card.tags, card.cat) }));
    const scoped = tagged.filter((card) => cardHasTag(card.tagPaths, title));
    setCards(Array.from(new Map(scoped.map((card) => [card.id, card])).values()));
  }, [title]);

  useFocusEffect(useCallback(() => { loadCards().catch(() => setCards([])); }, [loadCards]));

  const childTags = useMemo<ChildTag[]>(() => {
    const prefix = `${title}/`;
    const grouped = new Map<string, Set<string>>();
    cards.forEach((card) => card.tagPaths.filter((tag) => tag.startsWith(prefix)).forEach((tag) => {
      const name = tag.slice(prefix.length).split("/")[0]?.trim();
      if (!name) return;
      const ids = grouped.get(name) ?? new Set<string>();
      ids.add(card.id);
      grouped.set(name, ids);
    }));
    return Array.from(grouped, ([name, ids]) => ({ name, count: ids.size, path: `${title}/${name}` })).sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  }, [cards, title]);
  const scopeOptions = useMemo<StudyScopeOption[]>(() => [
    { type: "all", label: "全部卡片", count: cards.length },
    { type: "review", label: "待复习", count: cards.filter((card) => card.level < MASTERED_LEVEL && Boolean(card.lastReview) && isCardDue(card.nextReview)).length },
    { type: "wrong", label: "错题", count: cards.filter((card) => card.incorrect > 0).length },
    { type: "favorite", label: "收藏", count: cards.filter((card) => Boolean(card.isStarred)).length },
    { type: "unlearned", label: "未学", count: cards.filter((card) => !card.lastReview).length },
  ], [cards]);
  const isLevelOne = childTags.length > 0 && selectionMode !== "export";
  const scopedTags = useMemo(() => Array.from(new Set(cards.flatMap((card) => card.tagPaths))).sort((left, right) => left.localeCompare(right, "zh-CN")), [cards]);

  const beginStudy = (scope: StudyScope) => {
    setScopeSheetVisible(false);
    router.push({ pathname: "/(tabs)/study", params: { scope: scopeFor(scope), topic: title } });
  };
  const enterSelection = (id: string) => {
    if (selectionMode === "export") return;
    longPressTriggered.current = true;
    setSelectionMode("batch");
    setSelectedIds(new Set([id]));
  };
  const toggleSelection = (id: string) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const exitSelection = () => {
    setSelectedIds(new Set());
    setSelectionMode(null);
  };
  const handleCardPress = (id: string) => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (selectionMode) toggleSelection(id);
    else router.push({ pathname: "/(tabs)/question-editor", params: { id } });
  };
  const toggleSelectAll = () => setSelectedIds((current) => current.size === cards.length ? new Set() : new Set(cards.map((card) => card.id)));
  const startExportSelection = () => {
    setMoreVisible(false);
    setSelectedIds(new Set(cards.map((card) => card.id)));
    setSelectionMode("export");
  };
  useEffect(() => {
    if (!exportVisible || selectionMode === "export") return;
    setExportVisible(false);
    startExportSelection();
  }, [exportVisible, selectionMode]);
  const batchFavorite = async () => {
    const database = await getDb();
    for (const questionId of selectedIds) {
      const progress = await database.getAllAsync("SELECT * FROM card_progress WHERE question_id = ?", [questionId]);
      if (progress[0]) await database.runAsync("UPDATE card_progress SET is_starred = ? WHERE question_id = ?", [1, questionId]);
      else await database.runAsync("INSERT INTO card_progress (id, user_id, question_id, level, correct, incorrect, last_review, next_review, is_starred) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [genId(), "local", questionId, 0, 0, 0, null, null, 1]);
    }
    exitSelection();
    await loadCards();
  };
  const confirmBatchDelete = () => Alert.alert("删除题目？", `将删除 ${selectedIds.size} 道题目，且无法恢复。`, [
    { text: "取消", style: "cancel" },
    { text: "删除", style: "destructive", onPress: async () => {
      const database = await getDb();
      for (const questionId of selectedIds) {
        await database.runAsync("DELETE FROM card_progress WHERE question_id = ?", [questionId]);
        await database.runAsync("DELETE FROM questions WHERE id = ?", [questionId]);
      }
      exitSelection();
      await loadCards();
    } },
  ]);
  const openStudyPlan = async () => {
    setMoreVisible(false);
    const plan = await getStudyPlan();
    let item = plan.items.find((entry) => entry.tag === title);
    if (!item) {
      item = { id: genId(), tag: title, dailyTarget: 10, enabled: true, mode: "smart", range: "all" };
      await saveStudyPlan({ ...plan, items: [...plan.items, item] });
    }
    router.push({ pathname: "/(tabs)/study-plan-item", params: { id: item.id } });
  };
  const openMovePath = () => {
    setMoreVisible(false);
    setNextPath(title);
    setMovePathVisible(true);
  };
  const moveFolderPath = async () => {
    const destination = normalizeTagPath(nextPath);
    if (!destination) return Alert.alert("请输入保存路径", "例如：高等数学/运动学");
    if (destination === title) return setMovePathVisible(false);
    const database = await getDb();
    for (const card of cards) {
      const movedTags = Array.from(new Set(card.tagPaths.map((tag) => tag === title || tag.startsWith(`${title}/`) ? `${destination}${tag.slice(title.length)}` : tag)));
      await database.runAsync("UPDATE questions SET cat = ?, tags = ? WHERE id = ?", [destination, JSON.stringify(movedTags), card.id]);
    }
    setMovePathVisible(false);
    router.replace({ pathname: "/(tabs)/topic", params: { topic: destination } });
  };
  const openTagManager = () => {
    setMoreVisible(false);
    setTagManagerVisible(true);
  };
  const saveEditedTag = async () => {
    const replacement = normalizeTagPath(tagDraft);
    if (!replacement) return Alert.alert("请输入标签");
    if (addingTag) {
      const database = await getDb();
      for (const card of cards) {
        await database.runAsync("UPDATE questions SET tags = ? WHERE id = ?", [JSON.stringify(Array.from(new Set([...card.tagPaths, replacement]))), card.id]);
      }
      setAddingTag(false);
      await loadCards();
      return;
    }
    if (!editingTag) return;
    if (replacement === editingTag) { setEditingTag(null); return; }
    const database = await getDb();
    for (const card of cards) {
      if (!card.tagPaths.includes(editingTag)) continue;
      const nextTags = Array.from(new Set(card.tagPaths.map((tag) => tag === editingTag ? replacement : tag)));
      await database.runAsync("UPDATE questions SET tags = ? WHERE id = ?", [JSON.stringify(nextTags), card.id]);
    }
    setEditingTag(null);
    await loadCards();
  };
  const deleteScopedTag = (tag: string) => Alert.alert("删除标签", `将从当前题库内拥有“${tag}”的题目中移除该标签。`, [
    { text: "取消", style: "cancel" },
    { text: "删除", style: "destructive", onPress: async () => {
      const database = await getDb();
      for (const card of cards) {
        if (!card.tagPaths.includes(tag)) continue;
        await database.runAsync("UPDATE questions SET tags = ? WHERE id = ?", [JSON.stringify(card.tagPaths.filter((item) => item !== tag)), card.id]);
      }
      await loadCards();
    } },
  ]);
  const exportQuestions = async () => {
    const selectedCards = cards.filter((card) => selectedIds.has(card.id));
    if (selectedCards.length === 0) return;
    const extension = exportFormat === "markdown" ? "md" : "json";
    const safeName = (title.split("/").pop() || "题目").replace(/[\\/:*?"<>|]/g, "-");
    const content = exportFormat === "markdown"
      ? `# ${title}\n\n${selectedCards.map((card, index) => `## ${index + 1}. ${card.q}\n\n${card.a}\n\n标签：${card.tagPaths.join(" / ") || card.cat}`).join("\n\n---\n\n")}`
      : JSON.stringify(selectedCards.map((card) => ({ question: card.q, answer: card.a, category: card.cat, tags: card.tagPaths })), null, 2);
    try {
      const file = new File(Paths.cache, `${safeName}-题目.${extension}`);
      file.write(content);
      setExportVisible(false);
      exitSelection();
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: exportFormat === "markdown" ? "text/markdown" : "application/json", dialogTitle: "导出题目" });
      else Alert.alert("导出完成", `文件已保存至：${file.uri}`);
    } catch (error: any) {
      Alert.alert("导出失败", error?.message || "请稍后重试");
    }
  };

  return <View style={[styles.page, { backgroundColor: bg }]}>
    <View style={styles.header}>
      {selectionMode === "export" ? <><TouchableOpacity style={styles.cancelSelection} onPress={exitSelection}><Text style={[styles.cancelSelectionText, { color: text }]}>取消</Text></TouchableOpacity><Text style={[styles.selectionTitle, { color: text }]}>已选 {selectedIds.size} 项</Text><View style={styles.actions}><TouchableOpacity accessibilityLabel={selectedIds.size === cards.length ? "取消全选" : "全选"} style={styles.selectAllAction} onPress={toggleSelectAll}><Text style={styles.selectAllText}>{selectedIds.size === cards.length ? "取消全选" : "全选"}</Text></TouchableOpacity><TouchableOpacity accessibilityLabel="导出所选题目" disabled={selectedIds.size === 0} style={[styles.actionButton, selectedIds.size === 0 && styles.actionButtonDisabled]} onPress={() => { setExportFormat("markdown"); setExportVisible(true); }}><Download size={20} color={selectedIds.size === 0 ? colors.textTertiary : colors.primary} /></TouchableOpacity></View></> : selectionMode === "batch" ? <><TouchableOpacity style={styles.cancelSelection} onPress={exitSelection}><Text style={[styles.cancelSelectionText, { color: text }]}>取消</Text></TouchableOpacity><Text style={[styles.selectionTitle, { color: text }]}>已选 {selectedIds.size} 项</Text><View style={styles.actions}><TouchableOpacity accessibilityLabel="批量收藏" style={styles.actionButton} onPress={batchFavorite}><Star size={20} color={colors.primary} /></TouchableOpacity><TouchableOpacity accessibilityLabel="批量删除" style={styles.actionButton} onPress={confirmBatchDelete}><Trash2 size={20} color={colors.danger} /></TouchableOpacity></View></> : <><BackButton onPress={() => router.back()} /><Text numberOfLines={1} style={[styles.headerTitle, { color: text }]}>{title.split("/").pop()}</Text><View style={styles.actions}><TouchableOpacity accessibilityLabel="开始学习" style={styles.actionButton} onPress={() => setScopeSheetVisible(true)}><Play size={21} color={colors.learning} fill={colors.learning} /></TouchableOpacity><TouchableOpacity accessibilityLabel="更多" style={styles.actionButton} onPress={() => setMoreVisible(true)}><MoreHorizontal size={22} color={text} /></TouchableOpacity></View></>}
    </View>
    {isLevelOne ? <ScrollView contentContainerStyle={styles.tagList} showsVerticalScrollIndicator={false}>{childTags.map((tag) => <TouchableOpacity key={tag.path} style={[styles.tagRow, { backgroundColor: surface }]} onPress={() => router.push({ pathname: "/(tabs)/topic", params: { topic: tag.path } })}><View style={[styles.folderIcon, { backgroundColor: isDark ? "#2E3038" : colors.iconBackground }]}><BookOpen size={21} color={colors.primary} /></View><View style={styles.rowCopy}><Text numberOfLines={1} style={[styles.tagName, { color: text }]}>{tag.name}</Text><Text style={styles.tagCount}>{tag.count} 张卡片</Text></View><ChevronRight size={21} color={colors.textSecondary} /></TouchableOpacity>)}</ScrollView> : <ScrollView contentContainerStyle={styles.questionList} showsVerticalScrollIndicator={false}>{cards.map((card) => <TouchableOpacity key={card.id} style={[styles.questionRow, { backgroundColor: surface }, selectedIds.has(card.id) && (isDark ? { backgroundColor: "#353740" } : styles.questionRowSelected)]} onLongPress={() => enterSelection(card.id)} onPress={() => handleCardPress(card.id)}><View style={[styles.questionIcon, { backgroundColor: isDark ? "#2E3038" : colors.iconBackground }]}><BookOpen size={18} color={colors.primary} /></View><View style={styles.rowCopy}><Text numberOfLines={1} style={[styles.questionText, { color: text }]}>{card.q.slice(0, 24)}{card.q.length > 24 ? "…" : ""}</Text><View style={styles.questionTags}>{card.tagPaths.map((tag) => <View key={`${card.id}-${tag}`} style={styles.questionTag}><Tag size={12} color={colors.primary} strokeWidth={2.2} /><Text numberOfLines={1} style={styles.questionTagText}>{tag}</Text></View>)}</View></View>{selectionMode ? <CheckCircle2 size={21} color={selectedIds.has(card.id) ? colors.primary : "#c8c9cf"} fill={selectedIds.has(card.id) ? "#fff" : "transparent"} /> : null}</TouchableOpacity>)}{cards.length === 0 ? <Text style={styles.empty}>当前标签暂无题目</Text> : null}</ScrollView>}
    <StudyScopeBottomSheet visible={scopeSheetVisible} rangeLabel={title.split("/").pop() || title} options={scopeOptions} onClose={() => setScopeSheetVisible(false)} onSelect={beginStudy} />
    <Modal visible={moreVisible} transparent animationType="fade" onRequestClose={() => setMoreVisible(false)}><Pressable style={styles.moreOverlay} onPress={() => setMoreVisible(false)}><Pressable style={[styles.moreMenu, { backgroundColor: surface }]} onPress={() => undefined}><TouchableOpacity style={styles.moreRow} onPress={openStudyPlan}><CalendarDays size={20} color={text} /><Text style={[styles.moreText, { color: text }]}>学习计划</Text></TouchableOpacity><TouchableOpacity style={styles.moreRow} onPress={openTagManager}><Tag size={20} color={text} /><Text style={[styles.moreText, { color: text }]}>编辑标签</Text></TouchableOpacity><TouchableOpacity style={styles.moreRow} onPress={openMovePath}><FolderCog size={20} color={text} /><Text style={[styles.moreText, { color: text }]}>修改保存路径</Text></TouchableOpacity><TouchableOpacity style={styles.moreRow} onPress={() => { setMoreVisible(false); setExportFormat("markdown"); setExportVisible(true); }}><Download size={20} color={text} /><Text style={[styles.moreText, { color: text }]}>导出题目</Text></TouchableOpacity></Pressable></Pressable></Modal>
    <Modal visible={tagManagerVisible} transparent animationType="slide" onRequestClose={() => setTagManagerVisible(false)}><Pressable style={styles.exportOverlay} onPress={() => setTagManagerVisible(false)}><Pressable style={[styles.tagDialog, { backgroundColor: surface }]} onPress={() => undefined}><View style={styles.tagDialogHeader}><Text style={[styles.exportTitle, { color: text }]}>编辑标签</Text><TouchableOpacity accessibilityLabel="添加标签" style={styles.addTagAction} onPress={() => { setTagDraft(""); setAddingTag(true); }}><Plus size={22} color={colors.primary} /></TouchableOpacity></View><ScrollView style={styles.tagManagerList} contentContainerStyle={styles.tagManagerContent} showsVerticalScrollIndicator={false}>{scopedTags.map((tag) => <View key={tag} style={[styles.tagManagerRow, { backgroundColor: isDark ? "#2E3038" : "#f1f1f3" }]}><View style={styles.tagManagerName}><Tag size={16} color={colors.primary} /><Text numberOfLines={1} style={[styles.tagManagerText, { color: text }]}>{tag}</Text></View><View style={styles.tagManagerActions}><TouchableOpacity accessibilityLabel={`编辑标签 ${tag}`} style={styles.tagManagerAction} onPress={() => { setEditingTag(tag); setTagDraft(tag); }}><PenLine size={18} color={colors.textSecondary} /></TouchableOpacity><TouchableOpacity accessibilityLabel={`删除标签 ${tag}`} style={styles.tagManagerAction} onPress={() => deleteScopedTag(tag)}><Trash2 size={18} color={colors.danger} /></TouchableOpacity></View></View>)}{scopedTags.length === 0 ? <Text style={styles.empty}>当前题库暂无标签</Text> : null}</ScrollView><TouchableOpacity style={styles.tagDialogClose} onPress={() => setTagManagerVisible(false)}><Text style={styles.exportConfirmText}>完成</Text></TouchableOpacity></Pressable></Pressable></Modal>
    <Modal visible={Boolean(editingTag) || addingTag} transparent animationType="fade" onRequestClose={() => { setEditingTag(null); setAddingTag(false); }}><Pressable style={styles.exportOverlay} onPress={() => { setEditingTag(null); setAddingTag(false); }}><Pressable style={[styles.exportDialog, { backgroundColor: surface }]} onPress={() => undefined}><Text style={[styles.exportTitle, { color: text }]}>{addingTag ? "添加标签" : "修改标签"}</Text><Text style={styles.exportLabel}>{addingTag ? "标签" : "新标签"}</Text><TextInput value={tagDraft} onChangeText={setTagDraft} autoFocus placeholder="输入标签" placeholderTextColor={colors.textTertiary} style={[styles.pathInput, { backgroundColor: isDark ? "#2E3038" : "#f1f1f3", color: text }]} /><Text style={styles.pathHint}>{addingTag ? "将添加到当前题库层级的所有题目。" : "将修改当前题库内拥有该标签的所有题目。"}</Text><View style={styles.exportActions}><TouchableOpacity style={styles.exportCancel} onPress={() => { setEditingTag(null); setAddingTag(false); }}><Text style={styles.exportCancelText}>取消</Text></TouchableOpacity><TouchableOpacity style={styles.exportConfirm} onPress={saveEditedTag}><Text style={styles.exportConfirmText}>保存</Text></TouchableOpacity></View></Pressable></Pressable></Modal>
    <Modal visible={movePathVisible} transparent animationType="fade" onRequestClose={() => setMovePathVisible(false)}><Pressable style={styles.exportOverlay} onPress={() => setMovePathVisible(false)}><Pressable style={[styles.exportDialog, { backgroundColor: surface }]} onPress={() => undefined}><Text style={[styles.exportTitle, { color: text }]}>修改保存路径</Text><Text style={styles.exportLabel}>新路径</Text><TextInput value={nextPath} onChangeText={setNextPath} autoFocus placeholder="例如：高等数学/运动学" placeholderTextColor={colors.textTertiary} style={[styles.pathInput, { backgroundColor: isDark ? "#2E3038" : "#f1f1f3", color: text }]} /><Text style={styles.pathHint}>将移动当前文件夹及其子文件夹内的全部题目。</Text><View style={styles.exportActions}><TouchableOpacity style={styles.exportCancel} onPress={() => setMovePathVisible(false)}><Text style={styles.exportCancelText}>取消</Text></TouchableOpacity><TouchableOpacity style={styles.exportConfirm} onPress={moveFolderPath}><Text style={styles.exportConfirmText}>保存</Text></TouchableOpacity></View></Pressable></Pressable></Modal>
    <Modal visible={exportVisible} transparent animationType="fade" onRequestClose={() => setExportVisible(false)}><Pressable style={styles.exportOverlay} onPress={() => setExportVisible(false)}><Pressable style={[styles.exportDialog, { backgroundColor: surface }]} onPress={() => undefined}><Text style={[styles.exportTitle, { color: text }]}>导出题目</Text><Text style={styles.exportLabel}>导出范围</Text><View style={[styles.exportScope, { backgroundColor: isDark ? "#2E3038" : "#f1f1f3" }]}><Text style={[styles.exportScopeText, { color: text }]}>已选题目</Text><Text style={styles.exportScopeCount}>{selectedIds.size} 道</Text></View><Text style={styles.exportLabel}>文件格式</Text><TouchableOpacity style={[styles.exportOption, { backgroundColor: isDark ? "#2E3038" : "#f1f1f3" }, exportFormat === "markdown" && styles.exportOptionSelected]} onPress={() => setExportFormat("markdown")}><Text style={[styles.exportOptionText, { color: text }]}>Markdown</Text><CheckCircle2 size={20} color={exportFormat === "markdown" ? colors.primary : "#c8c9cf"} fill={exportFormat === "markdown" ? "#fff" : "transparent"} /></TouchableOpacity><TouchableOpacity style={[styles.exportOption, { backgroundColor: isDark ? "#2E3038" : "#f1f1f3" }, exportFormat === "json" && styles.exportOptionSelected]} onPress={() => setExportFormat("json")}><Text style={[styles.exportOptionText, { color: text }]}>JSON</Text><CheckCircle2 size={20} color={exportFormat === "json" ? colors.primary : "#c8c9cf"} fill={exportFormat === "json" ? "#fff" : "transparent"} /></TouchableOpacity><View style={styles.exportActions}><TouchableOpacity style={styles.exportCancel} onPress={() => setExportVisible(false)}><Text style={styles.exportCancelText}>取消</Text></TouchableOpacity><TouchableOpacity style={styles.exportConfirm} onPress={exportQuestions}><Text style={styles.exportConfirmText}>导出</Text></TouchableOpacity></View></Pressable></Pressable></Modal>
  </View>;
}

const styles = StyleSheet.create({
  selectAllAction: { minWidth: 48, height: 42, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  selectAllText: { color: colors.primary, fontFamily: "MiSans-Medium", fontSize: 14 },
  actionButtonDisabled: { opacity: 0.45 },
  page: { flex: 1, backgroundColor: colors.bg },
  header: { height: 76, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", marginBottom: 8 },
  headerTitle: { flex: 1, color: colors.text, fontFamily: "MiSans-Semibold", fontSize: 30, marginLeft: 3 }, selectionTitle: { flex: 1, color: colors.text, fontFamily: "MiSans-Medium", fontSize: 17, textAlign: "center" }, cancelSelection: { width: 48, height: 42, justifyContent: "center" }, cancelSelectionText: { color: colors.text, fontFamily: "MiSans-Medium", fontSize: 15 }, actions: { flexDirection: "row", alignItems: "center", gap: 4 }, actionButton: { width: 38, height: 42, alignItems: "center", justifyContent: "center" },
  tagList: { paddingHorizontal: 20, paddingBottom: 30 }, tagRow: { minHeight: 68, backgroundColor: colors.surface, borderRadius: 15, padding: 11, flexDirection: "row", alignItems: "center", marginBottom: 7, shadowColor: "#1d1d1d", shadowOpacity: 0.025, shadowRadius: 8, elevation: 1 }, folderIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.iconBackground, alignItems: "center", justifyContent: "center", marginRight: 12 }, rowCopy: { flex: 1, minWidth: 0 }, tagName: { color: colors.text, fontFamily: "MiSans-Medium", fontSize: 16 }, tagCount: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 12, marginTop: 3 },
  questionList: { paddingHorizontal: 20, paddingBottom: 30 }, questionRow: { minHeight: 62, backgroundColor: colors.surface, borderRadius: 15, padding: 10, flexDirection: "row", alignItems: "center", marginBottom: 7, shadowColor: "#1d1d1d", shadowOpacity: 0.025, shadowRadius: 8, elevation: 1 }, questionRowSelected: { backgroundColor: "#F1F2F4" }, questionIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.iconBackground, alignItems: "center", justifyContent: "center", marginRight: 11 }, questionText: { color: colors.text, fontFamily: "MiSans-Medium", fontSize: 16 }, questionTags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }, questionTag: { maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 }, questionTagText: { flexShrink: 1, color: colors.primary, fontFamily: "MiSans-Medium", fontSize: 11 }, empty: { color: colors.textSecondary, fontFamily: "MiSans-Regular", textAlign: "center", fontSize: 15, marginTop: 72 },
  moreOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.08)" }, moreMenu: { position: "absolute", top: 60, right: 18, width: 164, backgroundColor: colors.surface, borderRadius: 16, paddingVertical: 6, shadowColor: "#171717", shadowOpacity: 0.12, shadowRadius: 16, elevation: 6 }, moreRow: { minHeight: 48, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 }, moreText: { color: colors.text, fontFamily: "MiSans-Regular", fontSize: 15 },
  exportOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }, exportDialog: { width: "100%", maxWidth: 380, backgroundColor: colors.surface, borderRadius: 24, padding: 24 }, tagDialog: { width: "100%", maxWidth: 380, maxHeight: "76%", backgroundColor: colors.surface, borderRadius: 24, padding: 24 }, tagDialogHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }, addTagAction: { width: 36, height: 36, alignItems: "center", justifyContent: "center" }, tagManagerList: { maxHeight: 390 }, tagManagerContent: { gap: 8, paddingBottom: 8 }, tagManagerRow: { minHeight: 54, borderRadius: 14, backgroundColor: "#f1f1f3", paddingLeft: 13, paddingRight: 7, flexDirection: "row", alignItems: "center" }, tagManagerName: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 }, tagManagerText: { flex: 1, color: colors.text, fontFamily: "MiSans-Medium", fontSize: 15 }, tagManagerActions: { flexDirection: "row", alignItems: "center" }, tagManagerAction: { width: 40, height: 44, alignItems: "center", justifyContent: "center" }, tagDialogClose: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 8 }, exportTitle: { color: colors.text, fontFamily: "MiSans-Semibold", fontSize: 20 }, exportLabel: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 13, marginTop: 20, marginBottom: 8 }, pathInput: { minHeight: 52, borderRadius: 15, backgroundColor: "#f1f1f3", paddingHorizontal: 14, color: colors.text, fontFamily: "MiSans-Regular", fontSize: 16 }, pathHint: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 12, lineHeight: 18, marginTop: 9 }, exportScope: { minHeight: 52, borderRadius: 15, backgroundColor: "#f1f1f3", paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, exportScopeText: { color: colors.text, fontFamily: "MiSans-Medium", fontSize: 15 }, exportScopeCount: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 13 }, exportOption: { minHeight: 52, borderRadius: 15, backgroundColor: "#f1f1f3", paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }, exportOptionSelected: { backgroundColor: "#fff1e5" }, exportOptionText: { color: colors.text, fontFamily: "MiSans-Medium", fontSize: 15 }, exportActions: { flexDirection: "row", gap: 10, marginTop: 11 }, exportCancel: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center" }, exportCancelText: { color: colors.textSecondary, fontFamily: "MiSans-Medium", fontSize: 16 }, exportConfirm: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center" }, exportConfirmText: { color: colors.primary, fontFamily: "MiSans-Semibold", fontSize: 16 },
});
