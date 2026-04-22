interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  destructive = false,
  loading = false,
  error,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div style={overlay}>
      <div style={box}>
        <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>{title}</h3>
        <p style={{ margin: "0 0 16px", fontSize: 14, color: "#374151" }}>{message}</p>
        {error && <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={cancelBtnStyle} disabled={loading}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={destructive ? deleteBtnStyle : confirmBtnStyle}
            disabled={loading}
          >
            {loading ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
};
const box: React.CSSProperties = {
  background: "#fff", borderRadius: 12, padding: "24px 20px",
  minWidth: 280, maxWidth: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
};
const cancelBtnStyle: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 6, border: "1px solid #d1d5db",
  background: "#f9fafb", cursor: "pointer", fontSize: 14,
};
const confirmBtnStyle: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 6, border: "none",
  background: "#2563eb", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600,
};
const deleteBtnStyle: React.CSSProperties = {
  ...confirmBtnStyle,
  background: "#dc2626",
};
