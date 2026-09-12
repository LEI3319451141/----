/** 前端 API 调用封装（localStorage Token + Cookie 双通道鉴权） */

const TOKEN_KEY = "mb_token";

/** 登录成功后保存 token（Bearer 通道，移动端比 cookie 更可靠） */
export function setAuthToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* 隐私模式等场景忽略，仍有 cookie 通道兜底 */
  }
}

export function clearAuthToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (res.status === 401) clearAuthToken();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error ?? `请求失败（${res.status}）`
    );
  }
  return data as T;
}

export interface MeUser {
  id: number;
  loginId: string;
  realName: string;
  role: "super_admin" | "counselor" | "teacher" | "cadre" | "student";
  roleLabel: string;
  mustResetPassword: boolean;
}

export interface ManagedClass {
  classId: number;
  className: string;
  grade: string | null;
  department: string | null;
  titleId: number;
  titleName: string;
  category: "counselor" | "teacher" | "cadre";
}

/** 职务（staff_titles） */
export interface StaffTitle {
  id: number;
  name: string;
  category: "counselor" | "teacher" | "cadre";
  categoryLabel: string;
  isActive: boolean;
  holderCount?: number;
  sortOrder: number;
}

export interface MeResponse {
  user: MeUser;
  isSuperAdmin: boolean;
  studentClass: {
    classId: number;
    className: string;
    grade: string | null;
    department: string | null;
  } | null;
  managedClasses: ManagedClass[];
}

export async function fetchMe(): Promise<MeResponse | null> {
  try {
    return await apiFetch<MeResponse>("/api/auth/me");
  } catch {
    return null;
  }
}

export function homePathForRole(role: MeUser["role"]): string {
  if (role === "super_admin") return "/admin";
  if (role === "student") return "/submit";
  return "/inbox"; // counselor / teacher / cadre
}
