import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { getDb } from "../../src/data/db";
import { isCardDue, MASTERED_LEVEL } from "../../src/data/sm2";
import { colors } from "../../src/tokens/colors";
import { BackButton, BottomPrimaryButton } from "../../src/components/PrototypeUI";

type StudyFilter = "all" | "review" | "favorite" | "wrong" | "unlearned";
interface CardRow { id: string; cat: string; level: number; incorrect: number; isStarred: number | boolean; lastReview?: string | null; nextReview?: string | null; }
const filters: { key: StudyFilter; label: string }[] = [{ key: "all", label: "全部" }, { key: "review", label: "待复习" }, { key: "favorite", label: "收藏" }, { key: "wrong", label: "错题" }, { key: "unlearned", label: "未学" }];
const scopeFor = (filter: StudyFilter) => filter === "review" ? "due" : filter === "favorite" ? "starred" : filter === "wrong" ? "mistakes" : filter === "unlearned" ? "new" : "all";

export default function TopicDetailScreen() {
  const router = useRouter();
  const { topic } = useLocalSearchParams<{ topic: string }>();
  const [filter, setFilter] = useState<StudyFilter>("all");
  const [cards, setCards] = useState<CardRow[]>([]);
  const title = topic || "专题";
  const loadCards = useCallback(async () => {
    const database = await getDb();
    const rows: CardRow[] = await database.getAllAsync(`SELECT q.id, q.cat, COALESCE(cp.level, 0) AS level, COALESCE(cp.incorrect, 0) AS incorrect, COALESCE(cp.is_starred, 0) AS isStarred, cp.last_review AS lastReview, cp.next_review AS nextReview FROM questions q LEFT JOIN card_progress cp ON q.id = cp.question_id`);
    setCards(rows.filter((card) => card.cat === title || card.cat.startsWith(`${title}/`)));
  }, [title]);
  useFocusEffect(useCallback(() => { loadCards().catch(() => setCards([])); }, [loadCards]));

  const selected = useMemo(() => {
    if (filter === "review") return cards.filter((card) => card.level < MASTERED_LEVEL && Boolean(card.lastReview) && isCardDue(card.nextReview));
    if (filter === "favorite") return cards.filter((card) => Boolean(card.isStarred));
    if (filter === "wrong") return cards.filter((card) => card.incorrect > 0);
    if (filter === "unlearned") return cards.filter((card) => !card.lastReview);
    return cards;
  }, [cards, filter]);
  const mastered = selected.filter((card) => card.level >= MASTERED_LEVEL).length;
  const blurry = selected.filter((card) => Boolean(card.lastReview) && card.level < MASTERED_LEVEL && !isCardDue(card.nextReview)).length;
  const unlearned = selected.filter((card) => !card.lastReview).length;
  const activeLabel = filters.find((item) => item.key === filter)?.label ?? "全部";
  const actionLabel = selected.length === 0 ? "暂无可学习卡片" : filter === "all" ? `开始学习 ${selected.length} 张卡片` : `开始学习 ${selected.length} 张${activeLabel}`;

  return <View style={styles.page}>
    <View style={styles.header}><BackButton onPress={() => router.back()} /><Text style={styles.more}>•••</Text></View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{filters.map((item) => <TouchableOpacity key={item.key} style={[styles.filter, filter === item.key && styles.filterActive]} onPress={() => setFilter(item.key)}><Text style={[styles.filterText, filter === item.key && styles.filterTextActive]}>{item.label}</Text></TouchableOpacity>)}</ScrollView>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>{filter === "all" ? "全部卡片" : activeLabel}</Text>
        <Text style={styles.total}>{selected.length}<Text style={styles.unit}> 张卡片</Text></Text>
        <TouchableOpacity style={styles.directory}><Text style={styles.directoryText}>查看全部知识点</Text><Text style={styles.directoryArrow}>›</Text></TouchableOpacity>
        {filter === "wrong" ? <View style={styles.wrongState}><Text style={styles.wrongMark}>×</Text><View><Text style={styles.wrongTitle}>全部答错</Text><Text style={styles.wrongHint}>需要重点巩固</Text></View></View> : <View style={styles.statuses}>
          {filter !== "review" ? <Status color={colors.primary} value={mastered} label="已掌握" /> : null}
          <Status color={colors.primaryDark} value={blurry} label="模糊" />
          <Status color={colors.textSecondary} value={unlearned} label="未学" />
        </View>}
      </View>
    </ScrollView>
    <BottomPrimaryButton label={actionLabel} disabled={selected.length === 0} onPress={() => router.push({ pathname: "/(tabs)/study", params: { scope: scopeFor(filter), topic: title } })} />
  </View>;
}

function Status({ color, value, label }: { color: string; value: number; label: string }) { return <View style={styles.status}><View style={[styles.dot, { backgroundColor: color }]} /><Text style={styles.statusValue}>{value}</Text><Text style={styles.statusLabel}>{label}</Text></View>; }
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg }, header: { height: 84, paddingHorizontal: 18, paddingTop: 28, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, more: { color: colors.text, fontSize: 23, letterSpacing: 2 }, content: { padding: 28, paddingTop: 18, paddingBottom: 30 }, title: { color: colors.text, fontSize: 39, fontWeight: "700", marginBottom: 26 }, filters: { gap: 10, paddingRight: 12 }, filter: { backgroundColor: "#f1f1f3", borderRadius: 19, paddingHorizontal: 15, paddingVertical: 10 }, filterActive: { backgroundColor: colors.primary }, filterText: { color: colors.text, fontSize: 14, fontWeight: "600" }, filterTextActive: { color: "#fff" }, card: { backgroundColor: colors.surface, borderRadius: 20, marginTop: 27, padding: 22, shadowColor: "#161616", shadowOpacity: 0.035, shadowRadius: 14, elevation: 1 }, eyebrow: { color: colors.textSecondary, fontSize: 15 }, total: { color: colors.text, fontSize: 39, lineHeight: 52, fontWeight: "500", marginTop: 4 }, unit: { fontSize: 18, fontWeight: "400" }, directory: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginTop: 20, paddingVertical: 22, flexDirection: "row", alignItems: "center" }, directoryText: { color: colors.text, flex: 1, fontSize: 16, fontWeight: "500" }, directoryArrow: { color: colors.textSecondary, fontSize: 30 }, statuses: { flexDirection: "row", justifyContent: "space-around", paddingTop: 26 }, status: { alignItems: "center", minWidth: 72 }, dot: { width: 8, height: 8, borderRadius: 4, marginBottom: 11 }, statusValue: { color: colors.text, fontSize: 26, fontWeight: "600" }, statusLabel: { color: colors.textSecondary, fontSize: 13, marginTop: 8 }, wrongState: { paddingTop: 23, flexDirection: "row", alignItems: "center", gap: 13 }, wrongMark: { width: 34, height: 34, borderRadius: 17, overflow: "hidden", textAlign: "center", paddingTop: 1, color: "#fff", backgroundColor: colors.danger, fontSize: 28, lineHeight: 31 }, wrongTitle: { color: colors.text, fontSize: 16, fontWeight: "600" }, wrongHint: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
});
