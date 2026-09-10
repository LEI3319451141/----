"use client";

import { useEffect, useState } from "react";

/**
 * PWA 更新提示：Service Worker 检测到新版本接管时，
 * 在页面底部弹出"应用已更新，点击刷新"横幅。
 */
export default function UpdateToast() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // 注册 Service Worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          // SW 注册失败静默处理（不影响正常使用）
        });
    }

    // 监听 SW 更新通知
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "SW_UPDATED") {
        setShow(true);
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);

    return () => {
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "14px 20px",
        background: "rgba(0,0,0,0.88)",
        color: "white",
        fontFamily: "-apple-system, system-ui, sans-serif",
        backdropFilter: "blur(20px)",
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 500 }}>
        ✨ 应用已更新到最新版本
      </span>
      <button
        onClick={() => {
          // 清除所有缓存后刷新
          if ("caches" in window) {
            caches.keys().then((keys) =>
              Promise.all(keys.map((k) => caches.delete(k)))
            );
          }
          location.reload();
        }}
        style={{
          padding: "8px 20px",
          borderRadius: 8,
          border: "none",
          background: "#007aff",
          color: "white",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        立即刷新
      </button>
    </div>
  );
}
