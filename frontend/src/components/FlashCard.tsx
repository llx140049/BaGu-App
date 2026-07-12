import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
} from "react-native";
import { colors } from "../tokens/colors";

interface FlashCardProps {
  question: string;
  answer: string;
  category: string;
  flipped: boolean;
  onFlip: () => void;
  onRemember?: () => void;
  onForgot?: () => void;
  style?: StyleProp<ViewStyle>;
  showActions?: boolean;
}

export default function FlashCard({
  question,
  answer,
  category,
  flipped,
  onFlip,
  onRemember,
  onForgot,
  style,
  showActions = true,
}: FlashCardProps) {
  return (
    <View style={[styles.wrapper, style]}>
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.surface }]}
        activeOpacity={0.9}
        onPress={onFlip}
      >
        <View style={styles.categoryBadge}>
          <Text style={[styles.categoryText, { color: colors.primary }]}>
            {category}
          </Text>
        </View>

        <Text style={[styles.text, { color: colors.text }]} selectable>
          {flipped ? answer : question}
        </Text>

        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          {flipped ? "点击查看问题" : "点击翻转卡片"}
        </Text>
      </TouchableOpacity>

      {flipped && showActions && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.danger }]}
            onPress={onForgot}
          >
            <Text style={styles.actionText}>👎 忘了</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.success }]}
            onPress={onRemember}
          >
            <Text style={styles.actionText}>👍 记得</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: "100%" },
  card: {
    borderRadius: 16,
    padding: 28,
    minHeight: 260,
    justifyContent: "center",
    alignItems: "center",
  },
  categoryBadge: {
    position: "absolute",
    top: 16,
    left: 16,
    backgroundColor: "#e8ece4",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryText: { fontSize: 12, fontWeight: "600" },
  text: { fontSize: 18, lineHeight: 26, textAlign: "center" },
  hint: { fontSize: 12, position: "absolute", bottom: 16 },
  actions: { flexDirection: "row", gap: 12, marginTop: 16 },
  actionBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  actionText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
