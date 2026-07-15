import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Easing, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useCardStore, Card } from "../../src/store/useCardStore";
import { colors } from "../../src/tokens/colors";
import { getDb } from "../../src/data/db";
import { genId } from "../../src/data/utils";
import { isCardDue, reviewCard } from "../../src/data/sm2";
import { cardHasTag, parseQuestionTags } from "../../src/data/tagging";

type StudyScope = "all" | "mistakes" | "starred" | "due" | "review" | "new";
type SwipeAction = "unfamiliar" | "mastered" | "favorite";

const HORIZONTAL_SWIPE_THRESHOLD = 82;
const VERTICAL_SWIPE_THRESHOLD = 100;

function scopeCards(cards: Card[], scope: StudyScope, limit?: string) {
  if (scope === "mistakes") return cards.filter((card) => card.incorrect > 0);
  if (scope === "starred") return cards.filter((card) => card.isStarred);
  if (scope === "review") return cards.filter((card) => Boolean(card.lastReview) && isCardDue(card.nextReview));
  if (scope === "due") return cards.filter((card) => !card.lastReview || isCardDue(card.nextReview));
  if (scope === "new") return cards.filter((card) => !card.lastReview).slice(0, Number(limit) || undefined);
  return cards;
}

export default function StudyScreen() {
  const router = useRouter();
  const { documentId, documentTitle, scope: rawScope, limit, questionId, topic } = useLocalSearchParams<{ documentId?: string; documentTitle?: string; scope?: StudyScope; limit?: string; questionId?: string; topic?: string }>();
  const scope: StudyScope = rawScope || "all";
  const { cards, currentIndex, setCards, setCurrentIndex, updateCard, rateAndAdvance } = useCardStore();
  const [loading, setLoading] = useState(true);
  const [showAnswer, setShowAnswer] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [guideVisible, setGuideVisible] = useState(false);
  const [answerOffset, setAnswerOffset] = useState(0);
  const guideStarted = useRef(false);
  const actionLocked = useRef(false);
  const gestureAxis = useRef<"horizontal" | "up" | null>(null);
  const translation = useRef(new Animated.ValueXY()).current;

  const loadCards = useCallback(async () => {
    setLoading(true);
    const database = await getDb();
    const query = documentId
      ? `SELECT q.id, q.cat, q.tags, q.q, q.a, COALESCE(cp.level, 0) AS level, COALESCE(cp.correct, 0) AS correct, COALESCE(cp.incorrect, 0) AS incorrect, cp.last_review AS lastReview, cp.next_review AS nextReview, COALESCE(cp.is_starred, 0) AS isStarred FROM questions q LEFT JOIN card_progress cp ON q.id = cp.question_id WHERE q.source_document_id = ?`
      : `SELECT q.id, q.cat, q.tags, q.q, q.a, COALESCE(cp.level, 0) AS level, COALESCE(cp.correct, 0) AS correct, COALESCE(cp.incorrect, 0) AS incorrect, cp.last_review AS lastReview, cp.next_review AS nextReview, COALESCE(cp.is_starred, 0) AS isStarred FROM questions q LEFT JOIN card_progress cp ON q.id = cp.question_id`;
    const rows: any[] = await database.getAllAsync(query, documentId ? [documentId] : undefined);
    const mapped = rows.map((row) => ({ id: row.id, cat: row.cat, q: row.q, a: row.a, level: row.level, correct: row.correct, incorrect: row.incorrect, lastReview: row.lastReview ?? undefined, nextReview: row.nextReview ?? undefined, isStarred: Boolean(row.isStarred), tagPaths: parseQuestionTags(row.tags, row.cat) }));
    const topicCards = Array.from(new Map((topic ? mapped.filter((card) => cardHasTag(card.tagPaths, topic)) : mapped).map((card) => [card.id, card])).values());
    const scoped = scopeCards(topicCards, scope, limit);
    setCards(questionId ? scoped.filter((card) => card.id === questionId) : scoped);
    setCurrentIndex(0);
    setShowAnswer(false);
    setSessionComplete(false);
    translation.setValue({ x: 0, y: 0 });
    setLoading(false);
  }, [documentId, limit, questionId, scope, setCards, setCurrentIndex, topic, translation]);

  useFocusEffect(useCallback(() => { loadCards().catch(() => setLoading(false)); }, [loadCards]));

  const currentCard = cards.length ? cards[Math.min(currentIndex, cards.length - 1)] : null;
  const progress = cards.length ? `${Math.min(currentIndex + 1, cards.length)} / ${cards.length}` : "0 / 0";
  const rotate = translation.x.interpolate({ inputRange: [-180, 0, 180], outputRange: ["-7deg", "0deg", "7deg"], extrapolate: "clamp" });
  const leftOpacity = translation.x.interpolate({ inputRange: [-150, -8, 0], outputRange: [1, 0.25, 0], extrapolate: "clamp" });
  const rightOpacity = translation.x.interpolate({ inputRange: [0, 8, 150], outputRange: [0, 0.25, 1], extrapolate: "clamp" });
  const topOpacity = translation.y.interpolate({ inputRange: [-150, -8, 0], outputRange: [1, 0.28, 0], extrapolate: "clamp" });

  const persistGuideSeen = useCallback(async () => {
    const database = await getDb();
    await database.runAsync("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", ["study_gesture_guide_seen", "1"]);
  }, []);

  const playGuide = useCallback(() => {
    if (guideStarted.current) return;
    guideStarted.current = true;
    setGuideVisible(true);
    Animated.sequence([
      Animated.timing(translation.x, { toValue: -18, duration: 160, useNativeDriver: true }),
      Animated.spring(translation.x, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 4 }),
      Animated.timing(translation.x, { toValue: 18, duration: 160, useNativeDriver: true }),
      Animated.spring(translation.x, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 4 }),
      Animated.timing(translation.y, { toValue: -18, duration: 160, useNativeDriver: true }),
      Animated.spring(translation.y, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 4 }),
    ]).start(() => { setGuideVisible(false); persistGuideSeen().catch(() => {}); });
  }, [persistGuideSeen, translation]);

  const revealAnswer = useCallback(async () => {
    setShowAnswer(true);
    try {
      const database = await getDb();
      const seen = await database.getFirstAsync("SELECT value FROM app_settings WHERE key = ?", ["study_gesture_guide_seen"]);
      if (seen?.value !== "1") playGuide();
    } catch {}
  }, [playGuide]);

  const animateNextCard = useCallback((action: SwipeAction) => {
    const entry = action === "mastered" ? { x: 44, y: 8 } : action === "unfamiliar" ? { x: -44, y: 8 } : { x: 0, y: 34 };
    setShowAnswer(false);
    setAnswerOffset(0);
    requestAnimationFrame(() => {
      translation.setValue(entry);
      Animated.timing(translation, { toValue: { x: 0, y: 0 }, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
        translation.setValue({ x: 0, y: 0 });
        actionLocked.current = false;
      });
    });
  }, [translation]);

  const advanceAfter = useCallback((action: SwipeAction) => {
    if (!currentCard || actionLocked.current) return;
    actionLocked.current = true;
    const isLast = currentIndex >= cards.length - 1;
    const destination = action === "mastered" ? { x: -520, y: 20 } : action === "unfamiliar" ? { x: 520, y: 20 } : { x: 0, y: -520 };
    Animated.timing(translation, { toValue: destination, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      (async () => {
        const database = await getDb();
        if (action === "favorite") {
          const isStarred = !currentCard.isStarred;
          await database.runAsync(`INSERT INTO card_progress (id, user_id, question_id, level, correct, incorrect, last_review, next_review, is_starred) VALUES (?, 'local', ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, question_id) DO UPDATE SET is_starred = excluded.is_starred`, [genId(), currentCard.id, currentCard.level, currentCard.correct, currentCard.incorrect, currentCard.lastReview ?? null, currentCard.nextReview ?? null, isStarred ? 1 : 0]);
          updateCard(currentCard.id, { isStarred });
          if (isLast) setSessionComplete(true); else setCurrentIndex(currentIndex + 1);
        } else {
          const quality = action === "mastered" ? 1 : 0;
          const updated = reviewCard({ level: currentCard.level, correct: currentCard.correct, incorrect: currentCard.incorrect, isStarred: currentCard.isStarred }, quality);
          await database.runAsync(`INSERT INTO card_progress (id, user_id, question_id, level, correct, incorrect, last_review, next_review, is_starred) VALUES (?, 'local', ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, question_id) DO UPDATE SET level = excluded.level, correct = excluded.correct, incorrect = excluded.incorrect, last_review = excluded.last_review, next_review = excluded.next_review, is_starred = excluded.is_starred`, [genId(), currentCard.id, updated.level, updated.correct, updated.incorrect, updated.lastReview, updated.nextReview, currentCard.isStarred ? 1 : 0]);
          const today = new Date().toISOString().slice(0, 10);
          await database.runAsync(`INSERT INTO study_records (id, user_id, date, count, correct, incorrect, new_count) VALUES (?, 'local', ?, 1, ?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET count = study_records.count + 1, correct = study_records.correct + excluded.correct, incorrect = study_records.incorrect + excluded.incorrect, new_count = study_records.new_count + excluded.new_count`, [genId(), today, quality, quality ? 0 : 1, currentCard.lastReview ? 0 : 1]);
          if (isLast) setSessionComplete(true); else rateAndAdvance(currentCard.id, quality, cards.length);
        }
      })().catch(() => Alert.alert("保存失败", "本次学习记录未能保存，请重试。")).finally(() => {
        if (isLast) {
          translation.setValue({ x: 0, y: 0 });
          setShowAnswer(false);
          setAnswerOffset(0);
          actionLocked.current = false;
          return;
        }
        animateNextCard(action);
      });
    });
  }, [animateNextCard, cards.length, currentCard, currentIndex, rateAndAdvance, setCurrentIndex, translation, updateCard]);

  const resetCardPosition = useCallback(() => {
    translation.stopAnimation();
    Animated.spring(translation, { toValue: { x: 0, y: 0 }, useNativeDriver: true, speed: 20, bounciness: 5 }).start(() => {
      translation.setValue({ x: 0, y: 0 });
    });
  }, [translation]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => showAnswer && !guideVisible && !actionLocked.current && (Math.abs(gesture.dx) > 9 || (gesture.dy < -18 && answerOffset <= 0)),
    onPanResponderGrant: () => { gestureAxis.current = null; translation.stopAnimation(); },
    onPanResponderMove: (_event, gesture) => {
      if (!gestureAxis.current && (Math.abs(gesture.dx) > 12 || Math.abs(gesture.dy) > 12)) {
        gestureAxis.current = Math.abs(gesture.dx) >= Math.abs(gesture.dy) ? "horizontal" : gesture.dy < 0 ? "up" : null;
      }
      if (gestureAxis.current === "horizontal") translation.setValue({ x: gesture.dx, y: 0 });
      else if (gestureAxis.current === "up") translation.setValue({ x: 0, y: Math.min(0, gesture.dy) });
    },
    onPanResponderRelease: (_event, gesture) => {
      gestureAxis.current = null;
      if (gesture.dy <= -VERTICAL_SWIPE_THRESHOLD && Math.abs(gesture.dy) > Math.abs(gesture.dx)) advanceAfter("favorite");
      else if (gesture.dx >= HORIZONTAL_SWIPE_THRESHOLD && Math.abs(gesture.dx) > Math.abs(gesture.dy)) advanceAfter("unfamiliar");
      else if (gesture.dx <= -HORIZONTAL_SWIPE_THRESHOLD && Math.abs(gesture.dx) > Math.abs(gesture.dy)) advanceAfter("mastered");
      else resetCardPosition();
    },
    onPanResponderTerminate: () => { gestureAxis.current = null; resetCardPosition(); },
  }), [advanceAfter, answerOffset, guideVisible, resetCardPosition, showAnswer, translation]);

  if (loading) return <View style={styles.page}><Text style={styles.loading}>正在准备卡片…</Text></View>;
  if (sessionComplete) return <View style={[styles.page, styles.completePage]}><Text style={styles.completeMark}>✓</Text><Text style={styles.completeTitle}>本轮学习完成</Text><Text style={styles.completeHint}>已完成全部复习</Text><TouchableOpacity onPress={() => router.replace("/(tabs)")}><Text style={styles.homeLink}>返回首页</Text></TouchableOpacity></View>;
  if (!currentCard) return <View style={[styles.page, styles.completePage]}><Text style={styles.completeTitle}>暂无可学习卡片</Text><Text style={styles.completeHint}>换个专题或学习范围再试试</Text><TouchableOpacity onPress={() => router.back()}><Text style={styles.homeLink}>返回</Text></TouchableOpacity></View>;

  return <View style={styles.page}>
    <View style={styles.topBar}><TouchableOpacity style={styles.topAction} accessibilityLabel="返回" onPress={() => router.back()}><Text style={styles.exit}>{"<"}</Text></TouchableOpacity><View style={styles.progressBlock}><Text style={styles.progressText}>{progress}</Text><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${(Math.min(currentIndex + 1, cards.length) / cards.length) * 100}%` }]} /></View></View><TouchableOpacity style={styles.topAction} accessibilityLabel="更多学习设置" onPress={() => Alert.alert("学习设置", "更多学习设置将在下一阶段开放")}><View style={styles.moreDots}><View style={styles.moreDot} /><View style={styles.moreDot} /><View style={styles.moreDot} /></View></TouchableOpacity></View>
    {documentTitle ? <Text numberOfLines={1} style={styles.documentTitle}>{documentTitle}</Text> : null}
    <View style={styles.cardStage}>
      {showAnswer ? <><Animated.View pointerEvents="none" style={[styles.edgeTint, styles.leftTint, { opacity: leftOpacity }]}><LinearGradient style={styles.gradientFill} colors={["rgba(36, 184, 111, 0.46)", "rgba(36, 184, 111, 0.16)", "rgba(36, 184, 111, 0)"]} locations={[0, 0.45, 1]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} /></Animated.View><Animated.View pointerEvents="none" style={[styles.edgeTint, styles.rightTint, { opacity: rightOpacity }]}><LinearGradient style={styles.gradientFill} colors={["rgba(239, 77, 77, 0.46)", "rgba(239, 77, 77, 0.16)", "rgba(239, 77, 77, 0)"]} locations={[0, 0.45, 1]} start={{ x: 1, y: 0.5 }} end={{ x: 0, y: 0.5 }} /></Animated.View><Animated.View pointerEvents="none" style={[styles.topTint, { opacity: topOpacity }]}><LinearGradient style={styles.gradientFill} colors={["rgba(242, 162, 58, 0.44)", "rgba(242, 162, 58, 0.14)", "rgba(242, 162, 58, 0)"]} locations={[0, 0.45, 1]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} /></Animated.View></> : null}
      <Animated.View {...(showAnswer ? panResponder.panHandlers : {})} style={[styles.card, { transform: [{ translateX: translation.x }, { translateY: translation.y }, { rotate }] }]}>
        {showAnswer ? <ScrollView showsVerticalScrollIndicator={false} onScroll={(event) => setAnswerOffset(event.nativeEvent.contentOffset.y)} scrollEventThrottle={16} contentContainerStyle={styles.answerContent}>
          <Text style={styles.category}>{currentCard.cat.split("/")[0]}</Text><Text style={styles.answer}>{currentCard.a}</Text><Text style={styles.gestureHint}>左滑 熟悉 · 右滑 不熟悉 · 上滑 收藏</Text>
        </ScrollView> : <TouchableOpacity activeOpacity={1} accessibilityLabel="查看答案" style={styles.frontContent} onPress={revealAnswer}><Text style={styles.category}>{currentCard.cat.split("/")[0]}</Text><Text style={styles.question}>{currentCard.q}</Text></TouchableOpacity>}
      </Animated.View>
      {showAnswer ? <><Animated.View pointerEvents="none" style={[styles.feedback, styles.leftFeedback, { opacity: leftOpacity }]}><Text style={styles.goodMark}>✓</Text><Text style={styles.goodText}>熟悉</Text></Animated.View><Animated.View pointerEvents="none" style={[styles.feedback, styles.rightFeedback, { opacity: rightOpacity }]}><Text style={styles.badMark}>×</Text><Text style={styles.badText}>不熟悉</Text></Animated.View><Animated.View pointerEvents="none" style={[styles.feedback, styles.topFeedback, { opacity: topOpacity }]}><Text style={styles.starMark}>★</Text><Text style={styles.starText}>收藏</Text></Animated.View></> : null}
    </View>
    {guideVisible ? <View pointerEvents="none" style={styles.guide}><Text style={styles.guideLeft}>← 熟悉</Text><Text style={styles.guideUp}>↑ 收藏</Text><Text style={styles.guideRight}>不熟悉 →</Text></View> : null}
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 22 }, loading: { color: colors.textSecondary, textAlign: "center", marginTop: "60%", fontSize: 15 }, topBar: { height: 76, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, topAction: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" }, exit: { color: colors.text, fontSize: 29, fontWeight: "300", lineHeight: 32, marginTop: -2 }, moreDots: { width: 24, height: 24, justifyContent: "center", alignItems: "center", gap: 3 }, moreDot: { width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: colors.text }, progressBlock: { width: 78, alignItems: "center", paddingTop: 2 }, progressText: { color: colors.text, fontSize: 14, fontWeight: "600", letterSpacing: 0.2, fontVariant: ["tabular-nums"], marginBottom: 8 }, progressTrack: { width: "100%", height: 2, borderRadius: 1, backgroundColor: colors.border, overflow: "hidden" }, progressFill: { height: "100%", backgroundColor: colors.primary }, documentTitle: { color: colors.textSecondary, textAlign: "center", fontSize: 12, marginTop: -4 }, cardStage: { flex: 1, justifyContent: "center", alignItems: "center", position: "relative", paddingVertical: 22 }, edgeTint: { position: "absolute", top: 28, bottom: 28, width: 132, overflow: "hidden" }, leftTint: { left: -22, backgroundColor: "rgba(47, 179, 113, 0.035)" }, leftTintMid: { width: 86, height: "100%", backgroundColor: "rgba(47, 179, 113, 0.055)" }, leftTintCore: { width: 42, height: "100%", backgroundColor: "rgba(47, 179, 113, 0.08)" }, rightTint: { right: -22, alignItems: "flex-end", backgroundColor: "rgba(239, 91, 91, 0.035)" }, rightTintMid: { width: 86, height: "100%", alignItems: "flex-end", backgroundColor: "rgba(239, 91, 91, 0.055)" }, rightTintCore: { width: 42, height: "100%", backgroundColor: "rgba(239, 91, 91, 0.08)" }, card: { width: "100%", maxWidth: 390, flex: 1, maxHeight: 600, minHeight: 380, borderRadius: 24, backgroundColor: colors.surface, shadowColor: "#171717", shadowOpacity: 0.06, shadowRadius: 20, elevation: 2, overflow: "hidden" }, frontContent: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 }, category: { color: colors.primaryDark, backgroundColor: colors.primaryLight, fontSize: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, overflow: "hidden", alignSelf: "center", marginBottom: 34 }, question: { color: colors.text, fontSize: 25, lineHeight: 37, fontWeight: "600", textAlign: "center" }, answerContent: { padding: 28, paddingBottom: 38 }, answer: { color: colors.text, fontSize: 17, lineHeight: 29 }, gestureHint: { color: colors.textTertiary, fontSize: 11, textAlign: "center", marginTop: 30 }, feedback: { position: "absolute", alignItems: "center" }, leftFeedback: { left: -4, top: "52%" }, rightFeedback: { right: -4, top: "52%" }, topFeedback: { top: 8, alignSelf: "center" }, badMark: { color: colors.danger, fontSize: 43, fontWeight: "300" }, badText: { color: colors.danger, fontSize: 13, fontWeight: "600" }, goodMark: { color: colors.success, fontSize: 40 }, goodText: { color: colors.success, fontSize: 13, fontWeight: "600" }, starMark: { color: colors.primary, fontSize: 28 }, starText: { color: colors.primaryDark, fontSize: 12, fontWeight: "600" }, guide: { position: "absolute", left: 34, right: 34, bottom: 24, height: 44, justifyContent: "center", alignItems: "center" }, guideLeft: { position: "absolute", left: 0, color: colors.textSecondary, fontSize: 12 }, guideRight: { position: "absolute", right: 0, color: colors.textSecondary, fontSize: 12 }, guideUp: { color: colors.textSecondary, fontSize: 12 }, completePage: { justifyContent: "center", alignItems: "center" }, completeMark: { color: colors.success, fontSize: 60, marginBottom: 20 }, completeTitle: { color: colors.text, fontSize: 27, fontWeight: "700" }, completeHint: { color: colors.textSecondary, fontSize: 15, marginTop: 10 }, homeLink: { color: colors.primaryDark, fontSize: 16, fontWeight: "600", marginTop: 34 },
  gradientFill: { ...StyleSheet.absoluteFillObject },
  topTint: { position: "absolute", top: 18, left: 0, right: 0, height: 156, overflow: "hidden" },
});
