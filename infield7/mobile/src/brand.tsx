import { Text, View } from "react-native";
import { colors } from "@/theme";

export function BrandMark({ size = 40 }: { size?: number }) {
  const window = Math.round(size * 0.14);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        backgroundColor: colors.green,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View style={{ width: size * 0.42, height: size * 0.46, borderRadius: 4, backgroundColor: colors.ink, padding: 4, justifyContent: "space-evenly" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ width: window, height: window, backgroundColor: colors.green }} />
          <View style={{ width: window, height: window, backgroundColor: colors.green }} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ width: window, height: window, backgroundColor: colors.green }} />
          <View style={{ width: window, height: window, backgroundColor: colors.green }} />
        </View>
      </View>
    </View>
  );
}

export function RadarHero() {
  return (
    <View style={{ width: 240, height: 188, alignItems: "center", justifyContent: "center" }}>
      {[176, 132, 88].map((width, index) => (
        <View
          key={width}
          style={{
            position: "absolute",
            width,
            height: width,
            borderRadius: width / 2,
            borderWidth: index === 2 ? 0 : 1.5,
            borderColor: colors.green,
            backgroundColor: index === 2 ? colors.green : "transparent",
            opacity: index === 2 ? 0.12 : 0.35,
          }}
        />
      ))}
      <View style={{ width: 36, height: 34, borderRadius: 4, backgroundColor: colors.ink, zIndex: 1 }} />
      {[
        { top: 28, left: 36, color: colors.green },
        { top: 48, left: 198, color: colors.green },
        { top: 146, left: 202, color: colors.amber },
        { top: 142, left: 32, color: colors.green },
        { top: 8, left: 112, color: colors.coral },
      ].map((pin, index) => (
        <View
          key={index}
          style={{
            position: "absolute",
            top: pin.top,
            left: pin.left,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: pin.color,
            borderWidth: 2,
            borderColor: colors.paper,
          }}
        />
      ))}
    </View>
  );
}

export function BrandWordmark() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <BrandMark size={32} />
      <Text style={{ fontSize: 18, fontWeight: "700", color: colors.ink, letterSpacing: -0.4 }}>InField 7</Text>
    </View>
  );
}
