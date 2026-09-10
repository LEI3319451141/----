// 去掉易混淆的 I、O
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/**
 * 每次提交随机生成脱敏标识（如「同学F」）。
 * 不存储任何 标识→学生 的映射，多次提交之间不可关联，匿名性最强。
 * @param avoid 需避开的已有标识（如同一讨论串内已使用的匿名标识）
 */
export function randomAnonymousLabel(avoid?: Set<string>): string {
  const pool = avoid
    ? LETTERS.split("").filter((l) => !avoid.has(`同学${l}`))
    : LETTERS.split("");
  const candidates = pool.length > 0 ? pool : LETTERS.split("");
  const letter = candidates[Math.floor(Math.random() * candidates.length)];
  return `同学${letter}`;
}
