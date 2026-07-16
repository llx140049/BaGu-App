import { CheckCircle2, ChevronRight } from "lucide-react-native";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors } from "../tokens/colors";
import { TodayStudySummary } from "../data/study-plan";

export default function TodayStudyCard({ summary, reviewCount, onPress }: { summary: TodayStudySummary; reviewCount: number; onPress: () => void }) {
  const pendingLearning = Math.max(0, summary.target - summary.completed);
  const pendingTotal = pendingLearning + reviewCount;
  const names = summary.items.slice(0, 3).map((item) => item.tag);
  const more = Math.max(0, summary.items.length - 3);
  const content = summary.state === "no-plan" ? "还没有学习计划" : summary.state === "empty" ? "今天暂无待学习内容" : `${summary.completed} / ${pendingTotal}`;
  const detail = summary.state === "no-plan" ? "设置每日目标和学习内容" : summary.state === "empty" ? "可以调整计划或添加新的学习内容" : `${names.join(" · ")}${more ? `等 ${more} 项` : ""}`;
  return <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.76}>
    <View style={styles.topRow}><Text style={styles.title}>今日学习</Text><ChevronRight size={20} color={colors.textSecondary} /></View>
    <View style={styles.progressRow}><Text style={styles.progress}>{content}</Text>{summary.state === "complete" ? <CheckCircle2 size={17} color={colors.primary} /> : null}</View>
    <View style={styles.footer}><Text numberOfLines={1} style={styles.detail}>{detail}</Text></View>
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#F7F8FA", borderRadius: 16, padding: 16, minHeight: 112 }, topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, title: { color: colors.text, fontFamily: "MiSans-Medium", fontSize: 17 }, progressRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 10 }, progress: { color: colors.text, fontFamily: "MiSans-Semibold", fontSize: 21 }, footer: { marginTop: 8 }, detail: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 13 },
});
