import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useThemeStore } from "../src/store/useThemeStore";
import { colors } from "../src/tokens/colors";

export default function RootLayout() {
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === "dark";

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: isDark ? colors.bgDark : colors.bg,
          },
        }}
      />
    </>
  );
}
