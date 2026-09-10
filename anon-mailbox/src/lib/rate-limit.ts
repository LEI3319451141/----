/**
 * 轻量内存限流（适用于单实例部署，Vercel serverless 函数实例间不共享，
 * 但仍能有效阻止同一实例上的快速刷屏）。
 * 滑动窗口算法：保留最近 N 秒内的请求时间戳列表。
 */

interface RateBucket {
  timestamps: number[];
}

const buckets = new Map<string, RateBucket>();

/** 默认清理周期：超过 5 分钟未活跃的桶会被清除，防止内存泄漏 */
const SWEEP_INTERVAL = 5 * 60 * 1000;
let lastSweep = Date.now();

function sweep() {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    // 清理过期的桶
    if (bucket.timestamps.length === 0 || now - bucket.timestamps[bucket.timestamps.length - 1] > SWEEP_INTERVAL) {
      buckets.delete(key);
    }
  }
}

/**
 * 检查是否触发限流。
 * @param key 限流键（如 `comment:${userId}`）
 * @param max 最大请求次数
 * @param windowMs 时间窗口（毫秒）
 * @returns { allowed: boolean; retryAfter: number } retryAfter 单位秒
 */
export function rateLimit(
  key: string,
  max: number,
  windowMs: number
): { allowed: boolean; retryAfter: number } {
  sweep();
  const now = Date.now();
  const cutoff = now - windowMs;

  const bucket = buckets.get(key) ?? { timestamps: [] };
  // 移除窗口外的时间戳
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= max) {
    const oldest = bucket.timestamps[0];
    const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return { allowed: true, retryAfter: 0 };
}

/** 预置常用限流策略 */
export function commentRateLimit(userId: number) {
  // 每用户每 60 秒最多 10 条评论
  return rateLimit(`comment:${userId}`, 10, 60_000);
}

export function suggestionRateLimit(userId: number) {
  // 每用户每 5 分钟最多 5 条建议（匿名另有 7 次/周配额）
  return rateLimit(`suggestion:${userId}`, 5, 5 * 60_000);
}
