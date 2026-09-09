import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { classes, importBatches } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { requireRole } from "@/lib/guard";
import { fuzzyTime } from "@/lib/time";
import { importStudents } from "@/lib/import";

export const runtime = "nodejs";

/** 班级的导入历史 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole("super_admin");
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const classId = Number(id);
  if (!Number.isInteger(classId)) return fail(400, "班级 ID 不正确");

  const list = await db
    .select({
      id: importBatches.id,
      fileName: importBatches.fileName,
      totalRows: importBatches.totalRows,
      successCount: importBatches.successCount,
      failedCount: importBatches.failedCount,
      createdAt: importBatches.createdAt,
    })
    .from(importBatches)
    .where(eq(importBatches.classId, classId))
    .orderBy(desc(importBatches.createdAt))
    .limit(50);

  return ok(list.map((b) => ({ ...b, timeDisplay: fuzzyTime(b.createdAt) })));
}

/** 上传 Excel/CSV 导入学生（行级容错，返回批次报告） */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole("super_admin");
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const classId = Number(id);
  if (!Number.isInteger(classId)) return fail(400, "班级 ID 不正确");

  const [classExists] = await db
    .select({ id: classes.id, name: classes.name })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);
  if (!classExists) return fail(404, "班级不存在");

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return fail(400, "请上传文件（字段名 file）");
  }
  const fileName = file.name;
  if (!/\.(xlsx|xls|csv)$/i.test(fileName)) {
    return fail(400, "仅支持 .xlsx / .xls / .csv 文件");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) return fail(400, "文件内容为空");

  const batch = await importStudents({
    buffer,
    classId,
    operatorId: guard.user.id,
    fileName,
  });

  return ok(batch, 201);
}
