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
        title={first === null ? "设置密码" : "确认密码"}
        bubble={first === null ? "设置 4 位数字密码" : "请再次输入密码"}
        onComplete={onComplete}
        footer={first === null ? "忘记密码后只能删除并重新安装 App，所有记录将会丢失。" : undefined}
      />
    </View>
  );
}
