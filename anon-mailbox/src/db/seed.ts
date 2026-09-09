import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { suggestionCategories, users } from "./schema";

async function main() {
  // 超级管理员（两个账号，可用环境变量覆盖）
  const adminAccounts = [
    {
      loginId: process.env.SEED_ADMIN1_LOGIN ?? "管理员1",
      password: process.env.SEED_ADMIN1_PASSWORD ?? "123456",
      realName: "管理员1",
    },
    {
      loginId: process.env.SEED_ADMIN2_LOGIN ?? "管理员2",
      password: process.env.SEED_ADMIN2_PASSWORD ?? "456789",
      realName: "管理员2",
    },
  ];

  for (const acc of adminAccounts) {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.loginId, acc.loginId))
      .limit(1);
    if (!existing) {
      await db.insert(users).values({
        loginId: acc.loginId,
        passwordHash: await bcrypt.hash(acc.password, 10),
        realName: acc.realName,
        role: "super_admin",
        mustResetPassword: false,
      });
      console.log(`✔ 已创建超级管理员：${acc.loginId} / ${acc.password}`);
    } else {
      console.log(`· 超级管理员 ${acc.loginId} 已存在，跳过`);
    }
  }

  // 默认建议分类
  const [existingCat] = await db
    .select({ id: suggestionCategories.id })
    .from(suggestionCategories)
    .limit(1);
  if (!existingCat) {
    await db.insert(suggestionCategories).values([
      { name: "教学建议", sortOrder: 1 },
      { name: "班级管理", sortOrder: 2 },
      { name: "后勤生活", sortOrder: 3 },
      { name: "活动组织", sortOrder: 4 },
      { name: "其他", sortOrder: 99 },
    ]);
    console.log("✔ 已写入默认建议分类");
  } else {
    console.log("· 建议分类已存在，跳过");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
