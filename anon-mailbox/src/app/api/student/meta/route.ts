import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { classes, suggestionCategories } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { TARGETABLE_STAFF_ROLES, getStudentClassId } from "@/lib/rbac";
import { RECIPIENT_TYPE_LABELS } from "@/lib/labels";
import { requireUser } from "@/lib/guard";

export const runtime = "nodejs";

/** 提交页所需数据：我的班级、可选群体、建议分类 */
export async function GET() {
  const guard = await requireUser();
  if ("response" in guard) return guard.response;
  const user = guard.user;

  const classId = await getStudentClassId(user.id);
  if (!classId) {
    return fail(403, "您尚未归属任何班级，请联系管理员");
  }

  const [cls] = await db
    .select({ id: classes.id, name: classes.name })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);

  const categories = await db
    .select({
      id: suggestionCategories.id,
      name: suggestionCategories.name,
      sortOrder: suggestionCategories.sortOrder,
    })
    .from(suggestionCategories)
    .where(eq(suggestionCategories.isActive, true))
    .orderBy(asc(suggestionCategories.sortOrder), suggestionCategories.id);

  return ok({
    myClass: cls ?? { id: classId, name: "未知班级" },
    groupOptions: TARGETABLE_STAFF_ROLES.map((v) => ({
      value: v,
      label: RECIPIENT_TYPE_LABELS[v],
    })),
    categories,
  });
}
