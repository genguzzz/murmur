export interface QuickPrompt {
  tag: string;
  color: string;
  text: string;
}

export const QUICK_PROMPTS: QuickPrompt[] = [
  { tag: "今天", color: "#D2915A", text: "今天有什么事让你多想了一下？" },
  { tag: "情绪", color: "#C26F8A", text: "此刻你的心情像什么天气？为什么？" },
  { tag: "目标", color: "#5C8FC2", text: "什么事情正在拖住你，让你没法往前走？" },
  { tag: "关系", color: "#C25A7A", text: "最近谁让你觉得被理解了？" },
  { tag: "感恩", color: "#7FA36B", text: "说三件今天值得感谢的小事。" },
  { tag: "复盘", color: "#8A6FC2", text: "这周做对了什么？下周想改变什么？" },
  { tag: "放空", color: "#5FA3A3", text: "如果明天完全空闲，你会怎么过？" },
  { tag: "工作", color: "#B0814A", text: "工作里最近最消耗你的是什么？" },
];

export const RECORD_OPENERS = ["想聊点什么？", "说说现在在想什么吧", "我在听", "随便说，乱也没关系"];
