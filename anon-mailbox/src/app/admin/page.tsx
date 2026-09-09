"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, fetchMe, type MeResponse } from "@/lib/client-api";
import { TopNav } from "@/components/TopNav";
import { PasswordModal } from "@/components/PasswordModal";
import { ROLE_LABELS } from "@/lib/labels";

// ---------- 类型 ----------
interface ClassRow {
  id: number;
  name: string;
  grade: string | null;
  department: string | null;
  status: string;
  studentCount: number;
  staffCount: number;
}
interface StaffRow {
  id: number;
  loginId: string;
  realName: string;
  role: string;
  status: string;
  assignments: {
    classId: number;
    className: string;
    staffRole: string;
    title: string | null;
  }[];
}
interface AssignmentRow {
  id: number;
  userId: number;
  loginId: string;
  realName: string;
  staffRole: string;
  staffRoleLabel: string;
  title: string | null;
  status: string;
}
interface StudentRow {
  userId: number;
  studentNo: string;
  realName: string;
  status: string;
  cadreTitle: string | null;
}
interface ImportRow {
  id: number;
  fileName: string;
  totalRows: number;
  successCount: number;
  failedCount: number;
  timeDisplay: string;
}
interface BatchDetail {
  id: number;
  totalRows: number;
  successCount: number;
  failedCount: number;
  errorReport: { row: number; studentNo?: string; reason: string }[];
}
interface CategoryRow {
  id: number;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

// ---------- 主页面 ----------
export default function AdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [needReset, setNeedReset] = useState(false);
  const [tab, setTab] = useState<"classes" | "staff" | "categories">(
    "classes"
  );

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);

  const loadClasses = useCallback(
    () =>
      apiFetch<ClassRow[]>("/api/admin/classes").then((d) => setClasses(d)),
    []
  );
  const loadStaff = useCallback(
    () => apiFetch<StaffRow[]>("/api/admin/users").then((d) => setStaff(d)),
    []
  );
  const loadCategories = useCallback(
    () =>
      apiFetch<CategoryRow[]>("/api/admin/categories").then((d) =>
        setCategories(d)
      ),
    []
  );

  useEffect(() => {
    (async () => {
      const data = await fetchMe();
      if (!data) {
        router.replace("/login");
        return;
      }
      if (!data.isSuperAdmin) {
        router.replace("/inbox");
        return;
      }
      setMe(data);
      setNeedReset(data.user.mustResetPassword);
      loadClasses();
      loadStaff();
      loadCategories();
    })();
  }, [router, loadClasses, loadStaff, loadCategories]);

  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--color-ink-2)]">
        加载中…
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {needReset && <PasswordModal onDone={() => setNeedReset(false)} />}
      <TopNav
        user={me.user}
        links={[
          { href: "/admin", label: "管理后台" },
          { href: "/inbox", label: "建议信箱" },
        ]}
      />

      <main className="max-w-5xl mx-auto px-5 py-10">
        <h1 className="text-2xl font-semibold tracking-tight mb-6">管理后台</h1>

        <div className="segmented mb-6 max-w-md">
          <button
            type="button"
            className={tab === "classes" ? "active" : ""}
            onClick={() => setTab("classes")}
          >
            班级与导入
          </button>
          <button
            type="button"
            className={tab === "staff" ? "active" : ""}
            onClick={() => setTab("staff")}
          >
            教职工
          </button>
          <button
            type="button"
            className={tab === "categories" ? "active" : ""}
            onClick={() => setTab("categories")}
          >
            建议分类
          </button>
        </div>

        {tab === "classes" && (
          <ClassesTab
            classes={classes}
            staff={staff}
            onChanged={() => {
              loadClasses();
              loadStaff();
            }}
          />
        )}
        {tab === "staff" && (
          <StaffTab staff={staff} onChanged={loadStaff} />
        )}
        {tab === "categories" && (
          <CategoriesTab categories={categories} onChanged={loadCategories} />
        )}
      </main>
    </div>
  );
}

// ---------- 班级 Tab ----------
function ClassesTab({
  classes,
  staff,
  onChanged,
}: {
  classes: ClassRow[];
  staff: StaffRow[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [department, setDepartment] = useState("");
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  async function createClass(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await apiFetch("/api/admin/classes", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          grade: grade.trim() || undefined,
          department: department.trim() || undefined,
        }),
      });
      setName("");
      setGrade("");
      setDepartment("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    }
  }

  async function toggleArchive(c: ClassRow) {
    await apiFetch(`/api/admin/classes/${c.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: c.status === "active" ? "archived" : "active",
      }),
    });
    onChanged();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={createClass} className="card p-6">
        <h2 className="font-semibold mb-4">创建班级</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <input
            className="input"
            placeholder="班级名称 *（如 计算机2301班）"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="input"
            placeholder="年级（如 2023级）"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
          />
          <input
            className="input"
            placeholder="院系（可选）"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          />
        </div>
        {error && (
          <p className="text-sm text-[var(--color-danger)] mt-3">{error}</p>
        )}
        <button className="btn btn-primary mt-4" type="submit">
          创建
        </button>
      </form>

      <div className="space-y-3">
        {classes.map((c) => (
          <div key={c.id} className="card overflow-hidden">
            <div
              className="p-5 flex items-center gap-3 flex-wrap cursor-pointer hover:bg-black/[0.02] transition-colors"
              onClick={() => setOpenId(openId === c.id ? null : c.id)}
            >
              <div className="flex-1 min-w-[200px]">
                <div className="font-semibold flex items-center gap-2">
                  {c.name}
                  {c.status === "archived" && (
                    <span className="chip">已归档</span>
                  )}
                </div>
                <div className="text-sm text-[var(--color-ink-2)] mt-0.5">
                  {[c.grade, c.department].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <span className="chip">学生 {c.studentCount}</span>
              <span className="chip">接收端 {c.staffCount}</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleArchive(c);
                }}
              >
                {c.status === "active" ? "归档" : "恢复"}
              </button>
              <span className="text-[var(--color-ink-2)] text-sm w-6 text-center">
                {openId === c.id ? "▲" : "▼"}
              </span>
            </div>

            {openId === c.id && (
              <ClassPanel
                classId={c.id}
                staff={staff}
                onChanged={onChanged}
              />
            )}
          </div>
        ))}
        {classes.length === 0 && (
          <div className="card p-10 text-center text-[var(--color-ink-2)]">
            还没有班级，先创建一个吧
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- 班级详情面板（授权 + 名单 + 导入） ----------
function ClassPanel({
  classId,
  staff,
  onChanged,
}: {
  classId: number;
  staff: StaffRow[];
  onChanged: () => void;
}) {
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [section, setSection] = useState<"import" | "roster" | "assign">(
    "import"
  );

  const [userId, setUserId] = useState("");
  const [staffRole, setStaffRole] = useState("counselor");
  const [title, setTitle] = useState("");

  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [batch, setBatch] = useState<BatchDetail | null>(null);

  const loadAll = useCallback(async () => {
    const [a, s, im] = await Promise.all([
      apiFetch<AssignmentRow[]>(`/api/admin/classes/${classId}/assignments`),
      apiFetch<StudentRow[]>(`/api/admin/classes/${classId}/students`),
      apiFetch<ImportRow[]>(`/api/admin/classes/${classId}/imports`),
    ]);
    setAssignments(a);
    setStudents(s);
    setImports(im);
  }, [classId]);

  useEffect(() => {
    if (!loaded) {
      setLoaded(true);
      loadAll();
    }
  }, [loaded, loadAll]);

  async function uploadFile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem(
      "file"
    ) as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      setUploadMsg("请选择文件");
      return;
    }
    setUploading(true);
    setUploadMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/admin/classes/${classId}/imports`, {
        method: "POST",
        body: fd,
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "导入失败");
      setBatch(data as BatchDetail);
      setUploadMsg(
        `导入完成：成功 ${data.successCount} 条，失败 ${data.failedCount} 条`
      );
      e.currentTarget.reset();
      loadAll();
      onChanged();
    } catch (err) {
      setUploadMsg(err instanceof Error ? err.message : "导入失败");
    } finally {
      setUploading(false);
    }
  }

  async function addAssignment(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    await apiFetch(`/api/admin/classes/${classId}/assignments`, {
      method: "POST",
      body: JSON.stringify({
        userId: Number(userId),
        staffRole,
        title: title.trim() || undefined,
      }),
    });
    setUserId("");
    setTitle("");
    loadAll();
    onChanged();
  }

  async function removeAssignment(id: number) {
    await apiFetch(`/api/admin/assignments/${id}`, { method: "DELETE" });
    loadAll();
    onChanged();
  }

  async function viewBatch(id: number) {
    const d = await apiFetch<BatchDetail>(`/api/admin/imports/${id}`);
    setBatch(d);
  }

  return (
    <div className="border-t border-black/5 p-5 bg-black/[0.015]">
      <div className="segmented max-w-sm mb-5">
        <button
          type="button"
          className={section === "import" ? "active" : ""}
          onClick={() => setSection("import")}
        >
          名单导入
        </button>
        <button
          type="button"
          className={section === "roster" ? "active" : ""}
          onClick={() => setSection("roster")}
        >
          学生名单 ({students.length})
        </button>
        <button
          type="button"
          className={section === "assign" ? "active" : ""}
          onClick={() => setSection("assign")}
        >
          人员授权 ({assignments.length})
        </button>
      </div>

      {section === "import" && (
        <div className="space-y-4">
          <div className="card p-5 bg-white/60">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <p className="text-sm text-[var(--color-ink-2)]">
                支持 .xlsx / .xls / .csv，需包含「学号」「姓名」列，可含「职务」列。
                初始密码为学号，首登强制修改。
              </p>
              <a
                href="/api/admin/imports/template"
                className="btn btn-ghost btn-sm"
              >
                下载模板
              </a>
            </div>
            <form onSubmit={uploadFile} className="flex items-center gap-3 flex-wrap">
              <input
                type="file"
                name="file"
                accept=".xlsx,.xls,.csv"
                className="text-sm"
              />
              <button className="btn btn-primary btn-sm" disabled={uploading}>
                {uploading ? "导入中…" : "上传并导入"}
              </button>
            </form>
            {uploadMsg && (
              <p className="text-sm mt-3 font-medium">{uploadMsg}</p>
            )}
            {batch && (
              <div className="mt-4 text-sm">
                <div className="flex items-center gap-2 mb-2">
                  <span className="chip chip-green">
                    成功 {batch.successCount}
                  </span>
                  <span
                    className={`chip ${batch.failedCount > 0 ? "chip-orange" : ""}`}
                  >
                    失败 {batch.failedCount}
                  </span>
                </div>
                {batch.errorReport.length > 0 && (
                  <div className="table-wrap card bg-white/60 p-3 max-h-56 overflow-y-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>行号</th>
                          <th>学号</th>
                          <th>原因</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batch.errorReport.map((e, i) => (
                          <tr key={i}>
                            <td>第 {e.row} 行</td>
                            <td>{e.studentNo ?? "—"}</td>
                            <td className="text-[var(--color-danger)]">
                              {e.reason}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {imports.length > 0 && (
            <div className="table-wrap card p-4 bg-white/60">
              <table className="table">
                <thead>
                  <tr>
                    <th>文件</th>
                    <th>时间</th>
                    <th>成功/总数</th>
                    <th>失败</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((im) => (
                    <tr key={im.id}>
                      <td className="max-w-[200px] truncate">{im.fileName}</td>
                      <td className="text-[var(--color-ink-2)]">
                        {im.timeDisplay}
                      </td>
                      <td>
                        {im.successCount}/{im.totalRows}
                      </td>
                      <td>
                        <span
                          className={
                            im.failedCount > 0
                              ? "text-[var(--color-warning)] font-medium"
                              : "text-[var(--color-ink-2)]"
                          }
                        >
                          {im.failedCount}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => viewBatch(im.id)}
                        >
                          查看报告
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {section === "roster" && (
        <div className="table-wrap card p-4 bg-white/60">
          {students.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-2)] p-4 text-center">
              暂无学生，请先通过 Excel 导入名单
            </p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>学号</th>
                  <th>姓名</th>
                  <th>职务</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.userId}>
                    <td>{s.studentNo}</td>
                    <td className="font-medium">{s.realName}</td>
                    <td>
                      {s.cadreTitle ? (
                        <span className="chip chip-purple">{s.cadreTitle}</span>
                      ) : (
                        <span className="text-[var(--color-ink-2)]">学生</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`chip ${s.status === "active" ? "chip-green" : ""}`}
                      >
                        {s.status === "active" ? "正常" : "已停用"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {section === "assign" && (
        <div className="space-y-4">
          <form onSubmit={addAssignment} className="card p-5 bg-white/60">
            <h3 className="font-medium mb-3 text-sm">分配接收端人员</h3>
            <div className="grid sm:grid-cols-[1fr_140px_140px_auto] gap-3">
              <select
                className="select"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                required
              >
                <option value="">选择教职工…</option>
                {staff.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.realName}（{s.loginId}·{ROLE_LABELS[s.role] ?? s.role}）
                  </option>
                ))}
              </select>
              <select
                className="select"
                value={staffRole}
                onChange={(e) => setStaffRole(e.target.value)}
              >
                <option value="counselor">辅导员</option>
                <option value="teacher">科任教师</option>
                <option value="cadre">班干部</option>
              </select>
              <input
                className="input"
                placeholder="备注（任教学科/职务）"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <button className="btn btn-primary" type="submit">
                分配
              </button>
            </div>
          </form>

          <div className="table-wrap card p-4 bg-white/60">
            {assignments.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-2)] p-4 text-center">
                暂无授权人员
              </p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>账号</th>
                    <th>角色</th>
                    <th>备注</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => (
                    <tr key={a.id}>
                      <td className="font-medium">{a.realName}</td>
                      <td className="text-[var(--color-ink-2)]">{a.loginId}</td>
                      <td>
                        <span className="chip chip-blue">{a.staffRoleLabel}</span>
                      </td>
                      <td>{a.title ?? "—"}</td>
                      <td>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => removeAssignment(a.id)}
                        >
                          移除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- 教职工 Tab ----------
function StaffTab({
  staff,
  onChanged,
}: {
  staff: StaffRow[];
  onChanged: () => void;
}) {
  const [loginId, setLoginId] = useState("");
  const [realName, setRealName] = useState("");
  const [role, setRole] = useState("counselor");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function createStaff(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      const res = await apiFetch<{ initialPassword: string }>(
        "/api/admin/users",
        {
          method: "POST",
          body: JSON.stringify({
            loginId: loginId.trim(),
            realName: realName.trim(),
            role,
            password: password.trim() || undefined,
          }),
        }
      );
      setMsg(`创建成功，初始密码：${res.initialPassword}（首登需修改）`);
      setLoginId("");
      setRealName("");
      setPassword("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    }
  }

  async function toggleStatus(s: StaffRow) {
    await apiFetch(`/api/admin/users/${s.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: s.status === "active" ? "disabled" : "active",
      }),
    });
    onChanged();
  }

  async function resetPassword(s: StaffRow) {
    const pwd = window.prompt(`为 ${s.realName} 设置新密码（至少 6 位）：`);
    if (!pwd) return;
    try {
      await apiFetch(`/api/admin/users/${s.id}`, {
        method: "PATCH",
        body: JSON.stringify({ resetPassword: pwd }),
      });
      window.alert(`密码已重置，新密码：${pwd}（下次登录需修改）`);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "重置失败");
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={createStaff} className="card p-6">
        <h2 className="font-semibold mb-1">创建教职工账号</h2>
        <p className="text-sm text-[var(--color-ink-2)] mb-4">
          班干部由 Excel 名单导入时自动创建，此处用于创建辅导员 / 科任教师。
        </p>
        <div className="grid sm:grid-cols-4 gap-3">
          <input
            className="input"
            placeholder="登录账号 *（工号）"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            required
          />
          <input
            className="input"
            placeholder="姓名 *"
            value={realName}
            onChange={(e) => setRealName(e.target.value)}
            required
          />
          <select
            className="select"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="counselor">辅导员</option>
            <option value="teacher">科任教师</option>
          </select>
          <input
            className="input"
            placeholder="初始密码（留空=账号）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="text"
          />
        </div>
        {error && (
          <p className="text-sm text-[var(--color-danger)] mt-3">{error}</p>
        )}
        {msg && <p className="text-sm text-[var(--color-success)] mt-3">{msg}</p>}
        <button className="btn btn-primary mt-4" type="submit">
          创建账号
        </button>
      </form>

      <div className="table-wrap card p-4">
        <table className="table">
          <thead>
            <tr>
              <th>姓名</th>
              <th>账号</th>
              <th>角色</th>
              <th>授权班级</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td className="font-medium">{s.realName}</td>
                <td className="text-[var(--color-ink-2)]">{s.loginId}</td>
                <td>
                  <span className="chip chip-blue">
                    {ROLE_LABELS[s.role] ?? s.role}
                  </span>
                </td>
                <td className="text-sm">
                  {s.assignments.length === 0
                    ? "—"
                    : s.assignments
                        .map(
                          (a) =>
                            `${a.className}${a.title ? `（${a.title}）` : ""}`
                        )
                        .join("、")}
                </td>
                <td>
                  <span
                    className={`chip ${s.status === "active" ? "chip-green" : ""}`}
                  >
                    {s.status === "active" ? "正常" : "已停用"}
                  </span>
                </td>
                <td>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => resetPassword(s)}
                    >
                      重置密码
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => toggleStatus(s)}
                    >
                      {s.status === "active" ? "停用" : "启用"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- 分类 Tab ----------
function CategoriesTab({
  categories,
  onChanged,
}: {
  categories: CategoryRow[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await apiFetch("/api/admin/categories", {
      method: "POST",
      body: JSON.stringify({ name: name.trim() }),
    });
    setName("");
    onChanged();
  }

  async function toggleActive(c: CategoryRow) {
    await apiFetch(`/api/admin/categories/${c.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !c.isActive }),
    });
    onChanged();
  }

  async function remove(c: CategoryRow) {
    if (!window.confirm(`确定删除分类「${c.name}」？历史建议的分类将变为空。`))
      return;
    await apiFetch(`/api/admin/categories/${c.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={add} className="card p-6 flex gap-3 flex-wrap">
        <input
          className="input flex-1 min-w-[200px]"
          placeholder="新分类名称（如 心理健康）"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn btn-primary" type="submit">
          添加分类
        </button>
      </form>

      <div className="card p-4 table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>分类</th>
              <th>排序</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">{c.name}</td>
                <td className="text-[var(--color-ink-2)]">{c.sortOrder}</td>
                <td>
                  <span className={`chip ${c.isActive ? "chip-green" : ""}`}>
                    {c.isActive ? "启用" : "停用"}
                  </span>
                </td>
                <td>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => toggleActive(c)}
                    >
                      {c.isActive ? "停用" : "启用"}
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => remove(c)}
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
