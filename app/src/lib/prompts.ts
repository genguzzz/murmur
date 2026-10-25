export interface QuickPrompt {
  tag: string;
  color: string;
  text: string;
}

export const QUICK_PROMPTS: QuickPrompt[] = [
  { tag: "今天", color: "#D2915A", text: "今天有什么事让你反复想起？" },
  { tag: "情绪", color: "#C26F8A", text: "此刻的心情如何？是什么带来了这种感受？" },
  { tag: "目标", color: "#5C8FC2", text: "目前有什么事情阻碍了你的进展？" },
  { tag: "关系", color: "#C25A7A", text: "最近谁让你觉得被理解了？" },
  { tag: "感恩", color: "#7FA36B", text: "今天有哪三件值得感谢的事？" },
  { tag: "复盘", color: "#8A6FC2", text: "这周做对了什么？下周想改变什么？" },
  { tag: "放空", color: "#5FA3A3", text: "如果明天完全空闲，你会怎么过？" },
  { tag: "工作", color: "#B0814A", text: "最近工作中最消耗你精力的是什么？" },
];

export const RECORD_OPENERS = ["今天想记录什么？", "现在在想些什么？", "有什么想记下来的？", "最近发生了什么？"];
