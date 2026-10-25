import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Mascot } from "@/components/Mascot";
import { PillButton, TopBar } from "@/components/ui";
import { createTextEntry } from "@/lib/store";
import { colors, fonts, radius } from "@/lib/theme";

export default function Write() {
  const router = useRouter();
  const params = useLocalSearchParams<{ prompt?: string; followUpOf?: string; threadOf?: string }>();
  const [text, setText] = useState("");

  const save = () => {
    const entry = createTextEntry(text.trim(), { prompt: params.prompt, followUpOf: params.followUpOf, threadId: params.threadOf });
    router.replace({ pathname: "/processing", params: { id: entry.id } });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <TopBar title={params.threadOf ? "记一条后续" : "写记录"} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
          <Mascot size={44} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.serif, fontSize: 24, color: colors.text }}>写下此刻的想法</Text>
            <Text style={{ color: colors.textSoft, marginTop: 4, lineHeight: 20 }}>
              {params.prompt ?? "保存后，Murmur 会自动整理内容。"}
            </Text>
          </View>
        </View>
        <TextInput
          autoFocus
          multiline
          value={text}
          onChangeText={setText}
          placeholder="今天想记录什么？"
          placeholderTextColor={colors.textFaint}
          style={{ minHeight: 220, backgroundColor: colors.card, borderRadius: radius.md, padding: 16, fontSize: 16, lineHeight: 24, color: colors.text, textAlignVertical: "top", borderWidth: 1, borderColor: colors.border }}
        />
        <PillButton label="保存记录" icon="arrow-up" onPress={save} disabled={text.trim().length < 2} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
