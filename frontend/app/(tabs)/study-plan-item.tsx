import { useCallback, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { BackButton } from "../../src/components/PrototypeUI";
import { colors } from "../../src/tokens/colors";
import { useThemeStore } from "../../src/store/useThemeStore";
import { getStudyPlan, resetPlanItemProgress, saveStudyPlan, StudyPlanItem } from "../../src/data/study-plan";

export default function StudyPlanItemScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isDark = useThemeStore((state) => state.theme === "dark");
  const bg = isDark ? colors.bgDark : colors.bg;
  const surface = isDark ? colors.surfaceDark : colors.surface;
  const text = isDark ? colors.textDark : colors.text;
  const border = isDark ? colors.borderDark : "#efeff3";
  const [item, setItem] = useState<StudyPlanItem | null>(null);
  const [picker, setPicker] = useState(false);
  const load = useCallback(async () => { const plan = await getStudyPlan(); setItem(plan.items.find((entry) => entry.id === id) ?? null); }, [id]);
  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));
  const update = async (patch: Partial<StudyPlanItem>) => { const plan = await getStudyPlan(); const items = plan.items.map((entry) => entry.id === id ? { ...entry, ...patch } : entry); await saveStudyPlan({ ...plan, items }); setItem(items.find((entry) => entry.id === id) ?? null); };
  const remove = async () => { const plan = await getStudyPlan(); await saveStudyPlan({ ...plan, items: plan.items.filter((entry) => entry.id !== id) }); router.back(); };
  const themedRow = [styles.row, { borderBottomColor: border }];

  if (!item) return <View style={[styles.page, { backgroundColor: bg }]} />;
  return <View style={[styles.page, { backgroundColor: bg }]}><View style={styles.header}><BackButton onPress={() => router.back()} /><Text style={[styles.title, { color: text }]}>{item.tag}</Text></View><ScrollView contentContainerStyle={styles.content}><View style={themedRow}><Text style={[styles.rowTitle, { color: text }]}>加入每日计划</Text><Switch value={item.enabled} onValueChange={(enabled) => enabled ? update({ enabled }) : remove()} trackColor={{ false: isDark ? "#42444D" : "#e6e7eb", true: colors.primaryDark }} thumbColor={item.enabled ? colors.primary : "#fff"} /></View><Text style={styles.section}>每日学习数量</Text><TouchableOpacity style={themedRow} onPress={() => setPicker(true)}><Text style={[styles.rowTitle, { color: text }]}>每日学习数量</Text><View style={styles.valueRow}><Text style={styles.value}>{item.dailyTarget} 张</Text><ChevronRight size={20} color={colors.textSecondary} /></View></TouchableOpacity><Text style={styles.section}>学习范围</Text><View style={themedRow}><Text style={[styles.rowTitle, { color: text }]}>全部卡片</Text></View><TouchableOpacity style={styles.reset} onPress={() => Alert.alert("重置此学习内容的进度？", "不会删除题目或收藏状态。", [{ text: "取消", style: "cancel" }, { text: "重置", style: "destructive", onPress: async () => { const count = await resetPlanItemProgress(item.tag); Alert.alert("已重置", `已清空 ${count} 张卡片的学习进度。`); } }])}><Text style={styles.resetText}>重置此学习内容的进度</Text></TouchableOpacity></ScrollView><Modal visible={picker} transparent animationType="fade" onRequestClose={() => setPicker(false)}><Pressable style={styles.overlay} onPress={() => setPicker(false)}><Pressable style={[styles.sheet, { backgroundColor: surface }]} onPress={() => undefined}>{[5, 10, 20, 30, 50].map((value) => <TouchableOpacity key={value} style={[styles.option, { borderBottomColor: border }]} onPress={() => { update({ dailyTarget: value }); setPicker(false); }}><Text style={[styles.rowTitle, { color: text }]}>{value} 张</Text></TouchableOpacity>)}</Pressable></Pressable></Modal></View>;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.bg }, header: { height: 76, paddingHorizontal: 20, flexDirection: "row", alignItems: "center" }, title: { flex: 1, color: colors.text, fontFamily: "MiSans-Semibold", fontSize: 24, marginLeft: 4 }, content: { paddingHorizontal: 24 }, section: { color: colors.textSecondary, fontSize: 13, marginTop: 26, marginBottom: 8 }, row: { minHeight: 58, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#efeff3" }, rowTitle: { color: colors.text, fontFamily: "MiSans-Medium", fontSize: 16 }, valueRow: { flexDirection: "row", alignItems: "center", gap: 5 }, value: { color: colors.textSecondary, fontSize: 15 }, reset: { marginTop: 28, padding: 8 }, resetText: { color: colors.danger, fontFamily: "MiSans-Medium", fontSize: 15 }, overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.2)" }, sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingBottom: 30 }, option: { minHeight: 52, justifyContent: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#efeff3" } });
