import { useEffect, useState, useCallback } from "react";
import {
  LayoutDashboard, Key, RefreshCw, MonitorSmartphone,
  ShieldCheck, ShieldOff, Loader2, AlertTriangle,
  Clock, CheckCircle2, XCircle, Activity, Users, Zap,
  ChevronLeft, ChevronRight, Trash2,
} from "lucide-react";
import { adminUrl, authFetch } from "@/lib/api";

interface SessionItem {
  user_code: string;
  app: string;
  alias: string;
  authorized_at: string;
  user: string | null;
  refresh_token_active: boolean;
}

interface DashboardData {
  access_tokens: { total: number; active: number; expired: number };
  refresh_tokens: { total: number; live: number; invalidated: number; expiring_soon: number };
  device_codes: { total: number; polling: number; authorized: number; expired: number };
  sessions: { total: number; items: SessionItem[] };
  recent_activity: { type: string; label: string; sub: string; ts: string }[];
  generated_at: string;
}

const PAGE_SIZE = 5;

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function Pill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color, fontWeight: 600 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
      {value.toLocaleString()} {label}
    </span>
  );
}

function StatCard({
  icon: Icon, title, value, color, sub,
}: {
  icon: React.ElementType; title: string; value: number; color: string; sub?: React.ReactNode;
}) {
  return (
    <div style={{ background: "#0a0f1a", border: "1px solid #1e2535", borderRadius: 12, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#475569", letterSpacing: "0.04em" }}>{title.toUpperCase()}</span>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}18`, border: `1px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={15} color={color} />
        </div>
      </div>
      <div style={{ fontSize: 36, fontWeight: 800, color: "#f1f5f9", lineHeight: 1 }}>{value.toLocaleString()}</div>
      {sub && <div style={{ marginTop: -4 }}>{sub}</div>}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, action }: { icon: React.ElementType; title: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon size={15} color="#3b82f6" />
        <h2 style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.05em", margin: 0 }}>{title.toUpperCase()}</h2>
      </div>
      {action}
    </div>
  );
}

function CodeBar({ polling, authorized, expired }: { polling: number; authorized: number; expired: number }) {
  const total = polling + authorized + expired || 1;
  return (
    <div>
      <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", height: 8, background: "#1e2535", marginBottom: 10 }}>
        {polling > 0 && <div style={{ width: `${(polling / total) * 100}%`, background: "#f59e0b" }} />}
        {authorized > 0 && <div style={{ width: `${(authorized / total) * 100}%`, background: "#22c55e" }} />}
        {expired > 0 && <div style={{ width: `${(expired / total) * 100}%`, background: "#374151" }} />}
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Pill label="Polling" value={polling} color="#f59e0b" />
        <Pill label="Authorized" value={authorized} color="#22c55e" />
        <Pill label="Expired" value={expired} color="#6b7280" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sessionPage, setSessionPage] = useState(0);
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(adminUrl("/dashboard"));
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Error ${res.status}`);
      }
      const j = (await res.json()) as DashboardData;
      setData(j);
      setLastUpdated(new Date());
      setSessionPage(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function handleCleanup() {
    setCleaning(true);
    setCleanResult(null);
    try {
      const res = await authFetch(adminUrl("/device-codes/cleanup"), { method: "POST" });
      const j = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(j.error ?? `Error ${res.status}`);
      setCleanResult(j.message ?? "Done");
      await load();
    } catch (err) {
      setCleanResult(err instanceof Error ? err.message : "Cleanup failed");
    } finally {
      setCleaning(false);
    }
  }

  const activityIcon: Record<string, React.ElementType> = { access: Zap, invalidated: ShieldOff, auth: CheckCircle2 };
  const activityColor: Record<string, string> = { access: "#3b82f6", invalidated: "#ef4444", auth: "#22c55e" };

  const sessions = data?.sessions.items ?? [];
  const totalPages = Math.max(1, Math.ceil(sessions.length / PAGE_SIZE));
  const pagedSessions = sessions.slice(sessionPage * PAGE_SIZE, (sessionPage + 1) * PAGE_SIZE);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 32px 64px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <LayoutDashboard size={20} color="#3b82f6" />
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Dashboard</h1>
          </div>
          <p style={{ fontSize: 12, color: "#475569", margin: 0 }}>
            Live overview · auto-refreshes every 30s
            {lastUpdated && <span style={{ marginLeft: 8, color: "#334155" }}>· updated {fmtRelative(lastUpdated.toISOString())}</span>}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid #1e2d3d", background: "#131924", color: "#94a3b8", fontSize: 12, fontWeight: 600, cursor: loading ? "wait" : "pointer" }}
        >
          <RefreshCw size={13} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", marginBottom: 20, background: "#1a0a0a", border: "1px solid #3b1111", borderRadius: 8, fontSize: 12, color: "#f87171" }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {cleanResult && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", marginBottom: 16, background: "#052e16", border: "1px solid #166534", borderRadius: 8, fontSize: 12, color: "#4ade80" }}>
          <span>{cleanResult}</span>
          <button onClick={() => setCleanResult(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#4ade80", fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}

      {loading && !data ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#475569", fontSize: 13, padding: "60px 0", justifyContent: "center" }}>
          <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Loading dashboard…
        </div>
      ) : data ? (
        <>
          {/* Stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
            <StatCard
              icon={Key} title="Access Tokens" value={data.access_tokens.total} color="#3b82f6"
              sub={<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Pill label="Active" value={data.access_tokens.active} color="#22c55e" />
                <Pill label="Expired" value={data.access_tokens.expired} color="#6b7280" />
              </div>}
            />
            <StatCard
              icon={RefreshCw} title="Refresh Tokens" value={data.refresh_tokens.live} color="#8b5cf6"
              sub={<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Pill label="Invalidated" value={data.refresh_tokens.invalidated} color="#ef4444" />
                {data.refresh_tokens.expiring_soon > 0 && <Pill label="Expiring soon" value={data.refresh_tokens.expiring_soon} color="#f59e0b" />}
              </div>}
            />
            <StatCard
              icon={MonitorSmartphone} title="Device Codes" value={data.device_codes.total} color="#f59e0b"
              sub={<CodeBar polling={data.device_codes.polling} authorized={data.device_codes.authorized} expired={data.device_codes.expired} />}
            />
            <StatCard
              icon={Users} title="Active Sessions" value={data.sessions.total} color="#22c55e"
              sub={<div style={{ fontSize: 11, color: "#475569" }}>Live refresh tokens only</div>}
            />
          </div>

          {/* Bottom panels */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>

            {/* Active Sessions with pagination */}
            <div style={{ background: "#0a0f1a", border: "1px solid #1e2535", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column" }}>
              <SectionHeader icon={ShieldCheck} title="Active Sessions" />

              {sessions.length === 0 ? (
                <div style={{ textAlign: "center", color: "#374151", fontSize: 12, padding: "32px 0", flex: 1 }}>
                  No active sessions
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                    {pagedSessions.map((s) => (
                      <div
                        key={s.user_code}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", borderRadius: 8, background: "#0d1117", border: "1px solid #1e2535", gap: 10 }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: "#052e16", border: "1px solid #166534", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <ShieldCheck size={13} color="#22c55e" />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {s.user ?? "Unknown user"}
                            </div>
                            <div style={{ fontSize: 10, color: "#475569" }}>{s.app} · {s.user_code}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: "#334155", flexShrink: 0 }}>{fmtRelative(s.authorized_at)}</div>
                      </div>
                    ))}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: "1px solid #1e2535" }}>
                      <button
                        onClick={() => setSessionPage((p) => Math.max(0, p - 1))}
                        disabled={sessionPage === 0}
                        style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 6, border: "1px solid #1e2d3d", background: "transparent", color: sessionPage === 0 ? "#1e2d3d" : "#94a3b8", fontSize: 11, fontWeight: 600, cursor: sessionPage === 0 ? "not-allowed" : "pointer" }}
                      >
                        <ChevronLeft size={13} /> Prev
                      </button>
                      <span style={{ fontSize: 11, color: "#475569" }}>
                        {sessionPage + 1} / {totalPages} &nbsp;·&nbsp; {sessions.length} sessions
                      </span>
                      <button
                        onClick={() => setSessionPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={sessionPage === totalPages - 1}
                        style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 6, border: "1px solid #1e2d3d", background: "transparent", color: sessionPage === totalPages - 1 ? "#1e2d3d" : "#94a3b8", fontSize: 11, fontWeight: 600, cursor: sessionPage === totalPages - 1 ? "not-allowed" : "pointer" }}
                      >
                        Next <ChevronRight size={13} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Recent Activity */}
            <div style={{ background: "#0a0f1a", border: "1px solid #1e2535", borderRadius: 12, padding: 20 }}>
              <SectionHeader icon={Activity} title="Recent Activity" />
              {data.recent_activity.length === 0 ? (
                <div style={{ textAlign: "center", color: "#374151", fontSize: 12, padding: "32px 0" }}>No activity yet</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {data.recent_activity.map((a, i) => {
                    const AIcon = activityIcon[a.type] ?? Zap;
                    const aColor = activityColor[a.type] ?? "#3b82f6";
                    return (
                      <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "9px 0", borderBottom: i < data.recent_activity.length - 1 ? "1px solid #0f1923" : "none" }}>
                        <div style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, background: `${aColor}18`, border: `1px solid ${aColor}30`, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                          <AIcon size={12} color={aColor} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#cbd5e1" }}>{a.label}</div>
                          <div style={{ fontSize: 10, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.sub}</div>
                        </div>
                        <div style={{ fontSize: 10, color: "#334155", flexShrink: 0, paddingTop: 2 }}>{fmtRelative(a.ts)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Device code breakdown + cleanup */}
          <div style={{ marginTop: 18, background: "#0a0f1a", border: "1px solid #1e2535", borderRadius: 12, padding: 20 }}>
            <SectionHeader
              icon={MonitorSmartphone}
              title="Device Code Breakdown"
              action={
                <button
                  onClick={handleCleanup}
                  disabled={cleaning || data.device_codes.expired === 0}
                  title={data.device_codes.expired === 0 ? "No expired codes to clean up" : `Delete ${data.device_codes.expired} expired code${data.device_codes.expired === 1 ? "" : "s"} from the database`}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 12px", borderRadius: 7,
                    border: "1px solid #3b1111",
                    background: cleaning || data.device_codes.expired === 0 ? "#0d1117" : "#1a0a0a",
                    color: cleaning || data.device_codes.expired === 0 ? "#374151" : "#f87171",
                    fontSize: 11, fontWeight: 600,
                    cursor: cleaning || data.device_codes.expired === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  {cleaning
                    ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                    : <Trash2 size={12} />}
                  {cleaning ? "Cleaning…" : `Clean Up Expired (${data.device_codes.expired})`}
                </button>
              }
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {[
                { label: "Polling", value: data.device_codes.polling, desc: "Waiting for user to enter code", color: "#f59e0b", icon: Clock },
                { label: "Authorized", value: data.device_codes.authorized, desc: "User successfully authenticated", color: "#22c55e", icon: CheckCircle2 },
                { label: "Expired", value: data.device_codes.expired, desc: "Code window closed without auth", color: "#6b7280", icon: XCircle },
              ].map((item) => (
                <div key={item.label} style={{ padding: "14px 16px", borderRadius: 9, background: "#0d1117", border: "1px solid #1e2535", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: `${item.color}18`, border: `1px solid ${item.color}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <item.icon size={17} color={item.color} />
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#f1f5f9", lineHeight: 1 }}>{item.value.toLocaleString()}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: item.color, marginTop: 2 }}>{item.label}</div>
                    <div style={{ fontSize: 10, color: "#374151", marginTop: 1 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
