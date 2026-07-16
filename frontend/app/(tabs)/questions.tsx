import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { BookOpen, ChevronRight } from "lucide-react-native";
import { getDb } from "../../src/data/db";
import { colors } from "../../src/tokens/colors";
import { BackButton } from "../../src/components/PrototypeUI";
import { parseQuestionTags, topLevelTag } from "../../src/data/tagging";

interface QuestionRow { id: string; cat: string; tags?: string | null; }
interface Topic { name: string; count: number; }

export default function QuestionBankScreen() {
  const router = useRouter();
  const [topics, setTopics] = useState<Topic[]>([]);
  const loadTopics = useCallback(async () => {
    const database = await getDb();
    const rows: QuestionRow[] = await database.getAllAsync("SELECT id, cat, tags FROM questions");
    const grouped = new Map<string, Set<string>>();
    rows.forEach((row) => parseQuestionTags(row.tags, row.cat).forEach((tag) => {
      const name = topLevelTag(tag);
      const ids = grouped.get(name) ?? new Set<string>();
      ids.add(row.id);
      grouped.set(name, ids);
    }));
    setTopics(Array.from(grouped, ([name, ids]) => ({ name, count: ids.size })).sort((a, b) => a.name.localeCompare(b.name, "zh-CN")));
  }, []);
  useFocusEffect(useCallback(() => { loadTopics().catch(() => setTopics([])); }, [loadTopics]));

  return <View style={styles.page}>
    <View style={styles.titleRow}><BackButton onPress={() => router.back()} /><Text style={styles.title}>题库</Text></View>
    <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
      {topics.map((topic) => <TouchableOpacity key={topic.name} style={styles.row} onPress={() => router.push({ pathname: "/(tabs)/topic", params: { topic: topic.name } })}>
        <View style={styles.folderIcon}><BookOpen size={21} color={colors.primary} /></View><View style={styles.rowText}><Text numberOfLines={1} style={styles.name}>{topic.name}</Text><Text style={styles.count}>{topic.count} 张卡片</Text></View><ChevronRight size={21} color={colors.textSecondary} />
      </TouchableOpacity>)}
      {topics.length === 0 ? <Text style={styles.empty}>还没有可学习的卡片</Text> : null}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg }, titleRow: { height: 76, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", marginBottom: 8 }, title: { flex: 1, color: colors.text, fontFamily: "MiSans-Semibold", fontSize: 30, marginLeft: 3 }, list: { paddingHorizontal: 20, paddingBottom: 30 }, row: { minHeight: 68, backgroundColor: colors.surface, borderRadius: 15, padding: 11, flexDirection: "row", alignItems: "center", marginBottom: 7, shadowColor: "#1d1d1d", shadowOpacity: 0.025, shadowRadius: 8, elevation: 1 }, folderIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.iconBackground, alignItems: "center", justifyContent: "center", marginRight: 12 }, rowText: { flex: 1 }, name: { color: colors.text, fontFamily: "MiSans-Medium", fontSize: 16 }, count: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 12, marginTop: 3 }, empty: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 15, textAlign: "center", marginTop: 70 },
});
