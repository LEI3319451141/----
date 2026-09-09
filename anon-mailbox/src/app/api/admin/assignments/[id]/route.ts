import { eq } from "drizzle-orm";
import { db } from "@/db";
import { classAssignments } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { requireRole } from "@/lib/guard";

export const runtime = "nodejs";

/** 移除一条班级授权 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole("super_admin");
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const assignmentId = Number(id);
  if (!Number.isInteger(assignmentId)) return fail(400, "授权 ID 不正确");

  await db
    .delete(classAssignments)
    .where(eq(classAssignments.id, assignmentId));
  return ok({ success: true });
}
