import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { colors } from "../tokens/colors";

export function FloatingMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const navigate = (path: "/(tabs)/questions" | "/(tabs)/documents") => { onClose(); router.push(path); };
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <TouchableOpacity activeOpacity={1} style={styles.overlay} onPress={onClose}>
      <View style={styles.menu}>
        <Text style={styles.menuTitle}>学习中心</Text>
        <TouchableOpacity style={styles.menuRow} onPress={() => navigate("/(tabs)/questions")}><Text style={styles.menuIcon}>▣</Text><View><Text style={styles.menuText}>题库</Text><Text style={styles.menuHint}>按专题学习卡片</Text></View></TouchableOpacity>
        <TouchableOpacity style={styles.menuRow} onPress={() => navigate("/(tabs)/documents")}><Text style={styles.menuIcon}>▤</Text><View><Text style={styles.menuText}>文档库</Text><Text style={styles.menuHint}>查看学习资料</Text></View></TouchableOpacity>
      </View>
    </TouchableOpacity>
  </Modal>;
}

export function MenuButton({ onPress }: { onPress: () => void }) { return <TouchableOpacity accessibilityLabel="打开学习中心" style={styles.floatingButton} onPress={onPress}><Text style={styles.menuGlyph}>☰</Text></TouchableOpacity>; }
export function BackButton({ onPress }: { onPress: () => void }) { return <TouchableOpacity accessibilityLabel="返回" style={styles.backButton} onPress={onPress}><Text style={styles.backGlyph}>{"<"}</Text></TouchableOpacity>; }
export function BottomPrimaryButton({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) { return <View style={styles.bottomWrap}><TouchableOpacity disabled={disabled} onPress={onPress} style={[styles.primaryButton, disabled && styles.disabledButton]}><Text style={styles.primaryText}>▶  {label}</Text></TouchableOpacity></View>; }

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.22)", padding: 24 }, menu: { backgroundColor: colors.surface, borderRadius: 24, padding: 20, marginBottom: 60, shadowColor: "#151515", shadowOpacity: 0.1, shadowRadius: 24, elevation: 5 }, menuTitle: { color: colors.text, fontSize: 19, fontWeight: "700", marginBottom: 12 }, menuRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13 }, menuIcon: { color: colors.primary, fontSize: 24, width: 28 }, menuText: { color: colors.text, fontSize: 16, fontWeight: "600" }, menuHint: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  floatingButton: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.surface, justifyContent: "center", alignItems: "center", shadowColor: "#151515", shadowOpacity: 0.09, shadowRadius: 16, elevation: 4 }, menuGlyph: { color: colors.text, fontSize: 29, lineHeight: 31 }, backButton: { width: 42, height: 42, borderRadius: 21, justifyContent: "center", alignItems: "center" }, backGlyph: { color: colors.text, fontSize: 38, lineHeight: 38, fontWeight: "300" },
  bottomWrap: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 28, backgroundColor: colors.bg }, primaryButton: { backgroundColor: colors.primary, minHeight: 58, borderRadius: 16, alignItems: "center", justifyContent: "center" }, disabledButton: { backgroundColor: "#e5e5e9" }, primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
