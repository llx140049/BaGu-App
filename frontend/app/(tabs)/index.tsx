import { useCallback, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { getDb } from "../../src/data/db";
import { MASTERED_LEVEL } from "../../src/data/sm2";
import { colors } from "../../src/tokens/colors";
import { MenuButton } from "../../src/components/PrototypeUI";

interface ProgressRow { level: number; lastReview?: string | null; nextReview?: string | null; }

export default function HomeScreen() {
  const router = useRouter();
  const [dueCount, setDueCount] = useState(0);

  const loadCount = useCallback(async () => {
    const database = await getDb();
    const rows: ProgressRow[] = await database.getAllAsync(`SELECT COALESCE(cp.level, 0) AS level, cp.last_review AS lastReview, cp.next_review AS nextReview FROM questions q LEFT JOIN card_progress cp ON q.id = cp.question_id`);
    const now = new Date();
    const due = rows.filter((card) => card.level < MASTERED_LEVEL && (!card.lastReview || !card.nextReview || new Date(card.nextReview) <= now));
    setDueCount(due.length);
  }, []);

  useFocusEffect(useCallback(() => { loadCount().catch(() => setDueCount(0)); }, [loadCount]));

  return <View style={styles.page}>
    <View style={styles.center}>
      <Text style={styles.count}>{dueCount}</Text>
      <Text style={styles.caption}>待学习</Text>
      <TouchableOpacity style={styles.startButton} onPress={() => router.push({ pathname: "/(tabs)/study", params: { scope: "due" } })}>
        <Text style={styles.startText}>开始学习</Text>
      </TouchableOpacity>
    </View>
    <View style={styles.menuAnchor}><MenuButton onPress={() => router.push("/(tabs)/hub")} /></View>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 62 },
  count: { color: colors.text, fontSize: 184, fontWeight: "700", lineHeight: 190, letterSpacing: -8, fontVariant: ["tabular-nums"] },
  caption: { color: colors.textSecondary, fontSize: 31, fontWeight: "400", marginTop: 24 },
  startButton: { width: "72%", maxWidth: 360, minHeight: 72, borderRadius: 18, marginTop: 92, backgroundColor: colors.primary, justifyContent: "center", alignItems: "center", shadowColor: colors.primaryDark, shadowOpacity: 0.14, shadowRadius: 14, elevation: 2 },
  startText: { color: "#fff", fontSize: 28, fontWeight: "500" },
  menuAnchor: { position: "absolute", left: 28, bottom: 34 },
});
