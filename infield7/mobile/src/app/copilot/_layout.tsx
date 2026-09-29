import { Stack } from "expo-router";
import { colors } from "@/theme";

export default function CopilotLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.cream },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        contentStyle: { backgroundColor: colors.cream },
      }}
    >
      <Stack.Screen name="index" options={{ title: "AI copilot" }} />
      <Stack.Screen name="briefing" options={{ title: "Weekly brief" }} />
      <Stack.Screen name="[id]" options={{ title: "Insight" }} />
    </Stack>
  );
}
