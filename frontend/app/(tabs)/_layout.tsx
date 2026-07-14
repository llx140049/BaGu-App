import { Tabs } from "expo-router";
import { useThemeStore } from "../../src/store/useThemeStore";
import { colors } from "../../src/tokens/colors";
import { Text } from "react-native";

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    "学习": "📖",
    "知识库": "📚",
    "统计": "📊",
    "我的": "👤",
  };
  return (
    <Text style={{ fontSize: focused ? 22 : 18 }}>
      {icons[label] ?? "📄"}
    </Text>
  );
}

export default function TabLayout() {
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === "dark";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: isDark ? colors.surfaceDark : colors.surface,
          borderTopColor: isDark ? colors.borderDark : colors.border,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: isDark ? colors.textDark : colors.textSecondary,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "学习",
          tabBarIcon: ({ focused }) => <TabIcon label="学习" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="questions"
        options={{
          title: "知识库",
          tabBarIcon: ({ focused }) => <TabIcon label="知识库" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: "统计",
          tabBarIcon: ({ focused }) => <TabIcon label="统计" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "我的",
          tabBarIcon: ({ focused }) => <TabIcon label="我的" focused={focused} />,
        }}
      />
      <Tabs.Screen name="study" options={{ href: null }} />
      <Tabs.Screen name="doc-reader" options={{ href: null }} />
      <Tabs.Screen name="collection" options={{ href: null }} />
    </Tabs>
  );
}
