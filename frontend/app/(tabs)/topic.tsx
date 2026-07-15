import { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { getDb } from "../../src/data/db";
import { isCardDue, MASTERED_LEVEL } from "../../src/data/sm2";
import { colors } from "../../src/tokens/colors";
import { BackButton } from "../../src/components/PrototypeUI";
import StudyScopeBottomSheet, { StudyScope, StudyScopeOption } from "../../src/components/StudyScopeBottomSheet";
import QuestionEditor, { EditableQuestion } from "../../src/components/QuestionEditor";
import { cardHasTag, parseQuestionTags } from "../../src/data/tagging";

interface DbCardRow extends Omit<EditableQuestion, "tags"> { id: string; tags?: string | null; level: number; incorrect: number; isStarred: number | boolean; lastReview?: string | null; nextReview?: string | null; }
interface CardRow extends DbCardRow { tagPaths: string[]; }
interface ChildTag { name: string; path: string; count: number; }

const scopeFor = (scope: StudyScope) => scope === "review" ? "review" : scope === "wrong" ? "mistakes" : scope === "favorite" ? "starred" : scope === "unlearned" ? "new" : "all";

export default function TopicDetailScreen() {
  const router = useRouter();
  const { topic } = useLocalSearchParams<{ topic: string }>();
  const title = topic || "专题";
  const [cards, setCards] = useState<CardRow[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [scopeSheetVisible, setScopeSheetVisible] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<EditableQuestion | null>(null);

  const loadCards = useCallback(async () => {
    const database = await getDb();
    const rows: DbCardRow[] = await database.getAllAsync("SELECT q.id, q.cat, q.tags, q.q, q.a, COALESCE(cp.level, 0) AS level, COALESCE(cp.incorrect, 0) AS incorrect, COALESCE(cp.is_starred, 0) AS isStarred, cp.last_review AS lastReview, cp.next_review AS nextReview FROM questions q LEFT JOIN card_progress cp ON q.id = cp.question_id");
    const tagged = rows.map((card) => ({ ...card, tagPaths: parseQuestionTags(card.tags, card.cat) }));
    setAvailableTags(Array.from(new Set(tagged.flatMap((card) => card.tagPaths))).sort((left, right) => left.localeCompare(right, "zh-CN")));
    const scoped = tagged.filter((card) => cardHasTag(card.tagPaths, title));
    setCards(Array.from(new Map(scoped.map((card) => [card.id, card])).values()));
  }, [title]);

  useFocusEffect(useCallback(() => { loadCards().catch(() => setCards([])); }, [loadCards]));

  const childTags = useMemo<ChildTag[]>(() => {
    const prefix = `${title}/`;
    const grouped = new Map<string, Set<string>>();
    cards.forEach((card) => card.tagPaths.filter((tag) => tag.startsWith(prefix)).forEach((tag) => {
      const name = tag.slice(prefix.length).split("/")[0]?.trim();
      if (name) {
        const ids = grouped.get(name) ?? new Set<string>();
        ids.add(card.id);
        grouped.set(name, ids);
      }
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

  const saveQuestion = async (question: EditableQuestion) => {
    if (!question.id) return;
    const database = await getDb();
    const tags = parseQuestionTags(question.tags, question.cat);
    await database.runAsync("UPDATE questions SET cat = ?, tags = ?, q = ?, a = ? WHERE id = ?", [tags[0], JSON.stringify(tags), question.q, question.a, question.id]);
    setEditingQuestion(null);
    await loadCards();
  };

  const deleteQuestion = async () => {
    if (!editingQuestion?.id) return;
    const database = await getDb();
    await database.runAsync("DELETE FROM card_progress WHERE question_id = ?", [editingQuestion.id]);
    await database.runAsync("DELETE FROM questions WHERE id = ?", [editingQuestion.id]);
    setEditingQuestion(null);
    await loadCards();
  };

  return <View style={styles.page}>
    <View style={styles.header}><BackButton onPress={() => router.back()} /><Text numberOfLines={1} style={styles.headerTitle}>{title.split("/").pop()}</Text><View style={styles.actions}><TouchableOpacity accessibilityLabel="开始学习" style={styles.actionButton} onPress={() => setScopeSheetVisible(true)}><Text style={styles.play}>▶</Text></TouchableOpacity><TouchableOpacity accessibilityLabel="更多" style={styles.actionButton} onPress={() => Alert.alert("更多", "更多标签操作将在下一阶段开放")}><Text style={styles.more}>•••</Text></TouchableOpacity></View></View>
    {isLevelOne ? <ScrollView contentContainerStyle={styles.tagList} showsVerticalScrollIndicator={false}>{childTags.map((tag) => <TouchableOpacity key={tag.path} style={styles.tagRow} onPress={() => router.push({ pathname: "/(tabs)/topic", params: { topic: tag.path } })}><View style={styles.folderIcon}><Text style={styles.folderGlyph}>▰</Text></View><View style={styles.rowCopy}><Text numberOfLines={1} style={styles.tagName}>{tag.name}</Text><Text style={styles.tagCount}>{tag.count} 张卡片</Text></View><Text style={styles.arrow}>›</Text></TouchableOpacity>)}</ScrollView> : <ScrollView contentContainerStyle={styles.questionList} showsVerticalScrollIndicator={false}>{cards.map((card) => <TouchableOpacity key={card.id} style={styles.questionRow} onPress={() => setEditingQuestion({ id: card.id, cat: card.cat, q: card.q, a: card.a, tags: card.tagPaths })}><View style={styles.questionIcon}><Text style={styles.questionGlyph}>Q</Text></View><View style={styles.rowCopy}><Text numberOfLines={1} style={styles.questionText}>{card.q.slice(0, 24)}{card.q.length > 24 ? "…" : ""}</Text><Text style={styles.questionMeta}>题目</Text></View><Text style={styles.fileMore}>•••</Text></TouchableOpacity>)}{cards.length === 0 ? <Text style={styles.empty}>当前标签暂无题目</Text> : null}</ScrollView>}
    <StudyScopeBottomSheet visible={scopeSheetVisible} rangeLabel={title.split("/").pop() || title} options={scopeOptions} onClose={() => setScopeSheetVisible(false)} onSelect={beginStudy} />
    <QuestionEditor visible={Boolean(editingQuestion)} question={editingQuestion} onClose={() => setEditingQuestion(null)} onSave={saveQuestion} onDelete={deleteQuestion} categories={availableTags} />
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: { height: 76, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", marginBottom: 8 }, headerTitle: { flex: 1, color: colors.text, fontSize: 30, fontWeight: "700", marginLeft: 3 }, actions: { flexDirection: "row", alignItems: "center", gap: 4 }, actionButton: { width: 38, height: 42, alignItems: "center", justifyContent: "center" }, play: { color: colors.text, fontSize: 22, lineHeight: 28 }, more: { color: colors.text, fontSize: 17, letterSpacing: 1.3 },
  tagList: { paddingHorizontal: 20, paddingBottom: 30 }, tagRow: { minHeight: 68, backgroundColor: colors.surface, borderRadius: 15, padding: 11, flexDirection: "row", alignItems: "center", marginBottom: 7, shadowColor: "#1d1d1d", shadowOpacity: 0.025, shadowRadius: 8, elevation: 1 }, folderIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center", marginRight: 12 }, folderGlyph: { color: colors.primary, fontSize: 22 }, rowCopy: { flex: 1, minWidth: 0 }, tagName: { color: colors.text, fontSize: 16, fontWeight: "600" }, tagCount: { color: colors.textSecondary, fontSize: 12, marginTop: 3 }, arrow: { color: colors.textSecondary, fontSize: 29, fontWeight: "300" },
  questionList: { paddingHorizontal: 20, paddingBottom: 30 }, questionRow: { minHeight: 62, backgroundColor: colors.surface, borderRadius: 15, padding: 10, flexDirection: "row", alignItems: "center", marginBottom: 7, shadowColor: "#1d1d1d", shadowOpacity: 0.025, shadowRadius: 8, elevation: 1 }, questionIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: `${colors.primary}18`, alignItems: "center", justifyContent: "center", marginRight: 11 }, questionGlyph: { color: colors.primary, fontSize: 16, fontWeight: "700" }, questionText: { color: colors.text, fontSize: 16, fontWeight: "600" }, questionMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 3 }, fileMore: { color: colors.textSecondary, letterSpacing: 1, fontSize: 14, marginLeft: 8 }, empty: { color: colors.textSecondary, textAlign: "center", fontSize: 15, marginTop: 72 },
});
