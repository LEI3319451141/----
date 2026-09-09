"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchMe, homePathForRole } from "@/lib/client-api";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    fetchMe().then((me) => {
      if (!me) {
        router.replace("/login");
      } else {
        router.replace(homePathForRole(me.user.role));
      }
    });
  }, [router]);

  return (
    <div className="h-screen flex items-center justify-center text-[var(--color-ink-2)]">
      加载中…
    </div>
  );
}
