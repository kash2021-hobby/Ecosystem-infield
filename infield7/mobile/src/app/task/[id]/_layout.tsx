import { Stack } from "expo-router";
import { colors } from "@/theme";

export default function TaskLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.cream },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        contentStyle: { backgroundColor: colors.cream },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Task" }} />
      <Stack.Screen name="update" options={{ title: "Update step", presentation: "modal" }} />
      <Stack.Screen name="next" options={{ title: "Next step" }} />
      <Stack.Screen name="delay" options={{ title: "Delay alert" }} />
      <Stack.Screen name="workflow" options={{ title: "Workflow" }} />
    </Stack>
  );
}
