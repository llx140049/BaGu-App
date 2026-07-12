import { View, Text, StyleSheet } from "react-native";
import { colors } from "../tokens/colors";

interface CategoryBadgeProps {
  label: string;
  count?: number;
}

export default function CategoryBadge({ label, count }: CategoryBadgeProps) {
  return (
    <View style={styles.badge}>
      <Text style={[styles.text, { color: colors.primary }]}>{label}</Text>
      {count !== undefined && (
        <Text style={[styles.count, { color: colors.textTertiary }]}>
          {count}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e8ece4",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  text: { fontSize: 12, fontWeight: "600" },
  count: { fontSize: 11 },
});
