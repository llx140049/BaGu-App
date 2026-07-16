import { useCallback, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Play } from "lucide-react-native";
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
      <View style={styles.dueRow}><Text style={styles.count}>{dueCount}</Text><Text style={styles.caption}>待学习</Text></View>
      <TouchableOpacity style={styles.startButton} onPress={() => router.push({ pathname: "/(tabs)/study", params: { scope: "due" } })}>
        <Play size={25} color={colors.learning} fill={colors.learning} /><Text style={styles.startText}>开始学习</Text>
      </TouchableOpacity>
    </View>
    <View style={styles.menuAnchor}><MenuButton onPress={() => router.push("/(tabs)/hub")} /></View>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 28 },
  dueRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 10 },
  count: { color: colors.info, fontFamily: "Inter-Light", fontSize: 88, lineHeight: 94, letterSpacing: -2, fontVariant: ["tabular-nums"] },
  caption: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 16 },
  startButton: { marginTop: 16, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 14 },
  startText: { color: colors.learning, fontFamily: "MiSans-Medium", fontSize: 23 },
  menuAnchor: { position: "absolute", left: 22, bottom: 24 },
});
