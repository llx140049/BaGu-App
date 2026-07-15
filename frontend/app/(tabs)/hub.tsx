import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../../src/tokens/colors";
import { BackButton } from "../../src/components/PrototypeUI";

interface HubItemProps { icon: string; iconColor: string; title: string; hint?: string; onPress: () => void; }
function HubItem({ icon, iconColor, title, hint, onPress }: HubItemProps) {
  return <TouchableOpacity style={styles.item} onPress={onPress}>
    <View style={[styles.iconBox, { backgroundColor: `${iconColor}15` }]}><Text style={[styles.icon, { color: iconColor }]}>{icon}</Text></View>
    <View style={styles.itemCopy}><Text style={styles.itemTitle}>{title}</Text>{hint ? <Text style={styles.itemHint}>{hint}</Text> : null}</View>
    <Text style={styles.arrow}>›</Text>
  </TouchableOpacity>;
}

export default function KnowledgeHubScreen() {
  const router = useRouter();
  return <View style={styles.page}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.titleRow}><BackButton onPress={() => router.back()} /><Text style={styles.title}>知识库</Text></View>
      <Text style={styles.section}>学习内容</Text>
      <View style={styles.group}>
        <HubItem icon="▣" iconColor={colors.primary} title="题库" hint="管理我的专题和卡片" onPress={() => router.push("/(tabs)/questions")} />
        <View style={styles.divider} />
        <HubItem icon="▤" iconColor="#57a860" title="文档库" hint="管理学习资料和文档" onPress={() => router.push("/(tabs)/documents")} />
      </View>
      <Text style={styles.section}>学习数据</Text>
      <View style={styles.group}><HubItem icon="◔" iconColor="#8a79e8" title="学习统计" hint="查看学习数据和趋势" onPress={() => router.push("/(tabs)/stats")} /></View>
      <Text style={styles.section}>更多</Text>
      <View style={styles.group}>
        <HubItem icon="⚙" iconColor={colors.textSecondary} title="设置" onPress={() => router.push("/(tabs)/settings")} />
        <View style={styles.divider} />
        <HubItem icon="?" iconColor={colors.textSecondary} title="帮助与反馈" onPress={() => Alert.alert("帮助与反馈", "该功能将在下一阶段完善")} />
      </View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg }, content: { flexGrow: 1, paddingTop: 34, paddingHorizontal: 24, paddingBottom: 32 }, titleRow: { flexDirection: "row", alignItems: "center", marginBottom: 48, marginLeft: -9 }, title: { color: colors.text, fontSize: 34, fontWeight: "700", marginLeft: 5 }, section: { color: colors.textSecondary, fontSize: 16, marginBottom: 12 }, group: { backgroundColor: colors.surface, borderRadius: 18, marginBottom: 30, overflow: "hidden", shadowColor: "#171717", shadowOpacity: 0.03, shadowRadius: 10, elevation: 1 }, item: { minHeight: 80, flexDirection: "row", alignItems: "center", paddingHorizontal: 18 }, iconBox: { width: 42, height: 42, borderRadius: 11, alignItems: "center", justifyContent: "center", marginRight: 15 }, icon: { fontSize: 21, fontWeight: "600" }, itemCopy: { flex: 1 }, itemTitle: { color: colors.text, fontSize: 20, fontWeight: "500" }, itemHint: { color: colors.textSecondary, fontSize: 14, marginTop: 4 }, arrow: { color: colors.textSecondary, fontSize: 32, fontWeight: "300" }, divider: { height: StyleSheet.hairlineWidth, marginLeft: 75, backgroundColor: colors.border },
});
