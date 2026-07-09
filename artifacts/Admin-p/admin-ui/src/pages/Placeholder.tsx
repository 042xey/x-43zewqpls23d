import { type LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
}

export default function Placeholder({ icon: Icon, title, description }: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: 16,
        padding: 40,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: "#131924",
          border: "1px solid #1e2d3d",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={24} color="#3b82f6" />
      </div>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e2e8f0", marginBottom: 6 }}>
          {title}
        </h2>
        <p style={{ fontSize: 14, color: "#475569", maxWidth: 360 }}>{description}</p>
      </div>
      <div
        style={{
          marginTop: 8,
          padding: "6px 16px",
          borderRadius: 20,
          background: "#131924",
          border: "1px solid #1e2d3d",
          fontSize: 12,
          color: "#374151",
          letterSpacing: "0.06em",
          fontWeight: 600,
        }}
      >
        COMING SOON
      </div>
    </div>
  );
}
