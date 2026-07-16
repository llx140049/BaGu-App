import { Stack } from "expo-router";
import { useThemeStore } from "../../src/store/useThemeStore";
import { colors } from "../../src/tokens/colors";

export default function AppStackLayout() {
  const theme = useThemeStore((state) => state.theme);
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme === "dark" ? colors.bgDark : colors.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="hub" />
      <Stack.Screen name="study-plan" />
      <Stack.Screen name="study-plan-item" />
      <Stack.Screen name="questions" />
      <Stack.Screen name="topic" />
      <Stack.Screen name="question-editor" />
      <Stack.Screen name="documents" />
      <Stack.Screen name="study" />
      <Stack.Screen name="doc-reader" />
      <Stack.Screen name="collection" />
      <Stack.Screen name="stats" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
