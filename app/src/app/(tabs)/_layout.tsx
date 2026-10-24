import { Tabs } from "expo-router";
import { View } from "react-native";
import { DrawerEdge } from "@/components/Drawer";
import { GlassTabBar } from "@/components/GlassTabBar";
import { colors } from "@/lib/theme";

// The four everyday screens. Everything else lives in the side drawer.
export default function TabsLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }} tabBar={(props) => <GlassTabBar {...props} />}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="todos" />
        <Tabs.Screen name="entries" />
        <Tabs.Screen name="chats" />
      </Tabs>
      <DrawerEdge />
    </View>
  );
}
