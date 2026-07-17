import { useState, useEffect } from "react";
import {
  Shield, Eye, EyeOff, Wifi, WifiOff, Loader2,
  ExternalLink, Trash2, Info, CheckCircle2, AlertCircle, Copy,
  RotateCcw,
} from "lucide-react";
import { adminUrl, authFetch } from "@/lib/api";

type TunnelStatus = "unknown" | "configured" | "unconfigured";

export default function Tunnel() {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [status, setStatus] = useState<TunnelStatus>("unknown");
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  async function loadStatus() {
    try {
      const res = await authFetch(adminUrl("/tunnel/status"));
      const j = await res.json() as { configured: boolean; url: string | null };
      setStatus(j.configured ? "configured" : "unconfigured");
      setTunnelUrl(j.url ?? null);
    } catch {
      setStatus("unconfigured");
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (status !== "configured") return;
    setPolling(true);
    const interval = setInterval(loadStatus, 4000);
    return () => { clearInterval(interval); setPolling(false); };
  }, [status]);

  async function handleSave() {
    if (!token.trim()) { setSaveError("Please enter your tunnel token."); return; }
    setSaveError("");
    setSaving(true);
    try {
      const res = await authFetch(adminUrl("/tunnel/config"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      if (res.ok) {
        setToken("");
        setStatus("configured");
      } else {
        const j = await res.json().catch(() => ({})) as { error?: string };
        setSaveError(j.error ?? `Error ${res.status}`);
      }
    } catch {
      setSaveError("Unable to reach admin server.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    try {
      await authFetch(adminUrl("/tunnel/config"), { method: "DELETE" });
      setStatus("unconfigured");
      setTunnelUrl(null);
    } catch {
      setSaveError("Failed to remove tunnel config.");
    }
  }

  function copyUrl() {
    if (!tunnelUrl) return;
    navigator.clipboard.writeText(tunnelUrl).then(() => {
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    });
  }

  const isRunning = !!tunnelUrl;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 32px 64px" }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <Shield size={20} color="#3b82f6" />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9" }}>Cloudflare Tunnel</h1>
        </div>
        <p style={{ fontSize: 13, color: "#475569" }}>
          Connects your API server to Cloudflare's network through an outbound-only encrypted tunnel — no open public ports required.
        </p>
      </div>

      {/* Architecture diagram */}
      <Section label="Network Architecture">
        <div style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto", paddingBottom: 4 }}>
          {[
            { label: "Internet", sub: "public traffic", color: "#64748b", icon: "🌐" },
            null,
            { label: "CF Worker", sub: "public edge page", color: "#f97316", icon: "⚡" },
            null,
            { label: "Tunnel", sub: "outbound only", color: "#3b82f6", icon: "🔒", highlight: true },
            null,
            { label: "API Server", sub: "localhost only", color: "#22c55e", icon: "🖥" },
            null,
            { label: "Admin Server", sub: "internal only", color: "#a855f7", icon: "🛡" },
          ].map((node, i) => node === null ? (
            <div key={i} style={{ flex: "0 0 auto", color: "#1e2d3d", fontSize: 18, padding: "0 4px" }}>→</div>
          ) : (
            <div
              key={i}
              style={{
                flex: "0 0 auto",
                padding: "10px 14px",
                borderRadius: 8,
                border: `1.5px solid ${node.highlight ? "#3b82f6" : "#1e2d3d"}`,
                background: node.highlight ? "#0d1e35" : "#0d1117",
                textAlign: "center",
                minWidth: 90,
              }}
            >
              <div style={{ fontSize: 20, marginBottom: 4 }}>{node.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: node.color }}>{node.label}</div>
              <div style={{ fontSize: 10, color: "#374151", marginTop: 2 }}>{node.sub}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, padding: "10px 14px", background: "#0d1420", border: "1px solid #1e2d3d", borderRadius: 8, fontSize: 12, color: "#475569", lineHeight: 1.7 }}>
          <strong style={{ color: "#64748b" }}>How it works:</strong> The <span style={{ color: "#f97316" }}>Cloudflare Worker</span> calls your API server through the <span style={{ color: "#3b82f6" }}>encrypted tunnel</span> — your server makes an outbound-only connection to Cloudflare, so no port is ever open to the internet. The <span style={{ color: "#a855f7" }}>Admin Server</span> stays completely dark — the Worker has no route to it.
        </div>
      </Section>

      {/* Status */}
      <Section label="Tunnel Status">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: isRunning ? "#052e16" : status === "configured" ? "#0d1e35" : "#1a0a0a",
              border: `1.5px solid ${isRunning ? "#166534" : status === "configured" ? "#1e3a5f" : "#3b1111"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {isRunning
              ? <Wifi size={20} color="#22c55e" />
              : status === "configured"
              ? <Loader2 size={20} color="#3b82f6" style={{ animation: "spin 1s linear infinite" }} />
              : <WifiOff size={20} color="#ef4444" />}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: isRunning ? "#4ade80" : status === "configured" ? "#60a5fa" : "#f87171" }}>
              {isRunning ? "Running" : status === "configured" ? "Starting…" : "Not configured"}
            </div>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
              {isRunning
                ? "Tunnel is active — API server reachable through Cloudflare"
                : status === "configured"
                ? "Tunnel token saved — waiting for API server restart to start tunnel"
                : "No tunnel token saved"}
            </div>
          </div>
          {polling && !isRunning && status === "configured" && (
            <div style={{ marginLeft: "auto", fontSize: 11, color: "#374151" }}>polling…</div>
          )}
        </div>

        {tunnelUrl && (
          <div style={{ marginTop: 14, padding: "12px 14px", background: "#052e16", border: "1px solid #166534", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
            <CheckCircle2 size={14} color="#22c55e" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: "#4ade80", fontWeight: 600, marginBottom: 2 }}>Tunnel URL</div>
              <div style={{ fontSize: 13, color: "#86efac", fontFamily: "monospace", wordBreak: "break-all" }}>{tunnelUrl}</div>
            </div>
            <button onClick={copyUrl} style={{ background: "none", border: "none", cursor: "pointer", color: "#4ade80", display: "flex", gap: 4, alignItems: "center", fontSize: 12, flexShrink: 0 }}>
              <Copy size={13} /> {urlCopied ? "Copied!" : "Copy"}
            </button>
            <a href={tunnelUrl} target="_blank" rel="noreferrer" style={{ color: "#4ade80", display: "flex" }}>
              <ExternalLink size={14} />
            </a>
          </div>
        )}

        {tunnelUrl && (
          <div style={{ marginTop: 10, padding: "10px 14px", background: "#0d1117", border: "1px solid #1e2d3d", borderRadius: 8, fontSize: 12, color: "#475569" }}>
            <Info size={12} color="#3b82f6" style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
            Use this URL as your <strong style={{ color: "#64748b" }}>API Server URL</strong> in the Deploy tab so Workers call your server through the tunnel.
          </div>
        )}

        {status === "configured" && !tunnelUrl && (
          <div style={{ marginTop: 14, padding: "12px 14px", background: "#1a1200", border: "1px solid #92400e", borderRadius: 8, display: "flex", alignItems: "flex-start", gap: 10 }}>
            <RotateCcw size={14} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24", marginBottom: 4 }}>API server restart required</div>
              <div style={{ fontSize: 12, color: "#78350f", lineHeight: 1.6 }}>
                The tunnel token is saved. Restart the <strong style={{ color: "#92400e" }}>Start application</strong> workflow to activate the tunnel — the URL will appear here once connected.
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* Configuration */}
      <Section label="Tunnel Token">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {status === "configured" && !token && (
            <div style={{ display: "flex", align: "center", gap: 10, padding: "10px 14px", background: "#0d1e35", border: "1px solid #1e3a5f", borderRadius: 8, fontSize: 12, color: "#60a5fa" }}>
              <CheckCircle2 size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              Tunnel token is saved. Enter a new token below to replace it.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Tunnel Token
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => { setToken(e.target.value); setSaveError(""); }}
                placeholder={status === "configured" ? "Enter new token to replace…" : "Paste your tunnel token here…"}
                style={{
                  width: "100%",
                  padding: "10px 40px 10px 12px",
                  background: "#0d1117",
                  border: `1px solid ${saveError ? "#ef4444" : "#1e2d3d"}`,
                  borderRadius: 8,
                  color: "#e2e8f0",
                  fontSize: 13,
                  outline: "none",
                  fontFamily: "monospace",
                }}
              />
              <button
                onClick={() => setShowToken((v) => !v)}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#475569", display: "flex" }}
              >
                {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {saveError && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#f87171", fontSize: 12 }}>
              <AlertCircle size={13} /> {saveError}
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "10px 22px",
                borderRadius: 8,
                border: "none",
                background: saving ? "#1e2d3d" : "linear-gradient(135deg,#2563eb,#4f46e5)",
                color: "white",
                fontSize: 13,
                fontWeight: 600,
                cursor: saving ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                opacity: saving ? 0.7 : 1,
              }}
            >
              <Shield size={14} />
              {saving ? "Saving…" : "Save Token"}
            </button>

            {status === "configured" && (
              <button
                onClick={handleRemove}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: "1px solid #3b1111",
                  background: "transparent",
                  color: "#f87171",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Trash2 size={14} /> Remove Token
              </button>
            )}
          </div>

          {/* Setup guide */}
          <div style={{ padding: "14px", background: "#0d1420", border: "1px solid #1e2d3d", borderRadius: 8, display: "flex", gap: 10 }}>
            <Info size={14} color="#3b82f6" style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.8 }}>
              <strong style={{ color: "#94a3b8" }}>How to get a tunnel token:</strong><br />
              1. Go to <span style={{ color: "#60a5fa" }}>one.dash.cloudflare.com</span> → <strong style={{ color: "#94a3b8" }}>Zero Trust</strong> → <strong style={{ color: "#94a3b8" }}>Networks</strong> → <strong style={{ color: "#94a3b8" }}>Tunnels</strong><br />
              2. Click <strong style={{ color: "#94a3b8" }}>Create a tunnel</strong> → select <strong style={{ color: "#94a3b8" }}>Cloudflared</strong><br />
              3. Name it (e.g. <em>devdoc-api</em>) → click <strong style={{ color: "#94a3b8" }}>Next</strong><br />
              4. Copy the token from the install command — it's the long string after <code style={{ color: "#94a3b8" }}>--token</code><br />
              5. Set the tunnel's <strong style={{ color: "#94a3b8" }}>Public Hostname</strong> → service: <code style={{ color: "#94a3b8" }}>HTTP · localhost:5023</code><br />
              6. Paste the token here and save
            </div>
          </div>
        </div>
      </Section>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", letterSpacing: "0.08em", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        {label}
        <div style={{ flex: 1, height: 1, background: "#1e2535" }} />
      </div>
      <div style={{ background: "#0a0f1a", border: "1px solid #1e2535", borderRadius: 10, padding: 20 }}>
        {children}
      </div>
    </div>
  );
}
