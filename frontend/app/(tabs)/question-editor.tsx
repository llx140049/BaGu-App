import { useCallback, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import QuestionEditor, { EditableQuestion } from "../../src/components/QuestionEditor";
import { getDb } from "../../src/data/db";
import { parseQuestionTags } from "../../src/data/tagging";
import { colors } from "../../src/tokens/colors";
import { genId } from "../../src/data/utils";
import { useThemeStore } from "../../src/store/useThemeStore";

interface QuestionRow { id: string; cat: string; q: string; a: string; tags?: string | null; }
interface ProgressRow { id: string; is_starred?: number | boolean; }

export default function QuestionEditorScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [question, setQuestion] = useState<EditableQuestion | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [isFavorite, setIsFavorite] = useState(false);

  const loadQuestion = useCallback(async () => {
    if (!id) return;
    const database = await getDb();
    const [row] = await database.getAllAsync("SELECT * FROM questions WHERE id = ?", [id]) as QuestionRow[];
    if (!row) { setQuestion(null); return; }
    const tags = parseQuestionTags(row.tags, row.cat);
    setQuestion({ id: row.id, cat: tags[0] ?? row.cat, q: row.q, a: row.a, tags });
    const [progress] = await database.getAllAsync("SELECT * FROM card_progress WHERE question_id = ?", [id]) as ProgressRow[];
    setIsFavorite(Boolean(progress?.is_starred));
    const allRows: Pick<QuestionRow, "cat" | "tags">[] = await database.getAllAsync("SELECT cat, tags FROM questions");
    setCategories(Array.from(new Set(allRows.flatMap((item) => parseQuestionTags(item.tags, item.cat)))));
  }, [id]);
  useFocusEffect(useCallback(() => { loadQuestion().catch(() => setQuestion(null)); }, [loadQuestion]));

  const saveQuestion = async (next: EditableQuestion) => {
    if (!next.id) return;
    const database = await getDb();
    const tags = parseQuestionTags(next.tags, next.cat);
    await database.runAsync("UPDATE questions SET cat = ?, tags = ?, q = ?, a = ? WHERE id = ?", [tags[0], JSON.stringify(tags), next.q, next.a, next.id]);
    router.back();
  };
  const deleteQuestion = async () => {
    if (!id) return;
    const database = await getDb();
    await database.runAsync("DELETE FROM card_progress WHERE question_id = ?", [id]);
    await database.runAsync("DELETE FROM questions WHERE id = ?", [id]);
    router.back();
  };
  const duplicateQuestion = async () => {
    if (!question) return;
    const database = await getDb();
    const tags = parseQuestionTags(question.tags, question.cat);
    const copyId = genId();
    await database.runAsync(
      "INSERT INTO questions (id, user_id, cat, q, a, tags) VALUES (?, 'local', ?, ?, ?, ?)",
      [copyId, tags[0], question.q, question.a, JSON.stringify(tags)],
    );
    router.replace({ pathname: "/(tabs)/question-editor", params: { id: copyId } });
  };
  const toggleFavorite = async () => {
    if (!id) return;
    const database = await getDb();
    const rows: ProgressRow[] = await database.getAllAsync("SELECT * FROM card_progress WHERE question_id = ?", [id]);
    const next = !isFavorite;
    if (rows[0]) await database.runAsync("UPDATE card_progress SET is_starred = ? WHERE question_id = ?", [next ? 1 : 0, id]);
    else await database.runAsync(
      "INSERT INTO card_progress (id, user_id, question_id, level, correct, incorrect, last_review, next_review, is_starred) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [genId(), "local", id, 0, 0, 0, null, null, next ? 1 : 0],
    );
    setIsFavorite(next);
  };

  const isDark = useThemeStore((state) => state.theme === "dark");
  if (!question) return <View style={{ flex: 1, backgroundColor: isDark ? colors.bgDark : colors.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.textSecondary, marginTop: 10 }}>正在加载题目</Text></View>;
  return <QuestionEditor question={question} categories={categories} onClose={() => router.back()} onSave={saveQuestion} onDelete={deleteQuestion} onDuplicate={duplicateQuestion} isFavorite={isFavorite} onToggleFavorite={toggleFavorite} />;
}
