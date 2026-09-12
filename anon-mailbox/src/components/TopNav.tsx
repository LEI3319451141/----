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
      <div className="max-w-5xl mx-auto px-4 sm:px-5 min-h-14 py-1.5 flex items-center flex-wrap gap-x-2 gap-y-1 sm:gap-x-4">
        <a
          href="/"
          className="font-semibold tracking-tight whitespace-nowrap"
        >
          匿名建议信箱
        </a>
        {links && links.length > 0 && (
          <nav className="flex gap-0.5 sm:gap-1 text-sm">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="px-2.5 sm:px-3 py-1.5 rounded-full whitespace-nowrap text-[var(--color-ink-2)] hover:bg-black/5 hover:text-[var(--color-ink)] transition-colors"
              >
                {l.label}
              </a>
            ))}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2 sm:gap-3 text-sm">
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
