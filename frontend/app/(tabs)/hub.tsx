import { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { BarChart3, BookOpenCheck, ChevronRight, CircleHelp, FileText, Settings, type LucideIcon } from "lucide-react-native";
import { colors } from "../../src/tokens/colors";
import { BackButton } from "../../src/components/PrototypeUI";
import { getDb } from "../../src/data/db";
import TodayStudyCard from "../../src/components/TodayStudyCard";
import { getPlanReviewCount, getTodayStudySummary, TodayStudySummary } from "../../src/data/study-plan";

interface HubItemProps { icon: LucideIcon; iconColor: string; title: string; detail?: string; featured?: boolean; onPress: () => void; }
function HubItem({ icon, iconColor, title, detail, featured = false, onPress }: HubItemProps) {
  const Icon = icon;
  return <TouchableOpacity style={[styles.item, featured && styles.featuredItem]} onPress={onPress}>
    <View style={[styles.iconBox, { backgroundColor: colors.iconBackground }]}><Icon size={featured ? 20 : 19} color={iconColor} /></View>
    <View style={styles.itemCopy}><Text style={[styles.itemTitle, featured && styles.featuredTitle]}>{title}</Text>{detail ? <Text style={styles.itemDetail}>{detail}</Text> : null}</View>
    <ChevronRight size={20} color="#a5a5ad" />
  </TouchableOpacity>;
}

export default function KnowledgeHubScreen() {
  const router = useRouter();
  const [counts, setCounts] = useState({ questions: 0, documents: 0 });
  const [todaySummary, setTodaySummary] = useState<TodayStudySummary>({ completed: 0, target: 0, items: [], state: "no-plan" });
  const [reviewCount, setReviewCount] = useState(0);
  const loadCounts = useCallback(async () => {
    const database = await getDb();
    const [questionRow, documentRow] = await Promise.all([
      database.getFirstAsync("SELECT COUNT(*) AS cnt FROM questions"),
      database.getFirstAsync("SELECT COUNT(*) AS cnt FROM documents"),
    ]);
    setCounts({ questions: Number(questionRow?.cnt ?? 0), documents: Number(documentRow?.cnt ?? 0) });
  }, []);
  useFocusEffect(useCallback(() => { loadCounts().catch(() => setCounts({ questions: 0, documents: 0 })); getTodayStudySummary().then(async (summary) => { setTodaySummary(summary); setReviewCount(await getPlanReviewCount(summary.items)); }).catch(() => { setTodaySummary({ completed: 0, target: 0, items: [], state: "no-plan" }); setReviewCount(0); }); }, [loadCounts]));

  return <View style={styles.page}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.titleRow}><BackButton onPress={() => router.back()} /><Text style={styles.title}>知识库</Text></View>
      <TodayStudyCard summary={todaySummary} reviewCount={reviewCount} onPress={() => router.push("/(tabs)/study-plan")} />
      <View style={styles.primaryList}>
        <HubItem icon={BookOpenCheck} iconColor="#E8A23C" title="题库" detail={`${counts.questions} 张卡片`} featured onPress={() => router.push("/(tabs)/questions")} />
        <View style={styles.divider} />
        <HubItem icon={FileText} iconColor="#5FA86E" title="文档库" detail={`${counts.documents} 个文档`} featured onPress={() => router.push("/(tabs)/documents")} />
      </View>
      <View style={styles.majorDivider} />
      <View style={styles.secondaryList}>
        <HubItem icon={BarChart3} iconColor="#8A79D9" title="学习统计" onPress={() => router.push("/(tabs)/stats")} />
        <View style={styles.divider} />
        <HubItem icon={Settings} iconColor="#7E8797" title="设置" onPress={() => router.push("/(tabs)/settings")} />
        <View style={styles.divider} />
        <HubItem icon={CircleHelp} iconColor="#9A9A9A" title="帮助与反馈" onPress={() => Alert.alert("帮助与反馈", "该功能将在下一阶段完善")} />
      </View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, paddingTop: 30, paddingHorizontal: 24, paddingBottom: 32 },
  titleRow: { flexDirection: "row", alignItems: "center", height: 48, marginBottom: 16, marginLeft: -9 },
  title: { color: colors.text, fontFamily: "MiSans-Semibold", fontSize: 24, marginLeft: 5 },
  primaryList: { marginTop: 24 }, secondaryList: {},
  item: { minHeight: 58, flexDirection: "row", alignItems: "center", paddingHorizontal: 8 },
  featuredItem: { minHeight: 68 },
  iconBox: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 14 },
  itemCopy: { flex: 1 },
  itemTitle: { color: colors.text, fontFamily: "MiSans-Medium", fontSize: 16 },
  featuredTitle: { fontSize: 18 },
  itemDetail: { color: "#9a9aa3", fontFamily: "MiSans-Regular", fontSize: 13, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 60, backgroundColor: "#eeeeF1" },
  majorDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#dedee4", marginVertical: 18 },
});
