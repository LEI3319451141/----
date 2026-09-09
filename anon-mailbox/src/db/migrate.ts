import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("请先在 .env.local 中配置 DATABASE_URL");
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("✔ 数据库迁移完成");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
