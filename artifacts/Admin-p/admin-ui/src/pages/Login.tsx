import { useState, useEffect, useCallback } from "react";
import {
  Eye, EyeOff, ShieldCheck, Loader2, AlertCircle,
  Lock, Sparkles, KeyRound,
} from "lucide-react";
import { adminUrl } from "@/lib/api";

type Mode = "loading" | "login" | "setup";

interface Props {
  onLogin: () => void;
}

export default function Login({ onLogin }: Props) {
  const [mode, setMode] = useState<Mode>("loading");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  const [setupUsername, setSetupUsername] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState("");

  const checkSetup = useCallback(async () => {
    try {
      const res = await fetch(adminUrl("/setup-status"));
      const j = await res.json() as { configured: boolean };
      setMode(j.configured ? "login" : "setup");
    } catch {
      setMode("login");
    }
  }, []);

  useEffect(() => { checkSetup(); }, [checkSetup]);

  function triggerError(msg: string) {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 600);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) { triggerError("Enter your username and password."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(adminUrl("/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        onLogin();
      } else if (res.status === 401) {
        triggerError("Invalid username or password.");
      } else if (res.status === 429) {
        triggerError("Too many attempts. Try again later.");
      } else {
        triggerError(`Unexpected error (${res.status}).`);
      }
    } catch {
      triggerError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    if (!setupUsername.trim() || setupPassword.length < 12 || !bootstrapToken.trim()) {
      setSetupError("Username, password (12+ characters), and bootstrap token are required.");
      return;
    }
    setSetupError("");
    setSetupLoading(true);
    try {
      const res = await fetch(adminUrl("/setup"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Bootstrap-Token": bootstrapToken.trim(), "X-Admin-Key": bootstrapToken.trim() },
        credentials: "same-origin",
        body: JSON.stringify({ username: setupUsername.trim(), password: setupPassword }),
      });
      const j = await res.json() as { ok?: boolean; error?: string };
      if (res.ok && j.ok) {
        onLogin();
      } else if (res.status === 409) {
        setMode("login");
      } else {
        setSetupError(j.error ?? `Error ${res.status}`);
      }
    } catch {
      setSetupError("Could not reach the server.");
    } finally {
      setSetupLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#060810",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Grid */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: `
          linear-gradient(rgba(59,130,246,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(59,130,246,0.04) 1px, transparent 1px)
        `,
        backgroundSize: "48px 48px",
      }} />
      {/* Glow */}
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        width: 600, height: 600, pointerEvents: "none",
        background: "radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 70%)",
      }} />

      {/* ── LOADING ── */}
      {mode === "loading" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <Loader2 size={32} color="#3b82f6" style={{ animation: "spin 1s linear infinite" }} />
          <p style={{ color: "#374151", fontSize: 13 }}>Checking configuration…</p>
        </div>
      )}

      {/* ── LOGIN ── */}
      {mode === "login" && (
        <div style={{ position: "relative", width: "100%", maxWidth: 420, margin: "0 20px", animation: shake ? "shake 0.5s ease" : undefined }}>
          <div style={{ height: 2, background: "linear-gradient(90deg,#3b82f6,#6366f1,#8b5cf6)", borderRadius: "12px 12px 0 0" }} />
          <div style={{
            background: "rgba(10,13,20,0.95)", border: "1px solid #1e2535", borderTop: "none",
            borderRadius: "0 0 12px 12px", padding: "36px 36px 32px",
            boxShadow: "0 25px 80px rgba(0,0,0,0.5)",
          }}>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: "linear-gradient(135deg,#1d4ed8,#4338ca)",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                marginBottom: 16, boxShadow: "0 8px 24px rgba(59,130,246,0.3)",
              }}>
                <ShieldCheck size={28} color="white" />
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.02em", margin: 0 }}>Admin Panel</h1>
              <p style={{ fontSize: 13, color: "#475569", margin: "6px 0 0" }}>Microsoft Device Code Auth</p>
            </div>

            <div style={{ height: 1, background: "#0f1624", marginBottom: 28 }} />

            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
                  Username
                </label>
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#374151", display: "flex" }}>
                    <Lock size={14} />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setError(""); }}
                    placeholder="Enter your username"
                    autoFocus
                    autoComplete="username"
                    style={{
                      width: "100%", padding: "11px 42px",
                      background: "#080c14", border: `1px solid ${error ? "#7f1d1d" : "#1e2535"}`,
                      borderRadius: 8, color: "#e2e8f0", fontSize: 14,
                      outline: "none", fontFamily: "monospace", letterSpacing: "0.05em",
                      boxSizing: "border-box", transition: "border-color 0.15s",
                    }}
                    onFocus={(e) => { if (!error) e.currentTarget.style.borderColor = "#3b82f6"; }}
                    onBlur={(e) => { if (!error) e.currentTarget.style.borderColor = "#1e2535"; }}
                  />
                </div>
              </div>

              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Password
                <input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" style={{ display: "block", width: "100%", marginTop: 8, padding: "11px 12px", boxSizing: "border-box", background: "#080c14", border: "1px solid #1e2535", borderRadius: 8, color: "#e2e8f0" }} />
              </label>

              {error && (
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 12px", background: "#1a0505", border: "1px solid #7f1d1d", borderRadius: 7, fontSize: 12, color: "#f87171" }}>
                  <AlertCircle size={13} style={{ flexShrink: 0 }} /> {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                style={{
                  width: "100%", padding: "12px", borderRadius: 8, border: "none",
                  background: loading ? "#1e2d3d" : "linear-gradient(135deg,#2563eb,#4f46e5)",
                  color: "white", fontSize: 14, fontWeight: 700,
                  cursor: loading ? "wait" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  marginTop: 4, opacity: loading ? 0.7 : 1,
                  boxShadow: loading ? "none" : "0 4px 16px rgba(37,99,235,0.3)",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { if (!loading) { (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.1)"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; } }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = ""; (e.currentTarget as HTMLButtonElement).style.transform = ""; }}
              >
                {loading ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <ShieldCheck size={15} />}
                {loading ? "Verifying…" : "Sign in"}
              </button>
            </form>

            <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid #0f1624", display: "flex", alignItems: "center", justifyContent: "center", gap: 16, fontSize: 11, color: "#1e2d3d" }}>
              {["Internal access only", "Port 8099", "Session only"].map((label) => (
                <span key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#1d4ed8", display: "inline-block" }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── FIRST-RUN SETUP ── */}
      {mode === "setup" && (
        <div style={{ position: "relative", width: "100%", maxWidth: 460, margin: "0 20px" }}>
          <div style={{ height: 2, background: "linear-gradient(90deg,#8b5cf6,#6366f1,#3b82f6)", borderRadius: "12px 12px 0 0" }} />
          <div style={{
            background: "rgba(10,13,20,0.95)", border: "1px solid #1e2535", borderTop: "none",
            borderRadius: "0 0 12px 12px", padding: "36px 36px 32px",
            boxShadow: "0 25px 80px rgba(0,0,0,0.5)",
          }}>
            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: "linear-gradient(135deg,#5b21b6,#4338ca)",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                marginBottom: 16, boxShadow: "0 8px 24px rgba(139,92,246,0.35)",
              }}>
                <Sparkles size={26} color="white" />
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.02em", margin: 0 }}>First-Run Setup</h1>
              <p style={{ fontSize: 13, color: "#475569", margin: "6px 0 0", lineHeight: 1.5 }}>
                No admin account has been configured.<br />Create one now to secure the panel.
              </p>
            </div>

            <div style={{ height: 1, background: "#0f1624", marginBottom: 24 }} />

            {/* Info banner */}
            <div style={{ padding: "11px 14px", background: "#0d1420", border: "1px solid #1e2d3d", borderRadius: 8, marginBottom: 20, fontSize: 12, color: "#475569", lineHeight: 1.7 }}>
              <KeyRound size={12} color="#6366f1" style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
              <strong style={{ color: "#64748b" }}>Bootstrap requires the deployment token.</strong> Create a strong password and keep the token private. This setup can only run once.
            </div>

            <form onSubmit={handleSetup} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Username
                  </label>
                </div>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    value={setupUsername}
                    onChange={(e) => { setSetupUsername(e.target.value); setSetupError(""); }}
                    autoComplete="username"
                    style={{
                      width: "100%", padding: "11px 42px 11px 12px",
                      background: "#080c14", border: `1px solid ${setupError ? "#7f1d1d" : "#2d1f5e"}`,
                      borderRadius: 8, color: "#c4b5fd", fontSize: 13,
                      outline: "none", fontFamily: "monospace", letterSpacing: "0.06em",
                      boxSizing: "border-box", transition: "border-color 0.15s",
                    }}
                    onFocus={(e) => { if (!setupError) e.currentTarget.style.borderColor = "#6366f1"; }}
                    onBlur={(e) => { if (!setupError) e.currentTarget.style.borderColor = "#2d1f5e"; }}
                  />
                </div>
              </div>

              <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Password
                <input type={showSetup ? "text" : "password"} value={setupPassword} onChange={(e) => setSetupPassword(e.target.value)} autoComplete="new-password" style={{ display: "block", width: "100%", marginTop: 8, padding: "11px 12px", boxSizing: "border-box", background: "#080c14", border: "1px solid #2d1f5e", borderRadius: 8, color: "#e2e8f0" }} />
              </label>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Bootstrap Token or Existing Admin Key
                <input type="password" value={bootstrapToken} onChange={(e) => setBootstrapToken(e.target.value)} autoComplete="off" style={{ display: "block", width: "100%", marginTop: 8, padding: "11px 12px", boxSizing: "border-box", background: "#080c14", border: "1px solid #2d1f5e", borderRadius: 8, color: "#e2e8f0" }} />
              </label>

              {setupError && (
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 12px", background: "#1a0505", border: "1px solid #7f1d1d", borderRadius: 7, fontSize: 12, color: "#f87171" }}>
                  <AlertCircle size={13} style={{ flexShrink: 0 }} /> {setupError}
                </div>
              )}

              <button type="submit" disabled={setupLoading}
                style={{
                  width: "100%", padding: "12px", borderRadius: 8, border: "none",
                  background: setupLoading ? "#1e2d3d" : "linear-gradient(135deg,#5b21b6,#4338ca)",
                  color: "white", fontSize: 14, fontWeight: 700,
                  cursor: setupLoading ? "wait" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  opacity: setupLoading ? 0.7 : 1,
                  boxShadow: setupLoading ? "none" : "0 4px 16px rgba(99,102,241,0.35)",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { if (!setupLoading) { (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.1)"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; } }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = ""; (e.currentTarget as HTMLButtonElement).style.transform = ""; }}
              >
                {setupLoading ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <ShieldCheck size={15} />}
                {setupLoading ? "Configuring…" : "Create Account & Sign In"}
              </button>

              <button type="button" onClick={() => setMode("login")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#374151", fontSize: 12, padding: 0, textAlign: "center" }}>
                Already have an account? Sign in instead
              </button>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          15% { transform: translateX(-8px); }
          30% { transform: translateX(8px); }
          45% { transform: translateX(-6px); }
          60% { transform: translateX(6px); }
          75% { transform: translateX(-3px); }
          90% { transform: translateX(3px); }
        }
      `}</style>
    </div>
  );
}
