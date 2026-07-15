import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { getDb } from "../../src/data/db";
import { colors } from "../../src/tokens/colors";
import { BackButton, MenuButton } from "../../src/components/PrototypeUI";

interface QuestionRow { cat: string; }
interface Topic { name: string; count: number; }
const topicOf = (category: string) => category.split("/").map((part) => part.trim()).filter(Boolean)[0] || "未分类";

export default function QuestionBankScreen() {
  const router = useRouter();
  const [topics, setTopics] = useState<Topic[]>([]);
  const loadTopics = useCallback(async () => {
    const database = await getDb();
    const rows: QuestionRow[] = await database.getAllAsync("SELECT cat FROM questions");
    const grouped = new Map<string, number>();
    rows.forEach((row) => grouped.set(topicOf(row.cat), (grouped.get(topicOf(row.cat)) ?? 0) + 1));
    setTopics(Array.from(grouped, ([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, "zh-CN")));
  }, []);
  useFocusEffect(useCallback(() => { loadTopics().catch(() => setTopics([])); }, [loadTopics]));

  return <View style={styles.page}>
    <View style={styles.titleRow}><BackButton onPress={() => router.back()} /><Text style={styles.title}>题库</Text></View>
    <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
      {topics.map((topic) => <TouchableOpacity key={topic.name} style={styles.row} onPress={() => router.push({ pathname: "/(tabs)/topic", params: { topic: topic.name } })}>
        <Text style={styles.folder}>▰</Text><Text style={styles.name}>{topic.name}</Text><Text style={styles.count}>{topic.count}</Text><Text style={styles.arrow}>›</Text>
      </TouchableOpacity>)}
      {topics.length === 0 ? <Text style={styles.empty}>还没有可学习的卡片</Text> : null}
    </ScrollView>
    <View style={styles.menuAnchor}><MenuButton onPress={() => router.push("/(tabs)/hub")} /></View>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingTop: 34 }, titleRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 19, marginBottom: 56 }, title: { color: colors.text, fontSize: 42, lineHeight: 50, fontWeight: "700", marginLeft: 2 }, list: { paddingHorizontal: 28, paddingBottom: 120 }, row: { minHeight: 86, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, folder: { color: colors.primary, fontSize: 34, marginRight: 24 }, name: { flex: 1, color: colors.text, fontSize: 27, fontWeight: "400" }, count: { color: colors.textSecondary, fontSize: 22, marginRight: 28 }, arrow: { color: colors.textSecondary, fontSize: 43, fontWeight: "300", marginTop: -4 }, empty: { color: colors.textSecondary, fontSize: 16, textAlign: "center", marginTop: 70 }, menuAnchor: { position: "absolute", left: 28, bottom: 34 },
});
