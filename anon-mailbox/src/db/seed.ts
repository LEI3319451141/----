import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { suggestionCategories, users } from "./schema";

async function main() {
  const adminLogin = process.env.SEED_ADMIN_LOGIN ?? "admin";
  const adminPwd = process.env.SEED_ADMIN_PASSWORD ?? "admin123456";

  // 超级管理员
  const [existingAdmin] = await db
    .select()
    .from(users)
    .where(eq(users.loginId, adminLogin))
    .limit(1);
  if (!existingAdmin) {
    await db.insert(users).values({
      loginId: adminLogin,
      passwordHash: await bcrypt.hash(adminPwd, 10),
      realName: "超级管理员",
      role: "super_admin",
      mustResetPassword: true,
    });
    console.log(
      `✔ 已创建超级管理员：${adminLogin} / ${adminPwd}（首次登录请修改密码）`
    );
  } else {
    console.log("· 超级管理员已存在，跳过");
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
