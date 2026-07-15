import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
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
        <View style={styles.folderIcon}><Text style={styles.folderGlyph}>▰</Text></View><View style={styles.rowText}><Text numberOfLines={1} style={styles.name}>{topic.name}</Text><Text style={styles.count}>{topic.count} 张卡片</Text></View><Text style={styles.arrow}>›</Text>
      </TouchableOpacity>)}
      {topics.length === 0 ? <Text style={styles.empty}>还没有可学习的卡片</Text> : null}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg }, titleRow: { height: 76, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", marginBottom: 8 }, title: { flex: 1, color: colors.text, fontSize: 30, fontWeight: "700", marginLeft: 3 }, list: { paddingHorizontal: 20, paddingBottom: 30 }, row: { minHeight: 68, backgroundColor: colors.surface, borderRadius: 15, padding: 11, flexDirection: "row", alignItems: "center", marginBottom: 7, shadowColor: "#1d1d1d", shadowOpacity: 0.025, shadowRadius: 8, elevation: 1 }, folderIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center", marginRight: 12 }, folderGlyph: { color: colors.primary, fontSize: 22 }, rowText: { flex: 1 }, name: { color: colors.text, fontSize: 16, fontWeight: "600" }, count: { color: colors.textSecondary, fontSize: 12, marginTop: 3 }, arrow: { color: colors.textSecondary, fontSize: 29, fontWeight: "300" }, empty: { color: colors.textSecondary, fontSize: 15, textAlign: "center", marginTop: 70 },
});
