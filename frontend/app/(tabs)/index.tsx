import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useThemeStore } from "../../src/store/useThemeStore";
import { colors } from "../../src/tokens/colors";
import { getDb, insertSampleData } from "../../src/data/db";
import { MASTERED_LEVEL } from "../../src/data/sm2";

interface CardRow {
  level: number;
  lastReview?: string | null;
  nextReview?: string | null;
}

interface ContinueReading {
  id: string;
  title: string;
  reading_progress?: number;
  last_read_at?: string | null;
}

const DEFAULT_DAILY_NEW_TARGET = 10;

export default function HomeScreen() {
  const router = useRouter();
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === "dark";
  const [dueCount, setDueCount] = useState(0);
  const [newRemaining, setNewRemaining] = useState(0);
  const [dailyTarget, setDailyTarget] = useState(DEFAULT_DAILY_NEW_TARGET);
  const [continueReading, setContinueReading] = useState<ContinueReading | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    await insertSampleData();
    const database = await getDb();
    const cards: CardRow[] = await database.getAllAsync(
      `SELECT COALESCE(cp.level, 0) AS level,
              cp.last_review AS lastReview,
              cp.next_review AS nextReview
       FROM questions q
       LEFT JOIN card_progress cp ON q.id = cp.question_id`
    );
    const setting = await database.getFirstAsync(
      "SELECT value FROM app_settings WHERE key = ?",
      ["daily_new_target"]
    );
    const target = Math.max(1, Number(setting?.value) || DEFAULT_DAILY_NEW_TARGET);
    const today = new Date().toISOString().slice(0, 10);
    const completed = await database.getFirstAsync(
      "SELECT COALESCE(SUM(new_count), 0) AS cnt FROM study_records WHERE date = ?",
      [today]
    );
    const documents: ContinueReading[] = await database.getAllAsync(
      "SELECT id, title, reading_progress, last_read_at FROM documents"
    );
    const now = new Date();
    setDailyTarget(target);
    setDueCount(
      cards.filter(
        (card) =>
          card.level < MASTERED_LEVEL &&
          Boolean(card.lastReview) &&
          (!card.nextReview || new Date(card.nextReview) <= now)
      ).length
    );
    setNewRemaining(Math.max(0, target - Number(completed?.cnt ?? 0)));
    setContinueReading(
      documents
        .filter((document) => document.last_read_at)
        .sort((a, b) => String(b.last_read_at).localeCompare(String(a.last_read_at)))[0] ?? null
    );
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadOverview(); }, [loadOverview]));

  const c = isDark ? colors.textDark : colors.text;
  const bg = isDark ? colors.bgDark : colors.bg;
  const surface = isDark ? colors.surfaceDark : colors.surface;
  const startScope = dueCount > 0 ? "due" : "new";
  const startLimit = startScope === "new" ? newRemaining : undefined;

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: bg }]}>
      <Text style={[styles.title, { color: c }]}>学习</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>今天也向目标迈进一步</Text>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: surface }]}>
          <Text style={[styles.statNumber, { color: colors.primary }]}>{loading ? "-" : dueCount}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>今日待复习</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: surface }]}>
          <Text style={[styles.statNumber, { color: colors.success }]}>{loading ? "-" : newRemaining}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>今日待学习</Text>
        </View>
      </View>

      <View style={[styles.goalCard, { backgroundColor: surface }]}>
        <View>
          <Text style={[styles.goalTitle, { color: c }]}>每日新题目标</Text>
          <Text style={[styles.goalDesc, { color: colors.textSecondary }]}>当前目标：{dailyTarget} 题</Text>
        </View>
        <TouchableOpacity onPress={() => router.push("/(tabs)/settings")}>
          <Text style={[styles.goalAction, { color: colors.primary }]}>去设置</Text>
        </TouchableOpacity>
      </View>

      {continueReading ? (
        <TouchableOpacity
          style={[styles.readingCard, { backgroundColor: surface }]}
          onPress={() => router.push({ pathname: "/(tabs)/doc-reader", params: { id: continueReading.id } })}
        >
          <Text style={[styles.readingEyebrow, { color: colors.primary }]}>继续阅读</Text>
          <Text numberOfLines={1} style={[styles.readingTitle, { color: c }]}>{continueReading.title}</Text>
          <View style={styles.readingTrack}>
            <View style={[styles.readingFill, { width: `${Math.min(100, Math.max(0, continueReading.reading_progress ?? 0))}%` }]} />
          </View>
          <Text style={[styles.readingMeta, { color: colors.textSecondary }]}>上次阅读：{new Date(continueReading.last_read_at!).toLocaleString()}</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        style={[styles.startBtn, { backgroundColor: colors.primary, opacity: loading ? 0.6 : 1 }]}
        disabled={loading}
        onPress={() => router.push({ pathname: "/(tabs)/study", params: { scope: startScope, ...(startLimit ? { limit: String(startLimit) } : {}) } })}
      >
        <Text style={styles.startBtnText}>{dueCount > 0 ? "开始复习" : "开始学习"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 16 },
  title: { fontSize: 28, fontWeight: "700", marginTop: 16 },
  subtitle: { fontSize: 14, marginTop: 6, marginBottom: 24 },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  statCard: { flex: 1, borderRadius: 14, padding: 20, minHeight: 122, justifyContent: "space-between" },
  statNumber: { fontSize: 36, fontWeight: "700" },
  statLabel: { fontSize: 14 },
  goalCard: { borderRadius: 14, padding: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  goalTitle: { fontSize: 16, fontWeight: "600" },
  goalDesc: { fontSize: 13, marginTop: 6 },
  goalAction: { fontSize: 14, fontWeight: "600" },
  readingCard: { borderRadius: 14, padding: 18, marginTop: 16 },
  readingEyebrow: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  readingTitle: { fontSize: 16, fontWeight: "600", marginBottom: 12 },
  readingTrack: { height: 5, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" },
  readingFill: { height: "100%", backgroundColor: colors.primary, borderRadius: 3 },
  readingMeta: { fontSize: 12, marginTop: 10 },
  startBtn: { padding: 17, borderRadius: 14, alignItems: "center", marginTop: 24 },
  startBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
