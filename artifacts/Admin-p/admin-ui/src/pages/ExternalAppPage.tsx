import { useEffect, useState } from "react";
import { AlertCircle, ExternalLink, Loader2, Settings } from "lucide-react";
import { useLocation } from "wouter";
import { loadExternalAppUrls, safeExternalUrl } from "@/lib/api";

export default function ExternalAppPage({
  title,
  description,
  urlKey,
}: {
  title: string;
  description: string;
  urlKey: "webmail_url" | "svg_generator_url";
}) {
  const [, navigate] = useLocation();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExternalAppUrls()
      .then((settings) => setUrl(safeExternalUrl(settings[urlKey]) ?? ""))
      .catch(() => setUrl(""))
      .finally(() => setLoading(false));
  }, [urlKey]);

  function open() {
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "80px 32px", textAlign: "center" }}>
      <div style={{ width: 56, height: 56, margin: "0 auto 18px", borderRadius: 14, background: "#131924", border: "1px solid #1e2d3d", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {loading ? <Loader2 size={24} color="#3b82f6" style={{ animation: "spin 1s linear infinite" }} /> : <ExternalLink size={24} color="#3b82f6" />}
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>{title}</h1>
      <p style={{ maxWidth: 460, margin: "0 auto 24px", color: "#64748b", fontSize: 13, lineHeight: 1.6 }}>{description}</p>
      {!loading && url ? (
        <button onClick={open} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 17px", border: "none", borderRadius: 8, background: "linear-gradient(135deg,#2563eb,#4f46e5)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Open {title} <ExternalLink size={14} />
        </button>
      ) : !loading ? (
        <div style={{ display: "inline-flex", alignItems: "flex-start", gap: 8, textAlign: "left", padding: "12px 14px", background: "#1a1200", border: "1px solid #92400e", borderRadius: 8, color: "#fbbf24", fontSize: 12, lineHeight: 1.5 }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>This destination is not configured yet. <button onClick={() => navigate("/settings")} style={{ padding: 0, border: 0, background: "none", color: "#fcd34d", textDecoration: "underline", cursor: "pointer", font: "inherit" }}><Settings size={12} style={{ display: "inline", verticalAlign: "-2px" }} /> Open Settings</button></span>
        </div>
      ) : null}
    </div>
  );
}
