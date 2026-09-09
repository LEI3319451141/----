/**
 * 时间模糊化（在后端完成，前端拿不到精确时间戳）：
 * - 1 小时内：刚刚
 * - 24 小时内：X小时前（按小时分桶）
 * - 更早：X月X日（跨年则带年份）
 */
export function fuzzyTime(input: Date | string): string {
  const d = typeof input === "string" ? new Date(input) : input;
  const diffMs = Date.now() - d.getTime();
  const hours = Math.floor(diffMs / 3_600_000);

  if (hours < 1) return "刚刚";
  if (hours < 24) return `${hours}小时前`;

  const now = new Date();
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
