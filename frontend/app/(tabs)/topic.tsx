import { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { BookOpen, CheckCircle2, ChevronRight, MoreHorizontal, Play, Star, Tag, Trash2 } from "lucide-react-native";
import { getDb } from "../../src/data/db";
import { isCardDue, MASTERED_LEVEL } from "../../src/data/sm2";
import { colors } from "../../src/tokens/colors";
import { BackButton } from "../../src/components/PrototypeUI";
import StudyScopeBottomSheet, { StudyScope, StudyScopeOption } from "../../src/components/StudyScopeBottomSheet";
import { cardHasTag, parseQuestionTags } from "../../src/data/tagging";
import { genId } from "../../src/data/utils";

interface DbCardRow { id: string; cat: string; q: string; a: string; tags?: string | null; level: number; incorrect: number; isStarred: number | boolean; lastReview?: string | null; nextReview?: string | null; }
interface CardRow extends DbCardRow { tagPaths: string[]; }
interface ChildTag { name: string; path: string; count: number; }

const scopeFor = (scope: StudyScope) => scope === "review" ? "review" : scope === "wrong" ? "mistakes" : scope === "favorite" ? "starred" : scope === "unlearned" ? "new" : "all";

export default function TopicDetailScreen() {
  const router = useRouter();
  const { topic } = useLocalSearchParams<{ topic: string }>();
  const title = topic || "专题";
  const [cards, setCards] = useState<CardRow[]>([]);
  const [scopeSheetVisible, setScopeSheetVisible] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
  const isLevelOne = childTags.length > 0;

  const beginStudy = (scope: StudyScope) => {
    setScopeSheetVisible(false);
    router.push({ pathname: "/(tabs)/study", params: { scope: scopeFor(scope), topic: title } });
  };
  const enterSelection = (id: string) => setSelectedIds(new Set([id]));
  const toggleSelection = (id: string) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const exitSelection = () => setSelectedIds(new Set());
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

  return <View style={styles.page}>
    <View style={styles.header}>
      {selectedIds.size > 0 ? <><TouchableOpacity style={styles.cancelSelection} onPress={exitSelection}><Text style={styles.cancelSelectionText}>取消</Text></TouchableOpacity><Text style={styles.selectionTitle}>已选 {selectedIds.size} 项</Text><View style={styles.actions}><TouchableOpacity accessibilityLabel="批量收藏" style={styles.actionButton} onPress={batchFavorite}><Star size={20} color={colors.primary} /></TouchableOpacity><TouchableOpacity accessibilityLabel="批量删除" style={styles.actionButton} onPress={confirmBatchDelete}><Trash2 size={20} color={colors.danger} /></TouchableOpacity></View></> : <><BackButton onPress={() => router.back()} /><Text numberOfLines={1} style={styles.headerTitle}>{title.split("/").pop()}</Text><View style={styles.actions}><TouchableOpacity accessibilityLabel="开始学习" style={styles.actionButton} onPress={() => setScopeSheetVisible(true)}><Play size={21} color={colors.learning} fill={colors.learning} /></TouchableOpacity><TouchableOpacity accessibilityLabel="更多" style={styles.actionButton} onPress={() => Alert.alert("更多", "更多标签操作将在下一阶段开放")}><MoreHorizontal size={22} color={colors.text} /></TouchableOpacity></View></>}
    </View>
    {isLevelOne ? <ScrollView contentContainerStyle={styles.tagList} showsVerticalScrollIndicator={false}>{childTags.map((tag) => <TouchableOpacity key={tag.path} style={styles.tagRow} onPress={() => router.push({ pathname: "/(tabs)/topic", params: { topic: tag.path } })}><View style={styles.folderIcon}><BookOpen size={21} color={colors.primary} /></View><View style={styles.rowCopy}><Text numberOfLines={1} style={styles.tagName}>{tag.name}</Text><Text style={styles.tagCount}>{tag.count} 张卡片</Text></View><ChevronRight size={21} color={colors.textSecondary} /></TouchableOpacity>)}</ScrollView> : <ScrollView contentContainerStyle={styles.questionList} showsVerticalScrollIndicator={false}>{cards.map((card) => <TouchableOpacity key={card.id} style={[styles.questionRow, selectedIds.has(card.id) && styles.questionRowSelected]} onLongPress={() => enterSelection(card.id)} onPress={() => selectedIds.size > 0 ? toggleSelection(card.id) : router.push({ pathname: "/(tabs)/question-editor", params: { id: card.id } })}><View style={styles.questionIcon}><BookOpen size={18} color={colors.primary} /></View><View style={styles.rowCopy}><Text numberOfLines={1} style={styles.questionText}>{card.q.slice(0, 24)}{card.q.length > 24 ? "…" : ""}</Text><View style={styles.questionTags}>{card.tagPaths.map((tag) => <View key={`${card.id}-${tag}`} style={styles.questionTag}><Tag size={12} color={colors.primary} strokeWidth={2.2} /><Text numberOfLines={1} style={styles.questionTagText}>{tag}</Text></View>)}</View></View>{selectedIds.size > 0 ? <CheckCircle2 size={21} color={selectedIds.has(card.id) ? colors.primary : "#c8c9cf"} fill={selectedIds.has(card.id) ? colors.primaryLight : "transparent"} /> : null}</TouchableOpacity>)}{cards.length === 0 ? <Text style={styles.empty}>当前标签暂无题目</Text> : null}</ScrollView>}
    <StudyScopeBottomSheet visible={scopeSheetVisible} rangeLabel={title.split("/").pop() || title} options={scopeOptions} onClose={() => setScopeSheetVisible(false)} onSelect={beginStudy} />
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: { height: 76, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", marginBottom: 8 },
  headerTitle: { flex: 1, color: colors.text, fontFamily: "MiSans-Semibold", fontSize: 30, marginLeft: 3 }, selectionTitle: { flex: 1, color: colors.text, fontFamily: "MiSans-Medium", fontSize: 17, textAlign: "center" }, cancelSelection: { width: 48, height: 42, justifyContent: "center" }, cancelSelectionText: { color: colors.text, fontFamily: "MiSans-Medium", fontSize: 15 }, actions: { flexDirection: "row", alignItems: "center", gap: 4 }, actionButton: { width: 38, height: 42, alignItems: "center", justifyContent: "center" },
  tagList: { paddingHorizontal: 20, paddingBottom: 30 }, tagRow: { minHeight: 68, backgroundColor: colors.surface, borderRadius: 15, padding: 11, flexDirection: "row", alignItems: "center", marginBottom: 7, shadowColor: "#1d1d1d", shadowOpacity: 0.025, shadowRadius: 8, elevation: 1 }, folderIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.iconBackground, alignItems: "center", justifyContent: "center", marginRight: 12 }, rowCopy: { flex: 1, minWidth: 0 }, tagName: { color: colors.text, fontFamily: "MiSans-Medium", fontSize: 16 }, tagCount: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 12, marginTop: 3 },
  questionList: { paddingHorizontal: 20, paddingBottom: 30 }, questionRow: { minHeight: 62, backgroundColor: colors.surface, borderRadius: 15, padding: 10, flexDirection: "row", alignItems: "center", marginBottom: 7, shadowColor: "#1d1d1d", shadowOpacity: 0.025, shadowRadius: 8, elevation: 1 }, questionRowSelected: { backgroundColor: "#F1F2F4" }, questionIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.iconBackground, alignItems: "center", justifyContent: "center", marginRight: 11 }, questionText: { color: colors.text, fontFamily: "MiSans-Medium", fontSize: 16 }, questionTags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }, questionTag: { maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 }, questionTagText: { flexShrink: 1, color: colors.primary, fontFamily: "MiSans-Medium", fontSize: 11 }, empty: { color: colors.textSecondary, fontFamily: "MiSans-Regular", textAlign: "center", fontSize: 15, marginTop: 72 },
});
