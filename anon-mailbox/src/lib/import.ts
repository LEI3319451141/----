import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  classAssignments,
  classes,
  importBatches,
  staffTitles,
  studentEnrollments,
  users,
} from "@/db/schema";
import { hashPassword } from "./auth";

export interface RowError {
  row: number;
  studentNo?: string;
  reason: string;
}

interface ParsedStudent {
  rowNum: number;
  studentNo: string; // 学籍唯一标识
  loginId: string; // 登录账号
  realName: string;
  title: string | null;
  hasPassword: boolean; // 是否需要初始密码（无白名单前缀时为 true）
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/**
 * 解析学生名单 Excel/CSV。
 * - 班级有白名单前缀时：只需「姓名」列，账号 = 前缀 + 姓名，无需初始密码
 * - 班级无白名单前缀时：需「学号」+「姓名」列，账号 = 学号，初始密码 = 学号
 * 「职务」列可选（职务名，如"学习委员"；系统中不存在时将自动创建为班委职务）。
 */
function parseSheet(
  buffer: Buffer,
  rosterPrefix: string | null
): {
  students: ParsedStudent[];
  errors: RowError[];
} {
  const errors: RowError[] = [];
  const students: ParsedStudent[] = [];
  const needStudentNo = !rosterPrefix; // 无前缀才需要学号

  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { students, errors: [{ row: 0, reason: "文件为空或无法解析" }] };
  }
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
    raw: false,
  });

  // 定位表头行与列索引
  let headerIdx = -1;
  let colNo = -1;
  let colName = -1;
  let colTitle = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i] ?? [];
    const noIdx = r.findIndex((c) => cellText(c).includes("学号"));
    const nameIdx = r.findIndex((c) => cellText(c).includes("姓名"));
    const nameOk = nameIdx >= 0;
    const noOk = needStudentNo ? noIdx >= 0 : true;
    if (nameOk && noOk) {
      headerIdx = i;
      colNo = noIdx;
      colName = nameIdx;
      colTitle = r.findIndex(
        (c) => cellText(c).includes("职务") || cellText(c).includes("身份")
      );
      break;
    }
  }
  if (headerIdx < 0) {
    const hint = needStudentNo
      ? "需包含「学号」「姓名」列"
      : "需包含「姓名」列";
    return {
      students,
      errors: [{ row: 1, reason: `未找到表头，请使用模板（${hint}）` }],
    };
  }

  const seenInFile = new Set<string>();

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const rowNum = i + 1;
    const rawStudentNo = colNo >= 0 ? cellText(r[colNo]) : "";
    const realName = cellText(r[colName]);
    const titleRaw = colTitle >= 0 ? cellText(r[colTitle]) : "";

    // 整行为空 → 跳过
    if (!rawStudentNo && !realName && !titleRaw) continue;

    if (!realName) {
      errors.push({ row: rowNum, reason: "姓名为空" });
      continue;
    }

    // 计算 studentNo 与 loginId
    let studentNo: string;
    let loginId: string;
    if (rosterPrefix) {
      loginId = rosterPrefix + realName;
      studentNo = loginId; // 无前缀模式下用账号作为学籍唯一标识
    } else {
      if (!rawStudentNo) {
        errors.push({ row: rowNum, reason: "学号为空" });
        continue;
      }
      studentNo = rawStudentNo;
      loginId = rawStudentNo;
    }

    if (seenInFile.has(studentNo)) {
      errors.push({
        row: rowNum,
        studentNo,
        reason: rosterPrefix ? "姓名在文件内重复" : "学号在文件内重复",
      });
      continue;
    }
    seenInFile.add(studentNo);

    let title: string | null = null;
    if (titleRaw && titleRaw !== "学生" && titleRaw !== "普通学生") {
      title = titleRaw;
    }

    students.push({
      rowNum,
      studentNo,
      loginId,
      realName,
      title,
      hasPassword: !rosterPrefix, // 有前缀时不设初始密码
    });
  }

  return { students, errors };
}

/** 按职务名查找；不存在则创建为班委（cadre）职务。返回职务 ID 与类别 */
async function resolveTitleId(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  name: string,
  cache: Map<string, { id: number; category: string }>
): Promise<{ id: number; category: string }> {
  const cached = cache.get(name);
  if (cached) return cached;

  const [existing] = await tx
    .select({
      id: staffTitles.id,
      category: staffTitles.category,
      isActive: staffTitles.isActive,
    })
    .from(staffTitles)
    .where(eq(staffTitles.name, name))
    .limit(1);

  if (existing) {
    const result = { id: existing.id, category: existing.category };
    cache.set(name, result);
    return result;
  }

  const [created] = await tx
    .insert(staffTitles)
    .values({ name, category: "cadre", isActive: true })
    .returning({ id: staffTitles.id, category: staffTitles.category });

  const result = { id: created.id, category: created.category };
  cache.set(name, result);
  return result;
}

/**
 * 行级容错导入：单行失败不影响其他行，最终生成批次报告。
 */
export async function importStudents(opts: {
  buffer: Buffer;
  classId: number;
  operatorId: number;
  fileName: string;
}) {
  const { buffer, classId, operatorId, fileName } = opts;

  // 读取班级的白名单前缀
  const [cls] = await db
    .select({ rosterPrefix: classes.rosterPrefix })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);
  const rosterPrefix = cls?.rosterPrefix ?? null;

  const { students, errors: parseErrors } = parseSheet(buffer, rosterPrefix);
  const rowErrors: RowError[] = [...parseErrors];
  let successCount = 0;
  const titleCache = new Map<string, { id: number; category: string }>();

  for (const s of students) {
    try {
      await db.transaction(async (tx) => {
        // 职务先解析（可能自动创建班委职务）
        let resolved: { id: number; category: string } | null = null;
        if (s.title) {
          resolved = await resolveTitleId(tx, s.title, titleCache);
        }

        const [createdUser] = await tx
          .insert(users)
          .values({
            loginId: s.loginId,
            // 有白名单前缀时密码为空串，表示"尚未设置密码"，学生首次登录时自行设置
            passwordHash: s.hasPassword ? await hashPassword(s.studentNo) : "",
            realName: s.realName,
            // 授予职务的用户按职务类别赋予系统角色（班委→cadre，辅导员→counselor 等）
            role: resolved ? (resolved.category as "cadre" | "counselor" | "teacher") : "student",
            mustResetPassword: s.hasPassword, // 旧模式首登强制改密
          })
          .returning({ id: users.id });

        await tx.insert(studentEnrollments).values({
          classId,
          userId: createdUser.id,
          studentNo: s.studentNo,
        });

        if (resolved) {
          await tx.insert(classAssignments).values({
            classId,
            userId: createdUser.id,
            titleId: resolved.id,
          });
        }
      });
      successCount++;
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "23505") {
        rowErrors.push({
          row: s.rowNum,
          studentNo: s.studentNo,
          reason: rosterPrefix
            ? "该姓名已导入（账号已存在）"
            : "学号已存在（系统中已有该学生）",
        });
      } else {
        rowErrors.push({
          row: s.rowNum,
          studentNo: s.studentNo,
          reason: "数据写入失败，请检查格式",
        });
      }
    }
  }

  const [batch] = await db
    .insert(importBatches)
    .values({
      classId,
      operatorId,
      fileName: fileName.slice(0, 255),
      totalRows: students.length + parseErrors.length,
      successCount,
      failedCount: rowErrors.length,
      errorReport: rowErrors,
    })
    .returning();

  return batch;
}
