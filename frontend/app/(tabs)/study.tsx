import { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useCardStore, Card } from "../../src/store/useCardStore";
import { useThemeStore } from "../../src/store/useThemeStore";
import { colors } from "../../src/tokens/colors";
import { getDb, insertSampleData } from "../../src/data/db";
import { genId } from "../../src/data/utils";
import { reviewCard } from "../../src/data/sm2";

type Mode = "flashcard" | "systematic";
type StudyScope = "all" | "mistakes" | "starred";

function isAnswerProbablySwapped(q: string, a: string): boolean {
  if (!q || !a) return false;
  if (a.trim().endsWith("？")) return true;
  if (q.length > a.length * 1.5 && q.length > 15) return true;
  const questionWords = ["什么", "如何", "为什么", "怎么", "哪些", "是否", "怎样", "简述", "解释", "描述"];
  const aHasQ = questionWords.some(w => a.includes(w));
  const qHasQ = questionWords.some(w => q.includes(w));
  if (aHasQ && !qHasQ) return true;
  return false;
}

function FlashCardView({ card, onRate, onToggleStar }: { card: Card; onRate: (quality: number) => void; onToggleStar: () => void }) {
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === "dark";
  const c = isDark ? colors.textDark : colors.text;
  const surface = isDark ? colors.surfaceDark : colors.surface;
  const [flipped, setFlipped] = useState(false);

  return (
    <View>
      <TouchableOpacity style={[styles.card, { backgroundColor: surface }]} activeOpacity={0.95} onPress={() => setFlipped(!flipped)}>
        <Text style={[styles.catBadge, { color: colors.primary }]}>{card.cat}</Text>
        <Text style={[styles.cardText, { color: c }]}>{flipped ? card.a : card.q}</Text>
        {!flipped && <Text style={[styles.hint, { color: colors.textTertiary }]}>点击翻转</Text>}
        <TouchableOpacity style={styles.starButton} onPress={onToggleStar}>
          <Text style={[styles.starButtonText, { color: card.isStarred ? colors.primary : colors.textSecondary }]}>
            {card.isStarred ? "★ 已收藏" : "☆ 收藏"}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
      {flipped && (
        <View style={styles.qualityRow}>
          <Pressable
            style={({ pressed }) => [{ backgroundColor: colors.danger, opacity: pressed ? 0.7 : 1 }, styles.pBtn]}
            onPress={() => onRate(0)}
          >
            <Text style={styles.pBtnText}>👎  忘了</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [{ backgroundColor: colors.success, opacity: pressed ? 0.7 : 1 }, styles.pBtn]}
            onPress={() => onRate(1)}
          >
            <Text style={styles.pBtnText}>👍  记得</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export default function StudyScreen() {
  const router = useRouter();
  const { documentId, documentTitle } = useLocalSearchParams<{ documentId?: string; documentTitle?: string }>();
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === "dark";
  const { cards, currentIndex, setCards, setCurrentIndex, updateCard, rateAndAdvance } = useCardStore();
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null);
  const [studyScope, setStudyScope] = useState<StudyScope | null>(null);
  const [loading, setLoading] = useState(true);
  const ratingLock = useRef(false);
  const isDocumentStudy = Boolean(documentId);

  const loadCards = useCallback(async () => {
    setLoading(true);
    await insertSampleData();
    const database = await getDb();
    const query = documentId
      ? `SELECT q.id, q.cat, q.q, q.a, COALESCE(cp.level, 0) as level,
              COALESCE(cp.correct, 0) as correct, COALESCE(cp.incorrect, 0) as incorrect,
              cp.last_review as lastReview, cp.next_review as nextReview,
              COALESCE(cp.is_starred, 0) as isStarred
       FROM questions q
       LEFT JOIN card_progress cp ON q.id = cp.question_id
       WHERE q.source_document_id = ?`
      : `SELECT q.id, q.cat, q.q, q.a, COALESCE(cp.level, 0) as level,
              COALESCE(cp.correct, 0) as correct, COALESCE(cp.incorrect, 0) as incorrect,
              cp.last_review as lastReview, cp.next_review as nextReview,
              COALESCE(cp.is_starred, 0) as isStarred
       FROM questions q
       LEFT JOIN card_progress cp ON q.id = cp.question_id`;
    const rows: any[] = await database.getAllAsync(
      query,
      documentId ? [documentId] : undefined
    );
    const mapped = rows.map((r: any) => ({
      id: r.id, cat: r.cat, q: r.q, a: r.a,
      level: r.level, correct: r.correct, incorrect: r.incorrect,
      lastReview: r.lastReview ?? undefined,
      nextReview: r.nextReview ?? undefined,
      isStarred: !!r.isStarred,
    }));
    for (const card of mapped) {
      if (card.a && card.q && isAnswerProbablySwapped(card.q, card.a)) {
        const tmp = card.q; card.q = card.a; card.a = tmp;
        try { await database.runAsync("UPDATE questions SET q = ?, a = ? WHERE id = ?", [card.q, card.a, card.id]); } catch {}
      }
    }
    const filtered = studyScope === "mistakes"
      ? mapped.filter((card) => card.incorrect > 0)
      : studyScope === "starred"
        ? mapped.filter((card) => card.isStarred)
        : mapped;
    setCards(filtered);
    setCurrentIndex(0);
    setLoading(false);
  }, [documentId, setCards, setCurrentIndex, studyScope]);

  useFocusEffect(useCallback(() => { loadCards(); }, [loadCards]));

  useEffect(() => {
    if (documentId) {
      setSelectedMode("flashcard");
      setStudyScope("all");
      setCurrentIndex(0);
    }
  }, [documentId, setCurrentIndex]);

  const currentCard = cards.length > 0 ? cards[Math.min(currentIndex, cards.length - 1)] : null;
  const bg = isDark ? colors.bgDark : colors.bg;

  const handleRate = useCallback((quality: number) => {
    if (ratingLock.current) return;
    ratingLock.current = true;
    (async () => {
      const store = useCardStore.getState();
      if (store.cards.length === 0) return;
      const idx = Math.min(store.currentIndex, store.cards.length - 1);
      const c = store.cards[idx];
      if (!c) return;

      const updated = reviewCard(
        {
          level: c.level,
          correct: c.correct,
          incorrect: c.incorrect,
          isStarred: c.isStarred,
        },
        quality
      );

      const db = await getDb();
      await db.runAsync(
        `INSERT INTO card_progress (id, user_id, question_id, level, correct, incorrect, last_review, next_review, is_starred)
         VALUES (?, 'local', ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, question_id) DO UPDATE SET
           level = excluded.level,
           correct = excluded.correct,
           incorrect = excluded.incorrect,
           last_review = excluded.last_review,
           next_review = excluded.next_review,
           is_starred = excluded.is_starred`,
        [
          genId(),
          c.id,
          updated.level,
          updated.correct,
          updated.incorrect,
          updated.lastReview,
          updated.nextReview,
          c.isStarred ? 1 : 0,
        ]
      );

      const today = new Date().toISOString().slice(0, 10);
      await db.runAsync(
        `INSERT INTO study_records (id, user_id, date, count, correct, incorrect)
         VALUES (?, 'local', ?, 1, ?, ?)
         ON CONFLICT(user_id, date) DO UPDATE SET
           count = study_records.count + 1,
           correct = study_records.correct + excluded.correct,
           incorrect = study_records.incorrect + excluded.incorrect`,
        [genId(), today, quality === 1 ? 1 : 0, quality === 0 ? 1 : 0]
      );

      store.rateAndAdvance(c.id, quality, store.cards.length);
    })()
      .catch(() => {})
      .finally(() => {
        setTimeout(() => {
          ratingLock.current = false;
        }, 100);
      });
  }, []);

  const toggleStar = useCallback(async () => {
    const store = useCardStore.getState();
    const card = store.cards[Math.min(store.currentIndex, store.cards.length - 1)];
    if (!card) return;
    const isStarred = !card.isStarred;
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO card_progress (id, user_id, question_id, level, correct, incorrect, last_review, next_review, is_starred)
       VALUES (?, 'local', ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, question_id) DO UPDATE SET is_starred = excluded.is_starred`,
      [genId(), card.id, card.level, card.correct, card.incorrect, card.lastReview ?? null, card.nextReview ?? null, isStarred ? 1 : 0]
    );
    updateCard(card.id, { isStarred });
  }, [updateCard]);

  if (!selectedMode) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>选择学习模式</Text>
        <TouchableOpacity style={[styles.modeBtn, { backgroundColor: colors.primary }]} onPress={() => { setSelectedMode("flashcard"); setStudyScope(null); setCurrentIndex(0); }}>
          <Text style={styles.modeBtnText}>📇  翻卡模式</Text>
          <Text style={styles.modeDesc}>问题 ↔ 答案翻转，👍记得/👎忘了</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeBtn, { backgroundColor: isDark ? colors.surfaceDark : colors.surface }]} onPress={() => router.push("/(tabs)/questions?tab=knowledge")}>
          <Text style={[styles.modeBtnText2, { color: isDark ? colors.textDark : colors.text }]}>📖  系统学习</Text>
          <Text style={[styles.modeDesc2, { color: colors.textTertiary }]}>翻阅完整知识文档，精读原文</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (selectedMode === "systematic") return null;

  if (selectedMode === "flashcard" && !studyScope) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>选择练习范围</Text>
        <TouchableOpacity style={[styles.scopeButton, { backgroundColor: colors.primary }]} onPress={() => setStudyScope("all")}>
          <Text style={styles.modeBtnText}>全部题目</Text><Text style={styles.modeDesc}>练习当前题库中的全部题目</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.scopeButton, { backgroundColor: colors.danger }]} onPress={() => setStudyScope("mistakes")}>
          <Text style={styles.modeBtnText}>只练错题</Text><Text style={styles.modeDesc}>集中复习曾选择“忘了”的题目</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.scopeButton, { backgroundColor: isDark ? colors.surfaceDark : colors.surface }]} onPress={() => setStudyScope("starred")}>
          <Text style={[styles.modeBtnText2, { color: isDark ? colors.textDark : colors.text }]}>只练收藏</Text><Text style={[styles.modeDesc2, { color: colors.textTertiary }]}>练习你手动收藏的重点题目</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backToModeButton} onPress={() => setSelectedMode(null)}><Text style={[styles.backToModeText, { color: colors.primary }]}>返回学习模式</Text></TouchableOpacity>
      </View>
    );
  }

  if (loading) return <View style={[styles.container, { backgroundColor: bg, justifyContent: "center" }]}><Text style={[styles.progress, { color: colors.textSecondary }]}>正在加载题目...</Text></View>;

  if (!currentCard) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>
          {studyScope === "mistakes" ? "暂无错题" : studyScope === "starred" ? "暂无收藏题目" : isDocumentStudy ? "该文档暂无关联题目" : "暂无题目"}
        </Text>
        <TouchableOpacity style={[styles.modeBtn, { backgroundColor: colors.primary }]} onPress={() => setStudyScope(null)}>
          <Text style={styles.modeBtnText}>返回</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {isDocumentStudy ? <Text style={[styles.documentTitle, { color: colors.textSecondary }]} numberOfLines={1}>{documentTitle}</Text> : null}
      <TouchableOpacity style={styles.changeScopeButton} onPress={() => setStudyScope(null)}><Text style={[styles.changeScopeText, { color: colors.primary }]}>切换练习范围</Text></TouchableOpacity>
      <Text style={[styles.progress, { color: colors.textSecondary }]}>{currentIndex + 1} / {cards.length}</Text>
      <FlashCardView key={currentIndex} card={currentCard} onRate={handleRate} onToggleStar={toggleStar} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "center", marginTop: 32, marginBottom: 24 },
  modeBtn: { padding: 18, borderRadius: 12, marginBottom: 12, alignItems: "center" },
  scopeButton: { padding: 18, borderRadius: 12, marginBottom: 12, alignItems: "center" },
  modeBtnText: { color: "#fff", fontSize: 17, fontWeight: "600" },
  modeBtnText2: { fontSize: 17, fontWeight: "600" },
  modeDesc: { color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 4 },
  modeDesc2: { fontSize: 12, marginTop: 4 },
  progress: { fontSize: 14, textAlign: "center", marginVertical: 8 },
  documentTitle: { fontSize: 13, textAlign: "center", marginTop: 8 },
  changeScopeButton: { alignSelf: "center", paddingVertical: 6 },
  changeScopeText: { fontSize: 13, fontWeight: "600" },
  backToModeButton: { alignItems: "center", paddingVertical: 14 },
  backToModeText: { fontSize: 14, fontWeight: "600" },
  card: { borderRadius: 16, padding: 28, minHeight: 260, justifyContent: "center", alignItems: "center", marginBottom: 20, position: "relative" },
  catBadge: { fontSize: 12, fontWeight: "600", marginBottom: 16, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, overflow: "hidden", backgroundColor: "#e8ece4" },
  cardText: { fontSize: 18, lineHeight: 26, textAlign: "center" },
  hint: { fontSize: 12, marginTop: 24 },
  starButton: { position: "absolute", right: 16, bottom: 14, paddingHorizontal: 8, paddingVertical: 6 },
  starButtonText: { fontSize: 14, fontWeight: "600" },
  qualityRow: { flexDirection: "row", gap: 12 },
  pBtn: { flex: 1, padding: 16, borderRadius: 12, alignItems: "center" },
  pBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
