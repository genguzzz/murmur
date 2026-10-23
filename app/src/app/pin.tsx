import { useCallback, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { PinPad } from "@/components/PinPad";
import { TopBar } from "@/components/ui";
import { setPin } from "@/lib/lock";
import { colors } from "@/lib/theme";

// Set or change the PIN: enter twice.
export default function PinSetup() {
  const router = useRouter();
  const [first, setFirst] = useState<string | null>(null);

  const onComplete = useCallback(
    async (pin: string) => {
      if (first === null) {
        setFirst(pin);
        return true;
      }
      if (pin !== first) {
        setFirst(null);
        return false;
      }
      await setPin(pin);
      router.back();
      return true;
    },
    [first, router],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar />
      <PinPad
        key={first === null ? "first" : "confirm"}
        title={first === null ? "设置密码" : "再输一次"}
        bubble={first === null ? "设一个 4 位密码" : "确认一下"}
        onComplete={onComplete}
        footer={first === null ? "忘记密码只能删除 App 重装，记录会一起丢失。" : undefined}
      />
    </View>
  );
}
