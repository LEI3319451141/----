export default function Offline() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: "-apple-system, system-ui, sans-serif",
        background: "#f5f5f7",
        color: "#1d1d1f",
        textAlign: "center",
        padding: 24,
      }}
    >
      <div style={{ fontSize: 64, marginBottom: 16 }}>📭</div>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>
        网络连接已断开
      </h1>
      <p style={{ fontSize: 16, color: "#86868b", maxWidth: 320 }}>
        请检查网络后重试。您可以在恢复连接后刷新页面继续使用。
      </p>
      <button
        onClick={() => location.reload()}
        style={{
          marginTop: 24,
          padding: "12px 32px",
          borderRadius: 12,
          border: "none",
          background: "#007aff",
          color: "white",
          fontSize: 16,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        重试
      </button>
    </div>
  );
}
