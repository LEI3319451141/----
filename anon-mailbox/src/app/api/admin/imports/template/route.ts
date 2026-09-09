import * as XLSX from "xlsx";
import { requireRole } from "@/lib/guard";

export const runtime = "nodejs";

/** 下载学生名单导入模板（xlsx） */
export async function GET() {
  const guard = await requireRole("super_admin");
  if ("response" in guard) return guard.response;

  const ws = XLSX.utils.aoa_to_sheet([
    ["学号", "姓名", "职务（留空为普通学生；班干部填写如：班长、学习委员）"],
    ["20230101", "张三", ""],
    ["20230102", "李四", "班长"],
    ["20230103", "王五", "学习委员"],
  ]);
  ws["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 40 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "学生名单");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="student-import-template.xlsx"',
    },
  });
}
