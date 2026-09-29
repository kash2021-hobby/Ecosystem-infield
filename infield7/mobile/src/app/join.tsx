import { useEffect } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { loadPending, savePending } from "@/session";
import { colors } from "@/theme";

export default function Join() {
  const { code } = useLocalSearchParams<{ code?: string }>();

  useEffect(() => {
    const invite = typeof code === "string" ? code.trim() : "";
    loadPending()
      .then((pending) => savePending({ phone: pending?.phone ?? "", country: pending?.country ?? "+91", devCode: pending?.devCode, invite: invite || pending?.invite }))
      .finally(() => router.replace({ pathname: "/login", params: invite ? { code: invite } : undefined }));
  }, [code]);

  return <View style={{ flex: 1, backgroundColor: colors.cream }} />;
}
