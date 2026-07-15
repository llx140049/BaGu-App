import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useThemeStore } from "../src/store/useThemeStore";
import { colors } from "../src/tokens/colors";

// The app uses a fixed mobile visual system; device accessibility font scaling
// must not make navigation titles and compact list rows overflow their layout.
const TextComponent = Text as any;
const TextInputComponent = TextInput as any;
TextComponent.defaultProps = { ...(TextComponent.defaultProps || {}), allowFontScaling: false, maxFontSizeMultiplier: 1 };
TextInputComponent.defaultProps = { ...(TextInputComponent.defaultProps || {}), allowFontScaling: false, maxFontSizeMultiplier: 1 };

export default function RootLayout() {
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === "dark";

  return <SafeAreaProvider>
    <View style={[styles.canvas, isDark && styles.canvasDark]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <View style={[styles.phoneFrame, isDark && styles.phoneFrameDark]}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: {
                backgroundColor: isDark ? colors.bgDark : colors.bg,
              },
            }}
          />
        </View>
      </SafeAreaView>
    </View>
  </SafeAreaProvider>;
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: "#eef0f4" },
  canvasDark: { backgroundColor: "#0d0d11" },
  safeArea: { flex: 1 },
  phoneFrame: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
    backgroundColor: colors.bg,
    ...(Platform.OS === "web" ? {
      maxWidth: 430,
      maxHeight: 932,
      shadowColor: "#16161c",
      shadowOpacity: 0.14,
      shadowRadius: 28,
      elevation: 8,
      overflow: "hidden",
    } : {}),
  },
  phoneFrameDark: { backgroundColor: colors.bgDark },
});
