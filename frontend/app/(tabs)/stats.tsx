import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { getDb } from "../../src/data/db";
import { MASTERED_LEVEL } from "../../src/data/sm2";
import { useThemeStore } from "../../src/store/useThemeStore";
import { colors } from "../../src/tokens/colors";
import { BackButton } from "../../src/components/PrototypeUI";
import { parseQuestionTags, topLevelTag } from "../../src/data/tagging";

type HeatmapRange = "week" | "month";

interface QuestionProgress {
  level: number;
  lastReview?: string | null;
  nextReview?: string | null;
  cat: string;
  tags?: string | string[] | null;
}

interface StatsData {
  total: number;
  studiedToday: number;
  mastered: number;
  needReview: number;
  tags: { name: string; total: number; studied: number; mastered: number }[];
  activity: { date: string; count: number }[];
}

const RANGE_LABELS: Record<HeatmapRange, string> = { week: "本周", month: "近2月" };
const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

function startOfWeek(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildHeatmap(activity: StatsData["activity"], range: HeatmapRange) {
  const weekCount = range === "week" ? 1 : 9;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = startOfWeek(today);
  start.setDate(start.getDate() - (weekCount - 1) * 7);
  const activityByDate = new Map(activity.map((item) => [item.date, item.count]));

  return Array.from({ length: weekCount }, (_, weekIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) => {
      const date = new Date(start);
      date.setDate(start.getDate() + weekIndex * 7 + dayIndex);
      return { date, count: activityByDate.get(dateKey(date)) ?? 0, isFuture: date > today };
    })
  );
}

export default function StatsScreen() {
  const router = useRouter();
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === "dark";
  const textColor = isDark ? colors.textDark : colors.text;
  const backgroundColor = isDark ? colors.bgDark : colors.bg;
  const surface = isDark ? colors.surfaceDark : colors.surface;
  const [range, setRange] = useState<HeatmapRange>("week");
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const database = await getDb();
      const cards: QuestionProgress[] = await database.getAllAsync(
        `SELECT COALESCE(cp.level, 0) AS level,
                cp.last_review AS lastReview,
                cp.next_review AS nextReview,
                q.cat AS cat,
                q.tags AS tags
         FROM questions q
         LEFT JOIN card_progress cp ON q.id = cp.question_id`
      );
      const today = new Date().toISOString().slice(0, 10);
      const todayRow: any = await database.getFirstAsync(
        "SELECT COALESCE(SUM(count), 0) AS cnt FROM study_records WHERE date = ?",
        [today]
      );
      const activity: { date: string; count: number }[] = await database.getAllAsync("SELECT date, count FROM study_records");
      const tagMap = new Map<string, { total: number; studied: number; mastered: number }>();
      for (const card of cards) {
        const names = parseQuestionTags(card.tags, card.cat).map(topLevelTag);
        const effectiveTags = Array.from(new Set(names.length > 0 ? names : ["未分类"]));
        for (const name of effectiveTags) {
          const current = tagMap.get(name) ?? { total: 0, studied: 0, mastered: 0 };
          current.total += 1;
          if (card.lastReview) current.studied += 1;
          if (card.level >= MASTERED_LEVEL) current.mastered += 1;
          tagMap.set(name, current);
        }
      }
      const now = new Date();
      setStats({
        total: cards.length,
        studiedToday: Number(todayRow?.cnt ?? 0),
        mastered: cards.filter((card) => card.level >= MASTERED_LEVEL).length,
        needReview: cards.filter((card) => card.level < MASTERED_LEVEL && Boolean(card.lastReview) && (!card.nextReview || new Date(card.nextReview) <= now)).length,
        tags: Array.from(tagMap.entries())
          .map(([name, data]) => ({ name, ...data }))
          .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name)),
        activity,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadStats(); }, [loadStats]));

  const heatmapWeeks = useMemo(() => buildHeatmap(stats?.activity ?? [], range), [range, stats?.activity]);
  const maxActivity = Math.max(1, ...heatmapWeeks.flat().map((day) => day.count));
  const weekDays = heatmapWeeks[0] ?? [];

  if (loading) {
    return <View style={[styles.loading, { backgroundColor }]}><ActivityIndicator color={colors.statistics} size="large" /></View>;
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor }]}>
      <View style={styles.pageHeader}><BackButton onPress={() => router.back()} /><Text style={[styles.title, { color: textColor }]}>统计</Text><View style={styles.headerSpacer} /></View>

      <View style={styles.overviewRow}>
        <StatCard label="总题数" value={stats?.total ?? 0} color={colors.statistics} surface={surface} />
        <StatCard label="今日学习" value={stats?.studiedToday ?? 0} color={colors.statistics} surface={surface} />
        <StatCard label="已掌握" value={stats?.mastered ?? 0} color={colors.statistics} surface={surface} />
        <StatCard label="待复习" value={stats?.needReview ?? 0} color={colors.statistics} surface={surface} />
      </View>

      <View style={[styles.card, { backgroundColor: surface }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>{RANGE_LABELS[range]}学习热力图</Text>
          <View style={styles.rangeButtons}>
            {(["week", "month"] as HeatmapRange[]).map((item) => (
              <TouchableOpacity key={item} style={[styles.rangeButton, range === item && { backgroundColor: colors.statistics }]} onPress={() => setRange(item)}>
                <Text style={[styles.rangeText, { color: range === item ? "#fff" : textColor }]}>{RANGE_LABELS[item]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {range === "week" ? (
          <View style={styles.weekChart}>
            {weekDays.map((day, index) => (
              <View key={index} style={styles.barColumn}>
                <Text style={[styles.barValue, { color: colors.textSecondary }]}>{day.isFuture ? "" : day.count}</Text>
                <View style={[styles.barTrack, { backgroundColor: isDark ? "#393741" : "#E8E6EE" }]}>
                  <View style={[styles.barFill, { height: `${day.isFuture ? 0 : Math.max(day.count > 0 ? 8 : 0, (day.count / maxActivity) * 100)}%` }]} />
                </View>
                <Text style={[styles.barLabel, { color: colors.textSecondary }]}>{WEEKDAY_LABELS[index]}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.heatmapBody}>
            <View style={styles.weekdayColumn}>
              {WEEKDAY_LABELS.map((day) => <Text key={day} style={[styles.weekday, { color: colors.textSecondary }]}>{day}</Text>)}
            </View>
            <View style={styles.heatmapGrid}>
              {WEEKDAY_LABELS.map((_, row) => (
                <View key={row} style={styles.heatmapRow}>
                  {heatmapWeeks.map((week, column) => {
                    const day = week[row];
                    const intensity = day.count / maxActivity;
                    const backgroundColor = day.isFuture || day.count === 0
                      ? (isDark ? "#393741" : "#E8E6EE")
                      : intensity > 0.66 ? colors.statistics : intensity > 0.33 ? colors.statistics : colors.statisticsLight;
                    return <View key={column} style={[styles.heatCell, { backgroundColor }]} />;
                  })}
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: surface }]}>
        <Text style={[styles.sectionTitle, { color: textColor }]}>标签做题进度</Text>
        {stats?.tags.length ? stats.tags.map((tag) => (
          <View key={tag.name} style={styles.tagRow}>
            <View style={styles.tagHeader}>
              <Text style={[styles.tagName, { color: textColor }]}>{tag.name}</Text>
              <Text style={[styles.tagPercent, { color: "#7C5CE0" }]}>{Math.round((tag.mastered / Math.max(1, tag.total)) * 100)}%</Text>
            </View>
            <Text style={[styles.tagDetail, { color: colors.textTertiary }]}>已做 {tag.studied}/{tag.total} · 已掌握 {tag.mastered}</Text>
            <View style={[styles.progressTrack, { backgroundColor: isDark ? "#2e353a" : colors.border }]}>
              <View style={[styles.masteredFill, { width: `${(tag.mastered / Math.max(1, tag.total)) * 100}%` }]} />
            </View>
          </View>
        )) : <Text style={[styles.emptyText, { color: colors.textTertiary }]}>暂无题目数据</Text>}
      </View>
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

function StatCard({ label, value, color, surface }: { label: string; value: number; color: string; surface: string }) {
  return <View style={[styles.smallCard, { backgroundColor: surface }]}><Text style={styles.statLabel}>{label}</Text><Text style={[styles.statValue, { color }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  pageHeader: { flexDirection: "row", alignItems: "center", marginTop: 8, marginBottom: 16, marginLeft: -7 }, title: { flex: 1, fontFamily: "MiSans-Semibold", fontSize: 22, marginLeft: 3 }, headerSpacer: { width: 42 },
  overviewRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  smallCard: { flex: 1, borderRadius: 10, padding: 10, alignItems: "center" },
  statLabel: { fontFamily: "MiSans-Regular", fontSize: 11, color: colors.textTertiary },
  statValue: { fontFamily: "MiSans-Semibold", fontSize: 21, marginTop: 3 },
  card: { borderRadius: 12, padding: 18, marginBottom: 12 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  sectionTitle: { fontFamily: "MiSans-Medium", fontSize: 15 },
  rangeButtons: { flexDirection: "row", borderWidth: 1, borderColor: colors.border, borderRadius: 7, overflow: "hidden" },
  rangeButton: { paddingHorizontal: 9, paddingVertical: 5 },
  rangeText: { fontFamily: "MiSans-Medium", fontSize: 12 },
  heatmapBody: { flexDirection: "row" },
  weekChart: { height: 150, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  barColumn: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end" },
  barValue: { fontSize: 11, height: 18 },
  barTrack: { width: 18, height: 104, borderRadius: 5, justifyContent: "flex-end", overflow: "hidden" },
  barFill: { width: "100%", backgroundColor: colors.statistics, borderRadius: 5 },
  barLabel: { fontSize: 11, marginTop: 6 },
  weekdayColumn: { width: 20 },
  weekday: { height: 21, fontSize: 10 },
  heatmapGrid: { flex: 1 },
  heatmapRow: { flexDirection: "row", height: 21 },
  heatCell: { width: 18, height: 18, marginRight: 3, marginBottom: 3, borderRadius: 4 },
  tagRow: { marginTop: 16 },
  tagHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tagName: { fontFamily: "MiSans-Medium", fontSize: 14 },
  tagPercent: { fontFamily: "MiSans-Semibold", fontSize: 13 },
  tagDetail: { fontFamily: "MiSans-Regular", fontSize: 12, marginTop: 4, marginBottom: 7 },
  progressTrack: { height: 8, borderRadius: 4, overflow: "hidden", position: "relative" },
  masteredFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 4, backgroundColor: colors.primary },
  emptyText: { fontFamily: "MiSans-Regular", marginTop: 12, fontSize: 13 },
});
