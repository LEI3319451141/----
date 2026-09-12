"use client";

import { useRouter } from "next/navigation";
import { apiFetch, clearAuthToken, type MeUser } from "@/lib/client-api";

export function TopNav({
  user,
  links,
}: {
  user: MeUser;
  links?: { href: string; label: string }[];
}) {
  const router = useRouter();

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    clearAuthToken();
    router.replace("/login");
  }

  return (
    <header className="glass sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-5 h-14 flex items-center gap-4">
        <a href="/" className="font-semibold tracking-tight">
          匿名建议信箱
        </a>
        {links && links.length > 0 && (
          <nav className="flex gap-1 text-sm">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="px-3 py-1.5 rounded-full text-[var(--color-ink-2)] hover:bg-black/5 hover:text-[var(--color-ink)] transition-colors"
              >
                {l.label}
              </a>
            ))}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="chip chip-blue">{user.roleLabel}</span>
          <span className="text-[var(--color-ink-2)] hidden sm:inline">
            {user.realName}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={logout}>
            退出
          </button>
        </div>
      </div>
    </header>
  );
}
