import { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { BookOpen, CheckCircle2, Play, Star, StarOff, Tag, Trash2 } from "lucide-react-native";
import { getDb, insertSampleData } from "../../src/data/db";
import { useThemeStore } from "../../src/store/useThemeStore";
import { colors } from "../../src/tokens/colors";
import { BackButton } from "../../src/components/PrototypeUI";
import { parseQuestionTags } from "../../src/data/tagging";
import { genId } from "../../src/data/utils";
import { getStudyPlan } from "../../src/data/study-plan";
import { isCardDue, MASTERED_LEVEL } from "../../src/data/sm2";

type Collection = "starred" | "mistakes" | "review";
interface CollectionQuestion { id: string; cat: string; q: string; tags?: string | null; incorrect: number; isStarred: number; level: number; nextReview?: string | null; }
interface DisplayQuestion extends CollectionQuestion { tagPaths: string[]; }

export default function CollectionScreen() {
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type?: Collection }>();
  const collection: Collection = type === "mistakes" ? "mistakes" : "starred";
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === "dark";
  const c = isDark ? colors.textDark : colors.text;
  const bg = isDark ? colors.bgDark : colors.bg;
  const surface = isDark ? colors.surfaceDark : colors.surface;
  const [questions, setQuestions] = useState<DisplayQuestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const loadQuestions = useCallback(async () => {
    await insertSampleData();
    const database = await getDb();
    const rows: CollectionQuestion[] = await database.getAllAsync(
      "SELECT q.id, q.cat, q.q, q.tags, COALESCE(cp.incorrect, 0) AS incorrect, COALESCE(cp.is_starred, 0) AS isStarred, COALESCE(cp.level, 0) AS level, cp.next_review AS nextReview FROM questions q LEFT JOIN card_progress cp ON q.id = cp.question_id"
    );
    const plan = await getStudyPlan();
    setQuestions(rows.filter((question) => collection === "starred" ? Boolean(question.isStarred) : collection === "mistakes" ? question.incorrect > 0 : question.level < MASTERED_LEVEL && isCardDue(question.nextReview) && plan.items.some((item) => item.enabled && parseQuestionTags(question.tags, question.cat).some((tag) => tag === item.tag || tag.startsWith(`${item.tag}/`)))).map((question) => ({ ...question, tagPaths: parseQuestionTags(question.tags, question.cat) })));
  }, [collection]);
  useFocusEffect(useCallback(() => { loadQuestions().catch(() => setQuestions([])); }, [loadQuestions]));

  const title = collection === "starred" ? "收藏夹" : collection === "mistakes" ? "错题本" : "待复习";
  const emptyText = collection === "starred" ? "还没有收藏题目" : collection === "mistakes" ? "还没有错题" : "暂无待复习内容";
  const exitSelection = () => setSelectedIds(new Set());
  const toggleSelection = (id: string) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const batchFavorite = async () => {
    const database = await getDb();
    const nextStarred = collection === "starred" ? 0 : 1;
    for (const questionId of selectedIds) {
      const progress = await database.getAllAsync("SELECT * FROM card_progress WHERE question_id = ?", [questionId]);
      if (progress[0]) await database.runAsync("UPDATE card_progress SET is_starred = ? WHERE question_id = ?", [nextStarred, questionId]);
      else await database.runAsync("INSERT INTO card_progress (id, user_id, question_id, level, correct, incorrect, last_review, next_review, is_starred) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [genId(), "local", questionId, 0, 0, 0, null, null, nextStarred]);
    }
    exitSelection();
    await loadQuestions();
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
      await loadQuestions();
    } },
  ]);
  return <View style={[styles.page, { backgroundColor: bg }]}>
    <View style={styles.titleRow}>{selectedIds.size > 0 ? <><TouchableOpacity style={styles.cancelSelection} onPress={exitSelection}><Text style={[styles.cancelSelectionText, { color: c }]}>取消</Text></TouchableOpacity><Text style={[styles.selectionTitle, { color: c }]}>已选 {selectedIds.size} 项</Text><View style={styles.headerActions}><TouchableOpacity accessibilityLabel={collection === "starred" ? "取消收藏" : "批量收藏"} style={styles.headerAction} onPress={batchFavorite}>{collection === "starred" ? <StarOff size={20} color={colors.textSecondary} /> : <Star size={20} color={colors.primary} />}</TouchableOpacity><TouchableOpacity style={styles.headerAction} onPress={confirmBatchDelete}><Trash2 size={20} color={colors.danger} /></TouchableOpacity></View></> : <><BackButton onPress={() => router.back()} /><Text style={[styles.title, { color: c }]}>{title}</Text><TouchableOpacity accessibilityLabel="开始做题" style={styles.headerAction} onPress={() => router.push({ pathname: "/(tabs)/study", params: { scope: collection } })}><Play size={21} color={colors.learning} fill={colors.learning} /></TouchableOpacity></>}</View>
    <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
      {questions.map((question) => <TouchableOpacity key={question.id} style={[styles.questionRow, { backgroundColor: selectedIds.has(question.id) ? (isDark ? "#353740" : "#F1F2F4") : surface }]} onLongPress={() => setSelectedIds(new Set([question.id]))} onPress={() => selectedIds.size > 0 ? toggleSelection(question.id) : router.push({ pathname: "/(tabs)/question-editor", params: { id: question.id } })}>
        <View style={[styles.questionIcon, { backgroundColor: isDark ? "#2E3038" : `${colors.primary}18` }]}><BookOpen size={18} color={colors.primary} /></View>
        <View style={styles.rowCopy}><Text numberOfLines={1} style={[styles.questionText, { color: c }]}>{question.q}</Text><View style={styles.questionTags}>{question.tagPaths.map((tag) => <View key={`${question.id}-${tag}`} style={styles.questionTag}><Tag size={12} color={colors.primary} strokeWidth={2.2} /><Text numberOfLines={1} style={styles.questionTagText}>{tag}</Text></View>)}</View></View>
        {selectedIds.size > 0 ? <CheckCircle2 size={21} color={selectedIds.has(question.id) ? colors.primary : "#c8c9cf"} fill={selectedIds.has(question.id) ? "#fff" : "transparent"} /> : null}
      </TouchableOpacity>)}
      {questions.length === 0 ? <Text style={styles.empty}>{emptyText}</Text> : null}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, titleRow: { height: 76, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", marginBottom: 8 }, title: { flex: 1, fontFamily: "MiSans-Semibold", fontSize: 30, marginLeft: 3 }, selectionTitle: { flex: 1, textAlign: "center", fontFamily: "MiSans-Medium", fontSize: 17 }, cancelSelection: { width: 48, height: 42, justifyContent: "center" }, cancelSelectionText: { fontFamily: "MiSans-Medium", fontSize: 15 }, headerActions: { flexDirection: "row" }, headerAction: { width: 40, height: 42, alignItems: "center", justifyContent: "center" }, list: { paddingHorizontal: 20, paddingBottom: 30 }, questionRow: { minHeight: 62, borderRadius: 15, padding: 10, flexDirection: "row", alignItems: "center", marginBottom: 7, shadowColor: "#1d1d1d", shadowOpacity: 0.025, shadowRadius: 8, elevation: 1 }, questionRowSelected: { backgroundColor: "#F1F2F4" }, questionIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: `${colors.primary}18`, alignItems: "center", justifyContent: "center", marginRight: 11 }, rowCopy: { flex: 1, minWidth: 0 }, questionText: { fontFamily: "MiSans-Medium", fontSize: 16 }, questionTags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }, questionTag: { maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 }, questionTagText: { flexShrink: 1, color: colors.primary, fontFamily: "MiSans-Medium", fontSize: 11 }, empty: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 15, textAlign: "center", marginTop: 70 },
});
