import { useEffect, useMemo, useRef } from "react";
import { Animated, Modal, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../tokens/colors";

export type StudyScope = "all" | "review" | "wrong" | "favorite" | "unlearned";

export interface StudyScopeOption {
  type: StudyScope;
  label: string;
  count: number;
}

interface StudyScopeBottomSheetProps {
  visible: boolean;
  rangeLabel: string;
  options: StudyScopeOption[];
  onClose: () => void;
  onSelect: (scope: StudyScope) => void;
}

export default function StudyScopeBottomSheet({ visible, rangeLabel, options, onClose, onSelect }: StudyScopeBottomSheetProps) {
  const translateY = useRef(new Animated.Value(0)).current;
  useEffect(() => { if (visible) translateY.setValue(0); }, [translateY, visible]);

  const closeWithAnimation = () => {
    Animated.timing(translateY, { toValue: 420, duration: 180, useNativeDriver: true }).start(() => {
      onClose();
    });
  };

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onMoveShouldSetPanResponderCapture: (_event, gesture) => gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_event, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy > 90) closeWithAnimation();
      else Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 4 }).start();
    },
    onPanResponderTerminate: () => Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 4 }).start(),
  }), [translateY]);

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={closeWithAnimation} />
      <Animated.View {...panResponder.panHandlers} style={[styles.sheet, { transform: [{ translateY }] }]}>
        <View style={styles.handle} />
        <Text numberOfLines={1} style={styles.title}>开始学习 · {rangeLabel}</Text>
        <View style={styles.list}>
          {options.map((option) => <Pressable key={option.type} disabled={option.count === 0} style={({ pressed }) => [styles.row, option.count === 0 && styles.rowDisabled, pressed && option.count > 0 && styles.rowPressed]} onPress={() => onSelect(option.type)}><Text style={[styles.rowLabel, option.count === 0 && styles.optionDisabled]}>{option.label}</Text><Text style={[styles.count, option.count === 0 && styles.textDisabled]}>{option.count}</Text></Pressable>)}
        </View>
      </Animated.View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(17, 18, 24, 0.2)" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingBottom: 24, shadowColor: "#141414", shadowOpacity: 0.16, shadowRadius: 24, elevation: 8 },
  handle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: "#d5d6db", marginTop: 10, marginBottom: 16 },
  title: { color: colors.text, fontFamily: "MiSans-Semibold", fontSize: 22, marginBottom: 12 },
  list: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  row: { height: 56, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowDisabled: { opacity: 0.45 }, rowPressed: { backgroundColor: colors.primaryLight }, rowLabel: { color: "#fff", backgroundColor: colors.primary, fontFamily: "MiSans-Medium", fontSize: 15, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999 }, optionDisabled: { backgroundColor: colors.border, color: colors.textTertiary }, count: { marginLeft: "auto", color: colors.textSecondary, fontFamily: "MiSans-Medium", fontSize: 15, fontVariant: ["tabular-nums"] }, textDisabled: { color: colors.textTertiary },
});
