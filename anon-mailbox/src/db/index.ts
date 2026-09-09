import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import * as schema from "./schema";

// 复用连接，避免 dev 热重载时反复建池
const globalForDb = globalThis as unknown as { __neonPool?: Pool };

// 构建期或未配置环境变量时使用占位连接串，避免模块导入即报错；
// 真正发起查询时若未配置 DATABASE_URL 会得到明确的连接错误。
const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://user:pass@localhost:5432/placeholder?sslmode=require";

const pool = globalForDb.__neonPool ?? new Pool({ connectionString });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__neonPool = pool;
}

export const db = drizzle(pool, { schema });
