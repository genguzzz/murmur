import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, TextInput } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { EmptyState, PillButton, Screen, SectionTitle, TopBar, toast } from "@/components/ui";
import { editEntry, useStore } from "@/lib/store";
import { colors, fonts, radius } from "@/lib/theme";

export default function EditEntry() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const entry = useStore((s) => s.entries.find((e) => e.id === id));
  const [title, setTitle] = useState(entry?.title ?? "");
  const [text, setText] = useState(entry?.text ?? entry?.rawText ?? "");

  if (!entry) return (<Screen><TopBar /><EmptyState text="找不到这条记录" /></Screen>);

  const save = () => {
    editEntry(entry.id, { title: title.trim() || entry.title, text });
    toast("已保存");
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <TopBar title="编辑记录" />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <SectionTitle title="标题" />
        <TextInput
          value={title}
          onChangeText={setTitle}
          style={{ fontFamily: fonts.serif, fontSize: 22, color: colors.text, backgroundColor: colors.card, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.border }}
        />
        <SectionTitle title="正文" />
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          style={{ minHeight: 260, fontSize: 16, lineHeight: 26, color: colors.text, backgroundColor: colors.card, borderRadius: radius.md, padding: 14, textAlignVertical: "top", borderWidth: 1, borderColor: colors.border }}
        />
        <PillButton label="保存" icon="checkmark" onPress={save} style={{ marginTop: 20 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
