"use client";

/**
 * 全局错误边界（layout 本身崩溃时的兜底）：
 * 独立于全局样式表工作，保证任何情况下都不会只剩黑屏。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f5f7",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: "40px 32px",
            maxWidth: 420,
            textAlign: "center",
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 12 }}>😵</div>
          <h1 style={{ fontSize: 20, margin: "0 0 8px", color: "#1d1d1f" }}>
            应用出现了问题
          </h1>
          <p style={{ fontSize: 14, color: "#6e6e73", lineHeight: 1.6, margin: "0 0 24px" }}>
            {error.message || "发生了意外错误，请重试。"}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#0071e3",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 28px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            重试
          </button>
        </div>
      </body>
    </html>
  );
}
