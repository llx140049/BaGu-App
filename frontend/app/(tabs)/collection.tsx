import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { getDb, insertSampleData } from "../../src/data/db";
import { useThemeStore } from "../../src/store/useThemeStore";
import { colors } from "../../src/tokens/colors";

type Collection = "starred" | "mistakes";

interface CollectionQuestion {
  id: string;
  cat: string;
  q: string;
  incorrect: number;
  isStarred: number;
}

export default function CollectionScreen() {
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type?: Collection }>();
  const collection: Collection = type === "mistakes" ? "mistakes" : "starred";
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === "dark";
  const c = isDark ? colors.textDark : colors.text;
  const bg = isDark ? colors.bgDark : colors.bg;
  const surface = isDark ? colors.surfaceDark : colors.surface;
  const [questions, setQuestions] = useState<CollectionQuestion[]>([]);

  const loadQuestions = useCallback(async () => {
    await insertSampleData();
    const database = await getDb();
    const rows: CollectionQuestion[] = await database.getAllAsync(
      `SELECT q.id, q.cat, q.q,
              COALESCE(cp.incorrect, 0) AS incorrect,
              COALESCE(cp.is_starred, 0) AS isStarred
       FROM questions q
       LEFT JOIN card_progress cp ON q.id = cp.question_id`
    );
    setQuestions(
      rows.filter((question) =>
        collection === "starred" ? Boolean(question.isStarred) : question.incorrect > 0
      )
    );
  }, [collection]);

  useFocusEffect(useCallback(() => { loadQuestions(); }, [loadQuestions]));

  const title = collection === "starred" ? "收藏夹" : "错题本";
  const emptyText = collection === "starred" ? "还没有收藏题目" : "还没有错题";

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.back, { color: colors.primary }]}>返回</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c }]}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.summary, { color: colors.textSecondary }]}>{questions.length} 道题目</Text>
        {questions.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: surface }]}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{emptyText}</Text>
          </View>
        ) : questions.map((question) => (
          <TouchableOpacity
            key={question.id}
            style={[styles.questionCard, { backgroundColor: surface }]}
            onPress={() => router.push({ pathname: "/(tabs)/study", params: { scope: collection, questionId: question.id } })}
          >
            <Text style={[styles.category, { color: colors.primary }]}>{question.cat}</Text>
            <Text style={[styles.question, { color: c }]} numberOfLines={3}>{question.q}</Text>
            <Text style={[styles.action, { color: colors.primary }]}>开始练习 →</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { fontSize: 15, fontWeight: "600" },
  title: { fontSize: 20, fontWeight: "700" },
  headerSpacer: { width: 30 },
  content: { padding: 16, paddingTop: 4 },
  summary: { fontSize: 13, marginBottom: 12 },
  questionCard: { borderRadius: 12, padding: 16, marginBottom: 10 },
  category: { fontSize: 12, fontWeight: "600", marginBottom: 8 },
  question: { fontSize: 16, fontWeight: "500", lineHeight: 23 },
  action: { fontSize: 13, fontWeight: "600", marginTop: 12 },
  emptyCard: { borderRadius: 12, padding: 32, alignItems: "center", marginTop: 16 },
  emptyText: { fontSize: 15 },
});
