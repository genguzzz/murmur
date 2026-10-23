// Local-date helpers (entries are grouped by the phone's local day).

export function dayKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return "夜深了";
  if (h < 11) return "早上好";
  if (h < 13) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} 天前`;
  return shortDate(iso);
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function fullDate(iso: string): string {
  const d = new Date(iso);
  const w = "日一二三四五六"[d.getDay()];
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mm = `${d.getMinutes()}`.padStart(2, "0");
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${w} ${hh}:${mm}`;
}

export function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = `${Math.floor(total / 60)}`.padStart(2, "0");
  const s = `${total % 60}`.padStart(2, "0");
  return `${m}:${s}`;
}

// CJK characters count individually; latin words by whitespace.
export function countWords(text: string): number {
  const cjk = text.match(/[㐀-鿿豈-﫿぀-ヿ]/g)?.length ?? 0;
  const latin = text.replace(/[㐀-鿿豈-﫿぀-ヿ]/g, " ").match(/[A-Za-z0-9']+/g)?.length ?? 0;
  return cjk + latin;
}

export function startOfWeek(d = new Date()): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}
