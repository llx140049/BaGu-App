import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useThemeStore } from "../../src/store/useThemeStore";
import { useCardStore } from "../../src/store/useCardStore";
import { colors } from "../../src/tokens/colors";
import { getDb, insertSampleData } from "../../src/data/db";

interface DbRow {
  id: string;
  cat: string;
  q: string;
  a: string;
  level: number;
}

export default function HomeScreen() {
  const router = useRouter();
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === "dark";
  const { cards, setCards } = useCardStore();
  const [dueCount, setDueCount] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const totalCards = cards.length;

  useEffect(() => {
    (async () => {
      await insertSampleData();
      const database = await getDb();
      const rows: DbRow[] = await database.getAllAsync(
        `SELECT q.id, q.cat, q.q, q.a, COALESCE(cp.level, 0) as level
         FROM questions q
         LEFT JOIN card_progress cp ON q.id = cp.question_id`
      );
      const mapped = rows.map((r: DbRow) => ({
        id: r.id,
        cat: r.cat,
        q: r.q,
        a: r.a,
        level: r.level,
        correct: 0,
        incorrect: 0,
        isStarred: false,
      }));
      setCards(mapped);
      setDueCount(mapped.filter((c) => c.level < 2).length);
      setTodayCount(mapped.length);
    })();
  }, []);

  const c = isDark ? colors.textDark : colors.text;
  const bg = isDark ? colors.bgDark : colors.bg;
  const surface = isDark ? colors.surfaceDark : colors.surface;

  return (
    <ScrollView style={[styles.container, { backgroundColor: bg }]}>
      <Text style={[styles.title, { color: c }]}>八股记忆</Text>

      {/* Progress cards */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: surface }]}>
          <Text style={[styles.statNumber, { color: colors.primary }]}>{dueCount}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>待复习</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: surface }]}>
          <Text style={[styles.statNumber, { color: colors.success }]}>{cards.filter((c) => c.level >= 3).length}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>已掌握</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: surface }]}>
          <Text style={[styles.statNumber, { color: colors.primary }]}>{todayCount}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>总题数</Text>
        </View>
      </View>

      {/* Category progress */}
      <Text style={[styles.sectionTitle, { color: c }]}>分类进度</Text>
      {["JavaScript", "React", "CSS", "网络"].map((cat) => {
        const catCards = cards.filter((c) => c.cat === cat);
        const learned = catCards.filter((c: any) => c.level >= 3).length;
        const total = catCards.length;
        return (
          <TouchableOpacity
            key={cat}
            style={[styles.catItem, { backgroundColor: surface }]}
            onPress={() => router.push("/study")}
          >
            <Text style={[styles.catName, { color: c }]}>{cat}</Text>
            <View style={styles.catBarBg}>
              <View style={[styles.catBarFill, { width: `${total > 0 ? (learned / total) * 100 : 0}%` }]} />
            </View>
            <Text style={[styles.catCount, { color: colors.textSecondary }]}>
              {learned}/{total}
            </Text>
          </TouchableOpacity>
        );
      })}

      {/* Quick start */}
      <TouchableOpacity
        style={[styles.startBtn, { backgroundColor: colors.primary }]}
        onPress={() => router.push("/study")}
      >
        <Text style={styles.startBtnText}>开始学习</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 28, fontWeight: "700", marginTop: 16, marginBottom: 20, textAlign: "center" },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
  statCard: { flex: 1, borderRadius: 12, padding: 16, alignItems: "center" },
  statNumber: { fontSize: 28, fontWeight: "700" },
  statLabel: { fontSize: 13, marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: "600", marginBottom: 12 },
  catItem: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 10, marginBottom: 8 },
  catName: { fontSize: 14, fontWeight: "500", width: 80 },
  catBarBg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "#d4c5b5", marginHorizontal: 8, overflow: "hidden" },
  catBarFill: { height: "100%", backgroundColor: colors.primary, borderRadius: 3 },
  catCount: { fontSize: 12, width: 40, textAlign: "right" },
  startBtn: { padding: 16, borderRadius: 12, alignItems: "center", marginTop: 8, marginBottom: 32 },
  startBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
