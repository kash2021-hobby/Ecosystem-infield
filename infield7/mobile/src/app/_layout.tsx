import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "@/theme";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.cream },
          headerShadowVisible: false,
          headerTintColor: colors.ink,
          contentStyle: { backgroundColor: colors.cream },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="join" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="verify" options={{ title: "Code" }} />
        <Stack.Screen name="overview" options={{ title: "Overview", headerBackVisible: false }} />
        <Stack.Screen name="map" options={{ title: "Live map", headerBackVisible: false }} />
        <Stack.Screen name="team" options={{ title: "Team", headerBackVisible: false }} />
        <Stack.Screen name="geofence" options={{ title: "Work radius" }} />
        <Stack.Screen name="check-in" options={{ title: "Check in", headerBackVisible: false }} />
        <Stack.Screen name="tasks" options={{ title: "Tasks", headerBackVisible: false }} />
        <Stack.Screen name="task/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="leave" options={{ title: "Leave", headerBackVisible: false }} />
        <Stack.Screen name="alerts" options={{ title: "Alerts", headerBackVisible: false }} />
        <Stack.Screen name="attendance" options={{ title: "Attendance" }} />
        <Stack.Screen name="field" options={{ title: "Today's visits" }} />
        <Stack.Screen name="payroll" options={{ title: "My pay", headerBackVisible: false }} />
        <Stack.Screen name="copilot" options={{ headerShown: false }} />
        <Stack.Screen name="more" options={{ title: "More", headerBackVisible: false }} />
      </Stack>
    </>
  );
}
