import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, BookOpenCheck, FileText, Menu, Play } from "lucide-react-native";
import { colors } from "../tokens/colors";
import { useThemeStore } from "../store/useThemeStore";

export function FloatingMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const navigate = (path: "/(tabs)/questions" | "/(tabs)/documents") => { onClose(); router.push(path); };
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <TouchableOpacity activeOpacity={1} style={styles.overlay} onPress={onClose}>
      <View style={styles.menu}>
        <Text style={styles.menuTitle}>学习中心</Text>
        <TouchableOpacity style={styles.menuRow} onPress={() => navigate("/(tabs)/questions")}><BookOpenCheck size={24} color={colors.learning} style={styles.menuIcon} /><View><Text style={styles.menuText}>题库</Text><Text style={styles.menuHint}>按专题学习卡片</Text></View></TouchableOpacity>
        <TouchableOpacity style={styles.menuRow} onPress={() => navigate("/(tabs)/documents")}><FileText size={24} color={colors.document} style={styles.menuIcon} /><View><Text style={styles.menuText}>文档库</Text><Text style={styles.menuHint}>查看学习资料</Text></View></TouchableOpacity>
      </View>
    </TouchableOpacity>
  </Modal>;
}

export function MenuButton({ onPress }: { onPress: () => void }) { const isDark = useThemeStore((state) => state.theme === "dark"); return <TouchableOpacity accessibilityLabel="打开学习中心" style={styles.floatingButton} onPress={onPress}><Menu size={20} color={isDark ? colors.textDark : colors.textSecondary} /></TouchableOpacity>; }
export function BackButton({ onPress }: { onPress: () => void }) { const isDark = useThemeStore((state) => state.theme === "dark"); return <TouchableOpacity accessibilityLabel="返回" style={styles.backButton} onPress={onPress}><ArrowLeft size={25} color={isDark ? colors.textDark : colors.text} strokeWidth={1.8} /></TouchableOpacity>; }
export function BottomPrimaryButton({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) { return <View style={styles.bottomWrap}><TouchableOpacity disabled={disabled} onPress={onPress} style={[styles.primaryButton, disabled && styles.disabledButton]}><Play size={17} color="#fff" fill="#fff" /><Text style={styles.primaryText}>{label}</Text></TouchableOpacity></View>; }

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.22)", padding: 24 }, menu: { backgroundColor: colors.surface, borderRadius: 24, padding: 20, marginBottom: 60, shadowColor: "#151515", shadowOpacity: 0.1, shadowRadius: 24, elevation: 5 }, menuTitle: { color: colors.text, fontFamily: "MiSans-Semibold", fontSize: 19, marginBottom: 12 }, menuRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13 }, menuIcon: { width: 28 }, menuText: { color: colors.text, fontFamily: "MiSans-Medium", fontSize: 16 }, menuHint: { color: colors.textSecondary, fontFamily: "MiSans-Regular", fontSize: 12, marginTop: 3 },
  floatingButton: { width: 46, height: 46, borderRadius: 23, justifyContent: "center", alignItems: "center" }, backButton: { width: 42, height: 42, borderRadius: 21, justifyContent: "center", alignItems: "center" },
  bottomWrap: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 28, backgroundColor: colors.bg }, primaryButton: { backgroundColor: colors.learning, minHeight: 58, borderRadius: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }, disabledButton: { backgroundColor: "#e5e5e9" }, primaryText: { color: "#fff", fontFamily: "MiSans-Semibold", fontSize: 16 },
});
