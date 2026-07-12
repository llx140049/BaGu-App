import { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "expo-router";
import { useThemeStore } from "../../src/store/useThemeStore";
import { colors } from "../../src/tokens/colors";
import { getDb } from "../../src/data/db";
import { MASTERED_LEVEL } from "../../src/data/sm2";

interface StatsData {
  total: number;
  studiedToday: number;
  mastered: number;
  needReview: number;
  starred: number;
  correctRate: number;
  categories: { cat: string; total: number; mastered: number }[];
  levels: { level: number; count: number }[];
  weekActivity: { day: string; count: number }[];
}

const DAYS = ["日", "一", "二", "三", "四", "五", "六"];

export default function StatsScreen() {
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === "dark";
  const c = isDark ? colors.textDark : colors.text;
  const bg = isDark ? colors.bgDark : colors.bg;
  const surface = isDark ? colors.surfaceDark : colors.surface;
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const db = await getDb();

      const totalRow: any = await db.getFirstAsync("SELECT COUNT(*) as cnt FROM questions");
      const total = totalRow?.cnt ?? 0;

      const today = new Date().toISOString().slice(0, 10);
      const todayRow: any = await db.getFirstAsync(
        "SELECT COALESCE(SUM(count), 0) as cnt FROM study_records WHERE date = ?", [today]
      );
      const studiedToday = todayRow?.cnt ?? 0;

      // Mastered = level >= MASTERED_LEVEL
      const masteredRow: any = await db.getFirstAsync(
        "SELECT COUNT(*) as cnt FROM card_progress WHERE level >= ?",
        [MASTERED_LEVEL]
      );
      const mastered = masteredRow?.cnt ?? 0;

      const needRow: any = await db.getFirstAsync(
        `SELECT COUNT(*) as cnt FROM card_progress 
         WHERE (next_review IS NULL OR next_review <= ?) AND level < ?`,
        [new Date().toISOString(), MASTERED_LEVEL]
      );
      const needReview = needRow?.cnt ?? 0;

      const starredRow: any = await db.getFirstAsync(
        "SELECT COUNT(*) as cnt FROM card_progress WHERE is_starred = 1"
      );
      const starred = starredRow?.cnt ?? 0;

      const correctRow: any = await db.getFirstAsync(
        "SELECT COALESCE(SUM(correct),0) as cor, COALESCE(SUM(incorrect),0) as inc FROM card_progress"
      );
      const totalAnswered = (correctRow?.cor ?? 0) + (correctRow?.inc ?? 0);
      const correctRate = totalAnswered > 0 ? Math.round((correctRow?.cor ?? 0) / totalAnswered * 100) : 0;

      // Categories
      const catRows: any[] = await db.getAllAsync(
        `SELECT q.cat, COUNT(*) as total, 
                COALESCE(SUM(CASE WHEN cp.level >= ${MASTERED_LEVEL} THEN 1 ELSE 0 END), 0) as mastered
         FROM questions q
         LEFT JOIN card_progress cp ON q.id = cp.question_id
         GROUP BY q.cat`
      );
      const categories = catRows.map((r: any) => ({ cat: r.cat, total: r.total, mastered: r.mastered }));

      // Level distribution
      const levelRows: any[] = await db.getAllAsync(
        `SELECT COALESCE(level, 0) as level, COUNT(*) as count 
         FROM card_progress GROUP BY level ORDER BY level`
      );
      const levels = levelRows.map((r: any) => ({ level: r.level, count: r.count }));
      // Fill missing levels
      for (let i = 0; i <= 7; i++) {
        if (!levels.find((l) => l.level === i)) levels.push({ level: i, count: 0 });
      }
      levels.sort((a, b) => a.level - b.level);

      // Week activity — last 7 days from study_records
      const weekActivity: { day: string; count: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        const ds = d.toISOString().slice(0, 10);
        const dayName = DAYS[d.getDay()];
        const row: any = await db.getFirstAsync(
          "SELECT COALESCE(SUM(count), 0) as cnt FROM study_records WHERE date = ?", [ds]
        );
        weekActivity.push({ day: dayName, count: row?.cnt ?? 0 });
      }

      setStats({ total, studiedToday, mastered, needReview, starred, correctRate, categories, levels, weekActivity });
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadStats(); }, [loadStats]));

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: bg, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const maxWeekCount = Math.max(1, ...(stats?.weekActivity.map((w) => w.count) ?? [1]));
  const maxLevelCount = Math.max(1, ...(stats?.levels.map((l) => l.count) ?? [1]));

  return (
    <ScrollView style={[styles.container, { backgroundColor: bg }]}>
      <Text style={[styles.title, { color: c }]}>统计</Text>

      {/* Overview Cards */}
      <View style={styles.overviewRow}>
        <StatCard label="总题目" value={stats?.total ?? 0} color={colors.primary} surface={surface} c={c} />
        <StatCard label="今日学习" value={stats?.studiedToday ?? 0} color={colors.success} surface={surface} c={c} />
        <StatCard label="已掌握" value={stats?.mastered ?? 0} color={colors.primaryDark} surface={surface} c={c} />
        <StatCard label="待复习" value={stats?.needReview ?? 0} color={colors.warning} surface={surface} c={c} />
      </View>

      {/* Correct Rate */}
      <View style={[statStyles.card, { backgroundColor: surface }]}>
        <Text style={[statStyles.label, { color: c }]}>正确率</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
          <Text style={{ fontSize: 36, fontWeight: "700", color: stats!.correctRate >= 60 ? colors.success : colors.warning }}>
            {stats!.correctRate}%
          </Text>
          <Text style={{ fontSize: 13, color: colors.textTertiary }}>总答题数</Text>
        </View>
        <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
          <View style={[styles.progressFill, { width: `${Math.min(stats!.correctRate, 100)}%`, backgroundColor: stats!.correctRate >= 60 ? colors.success : colors.warning }]} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 14 }}>
          <View><Text style={{ fontSize: 11, color: colors.textTertiary }}>收藏</Text><Text style={{ fontSize: 16, fontWeight: "600", color: c }}>{stats!.starred}</Text></View>
          <View><Text style={{ fontSize: 11, color: colors.textTertiary }}>已掌握 (Lv5+)</Text><Text style={{ fontSize: 16, fontWeight: "600", color: c }}>{stats!.mastered}</Text></View>
          <View><Text style={{ fontSize: 11, color: colors.textTertiary }}>待复习</Text><Text style={{ fontSize: 16, fontWeight: "600", color: colors.warning }}>{stats!.needReview}</Text></View>
        </View>
      </View>

      {/* Week Activity */}
      <View style={[statStyles.card, { backgroundColor: surface }]}>
        <Text style={[statStyles.label, { color: c }]}>本周学习</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-around", alignItems: "flex-end", height: 90, marginTop: 8 }}>
          {stats!.weekActivity.map((w, i) => (
            <View key={i} style={{ alignItems: "center", flex: 1 }}>
              <View style={{
                width: 22, borderRadius: 4,
                height: Math.max(4, (w.count / maxWeekCount) * 60),
                backgroundColor: w.count > 0 ? colors.primary : colors.border,
              }} />
              <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 4 }}>{w.day}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Category Progress */}
      <View style={[statStyles.card, { backgroundColor: surface }]}>
        <Text style={[statStyles.label, { color: c }]}>分类进度</Text>
        {stats!.categories.length === 0 ? (
          <Text style={{ fontSize: 13, color: colors.textTertiary }}>暂无数据</Text>
        ) : (
          stats!.categories.map((cat) => (
            <View key={cat.cat} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: "500", color: c }}>{cat.cat}</Text>
                <Text style={{ fontSize: 12, color: colors.textTertiary }}>{cat.mastered}/{cat.total}</Text>
              </View>
              <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                <View style={[styles.progressFill, { width: `${(cat.mastered / Math.max(1, cat.total)) * 100}%`, backgroundColor: colors.primary }]} />
              </View>
            </View>
          ))
        )}
      </View>

      {/* Level Distribution */}
      <View style={[statStyles.card, { backgroundColor: surface }]}>
        <Text style={[statStyles.label, { color: c }]}>掌握等级分布</Text>
        <Text style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 10 }}>Lv0=新题  Lv7=完全掌握</Text>
        {stats!.levels.map((l) => (
          <View key={l.level} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
            <Text style={{ width: 30, fontSize: 12, color: colors.textTertiary }}>Lv{l.level}</Text>
            <View style={[styles.progressBar, { flex: 1, backgroundColor: colors.border, height: 14 }]}>
              <View style={[styles.progressFill, {
                width: `${(l.count / maxLevelCount) * 100}%`,
                height: 14,
                backgroundColor: l.level >= MASTERED_LEVEL ? colors.success : l.level >= 3 ? colors.primary : colors.warning,
              }]} />
            </View>
            <Text style={{ width: 28, textAlign: "right", fontSize: 11, color: colors.textSecondary }}>{l.count}</Text>
          </View>
        ))}
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

function StatCard({ label, value, color, surface, c }: { label: string; value: number; color: string; surface: string; c: string }) {
  return (
    <View style={[statStyles.smallCard, { backgroundColor: surface }]}>
      <Text style={{ fontSize: 11, color: colors.textTertiary }}>{label}</Text>
      <Text style={{ fontSize: 22, fontWeight: "700", color, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: "700", marginTop: 16, marginBottom: 16 },
  overviewRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  progressBar: { height: 8, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4 },
});

const statStyles = StyleSheet.create({
  card: { borderRadius: 12, padding: 20, marginBottom: 12 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  smallCard: { flex: 1, borderRadius: 10, padding: 12, alignItems: "center" },
});
