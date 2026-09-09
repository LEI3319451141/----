// 去掉易混淆的 I、O
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/**
 * 每次提交随机生成脱敏标识（如「同学F」）。
 * 不存储任何 标识→学生 的映射，多次提交之间不可关联，匿名性最强。
 */
export function randomAnonymousLabel(): string {
  const letter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
  return `同学${letter}`;
}
