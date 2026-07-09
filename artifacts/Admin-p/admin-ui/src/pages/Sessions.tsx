import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Users, RefreshCw, Search, X, Download, Loader2,
  AlertTriangle, ShieldCheck, ShieldOff, Clock,
  CheckCircle2, XCircle, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, Copy, Check,
  CalendarClock, Wifi, Ban,
} from "lucide-react";
import { adminUrl, authFetch } from "@/lib/api";

interface Session {
  user_code: string;
  app: string;
  alias: string;
  status: string;
  generated_at: string;
  expires_at: string;
  last_polled_at: string | null;
  authorized_at: string | null;
  user: string | null;
  resource: string | null;
  foci: string | null;
  refresh_token_id: number | null;
  refresh_token_active: boolean | null;
  refresh_token_expires_at: string | null;
  last_refreshed_at: string | null;
  next_refresh_at: string | null;
  invalidated_at: string | null;
  invalid_reason: string | null;
}

interface Alias { alias: string; name: string }
type SortKey = "generated_at" | "authorized_at" | "user" | "app" | "status";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 20;

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string; Icon: React.ElementType }> = {
  SUCCESS: { label: "Authorized", color: "#22c55e", bg: "#052e16", border: "#166534", Icon: CheckCircle2 },
  POLLING: { label: "Polling",    color: "#f59e0b", bg: "#1c1007", border: "#92400e", Icon: Clock },
  EXPIRED: { label: "Expired",   color: "#6b7280", bg: "#111827", border: "#1f2937", Icon: XCircle },
};

function fmtFull(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function fmtShort(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtRel(iso: string | null) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  const mins = Math.floor(abs / 60000);
  if (mins < 1) return "just now";
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  const label = days > 0 ? `${days}d` : hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
  return future ? `in ${label}` : `${label} ago`;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <button onClick={copy} style={{ background: "none", border: "none", cursor: "pointer", color: copied ? "#22c55e" : "#374151", padding: "0 3px", display: "inline-flex", alignItems: "center" }} title="Copy">
      {copied ? <Check size={11} /> : <Copy size={11} />}
    </button>
  );
}

function TsRow({ label, iso, dim }: { label: string; iso: string | null; dim?: boolean }) {
  if (!iso) return (
    <div style={{ display: "flex", gap: 12, padding: "5px 0", borderBottom: "1px solid #0f1923" }}>
      <span style={{ minWidth: 140, fontSize: 11, color: "#2d3748", fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 11, color: "#1e2535", fontStyle: "italic" }}>—</span>
    </div>
  );
  return (
    <div style={{ display: "flex", gap: 12, padding: "5px 0", borderBottom: "1px solid #0f1923", alignItems: "center" }}>
      <span style={{ minWidth: 140, fontSize: 11, color: dim ? "#475569" : "#64748b", fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 11, color: dim ? "#475569" : "#94a3b8", fontFamily: "monospace" }}>{fmtFull(iso)}</span>
      <span style={{ fontSize: 10, color: "#374151" }}>({fmtRel(iso)})</span>
      <CopyBtn text={iso} />
    </div>
  );
}

function FieldRow({ label, value, mono, highlight }: { label: string; value: string | null; mono?: boolean; highlight?: string }) {
  if (!value) return (
    <div style={{ display: "flex", gap: 12, padding: "5px 0", borderBottom: "1px solid #0f1923" }}>
      <span style={{ minWidth: 140, fontSize: 11, color: "#2d3748", fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 11, color: "#1e2535", fontStyle: "italic" }}>—</span>
    </div>
  );
  return (
    <div style={{ display: "flex", gap: 12, padding: "5px 0", borderBottom: "1px solid #0f1923", alignItems: "center" }}>
      <span style={{ minWidth: 140, fontSize: 11, color: "#64748b", fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 11, color: highlight ?? "#e2e8f0", fontFamily: mono ? "monospace" : "inherit", wordBreak: "break-all" }}>{value}</span>
      <CopyBtn text={value} />
    </div>
  );
}

function TimelineDot({ done, active, label }: { done: boolean; active: boolean; label: string }) {
  const color = done ? "#22c55e" : active ? "#f59e0b" : "#1e2535";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 70 }}>
      <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, boxShadow: active ? `0 0 8px ${color}` : "none" }} />
      <span style={{ fontSize: 10, color: done ? "#64748b" : active ? "#f59e0b" : "#1e2535", fontWeight: 600, textAlign: "center", lineHeight: 1.3 }}>{label}</span>
    </div>
  );
}

function AuditDetail({ s }: { s: Session }) {
  const isSuccess = s.status === "SUCCESS";
  const isPolling = s.status === "POLLING";
  const tokenRevoked = s.refresh_token_active === false;
  const tokenLive = s.refresh_token_active === true;

  return (
    <div style={{ padding: "20px 20px 20px 44px", background: "#060a10", borderTop: "1px solid #0f1923" }}>
      {/* Timeline */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#374151", letterSpacing: "0.08em", marginBottom: 12 }}>CAPTURE LIFECYCLE</div>
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          <TimelineDot done label="Code Generated" active={false} />
          <div style={{ flex: 1, height: 1, background: isPolling || isSuccess ? "#22c55e" : "#1e2535", margin: "0 0 14px" }} />
          <TimelineDot done={isPolling || isSuccess} active={isPolling} label="Polling Started" />
          <div style={{ flex: 1, height: 1, background: isSuccess ? "#22c55e" : "#1e2535", margin: "0 0 14px" }} />
          <TimelineDot done={isSuccess} active={false} label="Auth Captured" />
          <div style={{ flex: 1, height: 1, background: tokenLive ? "#22c55e" : tokenRevoked ? "#ef4444" : "#1e2535", margin: "0 0 14px" }} />
          <TimelineDot done={tokenLive} active={false} label={tokenRevoked ? "Token Revoked" : "Token Live"} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Device Code events */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#374151", letterSpacing: "0.08em", marginBottom: 10 }}>DEVICE CODE</div>
          <TsRow label="Generated At" iso={s.generated_at} />
          <TsRow label="Code Expires At" iso={s.expires_at} dim />
          <TsRow label="Last Polled At" iso={s.last_polled_at} dim />
          <FieldRow label="User Code" value={s.user_code} mono />
          <FieldRow label="Application" value={s.app} />
          <FieldRow label="Client ID" value={s.alias} mono />
        </div>

        {/* Auth + Token */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#374151", letterSpacing: "0.08em", marginBottom: 10 }}>AUTHENTICATION &amp; TOKEN</div>
          <TsRow label="Authorized At" iso={s.authorized_at} />
          <TsRow label="RT Expires At" iso={s.refresh_token_expires_at} />
          <TsRow label="Last Refreshed" iso={s.last_refreshed_at} />
          <TsRow label="Next Refresh" iso={s.next_refresh_at} />
          {s.invalidated_at && <TsRow label="Invalidated At" iso={s.invalidated_at} />}
          <FieldRow label="User (UPN)" value={s.user} highlight="#e2e8f0" />
          <FieldRow label="Resource" value={s.resource} mono />
          <FieldRow label="FOCI" value={s.foci} mono />
          {s.invalid_reason && (
            <FieldRow label="Invalid Reason" value={s.invalid_reason} highlight="#f87171" />
          )}
          <div style={{ display: "flex", gap: 12, padding: "5px 0" }}>
            <span style={{ minWidth: 140, fontSize: 11, color: "#64748b", fontWeight: 600 }}>Token Status</span>
            {s.refresh_token_active === null ? (
              <span style={{ fontSize: 11, color: "#374151", fontStyle: "italic" }}>No token captured</span>
            ) : s.refresh_token_active ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#22c55e" }}><ShieldCheck size={12} /> Live</span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#ef4444" }}><ShieldOff size={12} /> Revoked</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function exportCSV(sessions: Session[]) {
  const headers = [
    "User Code", "User", "App", "Client ID", "Status",
    "Generated At", "Code Expires At", "Last Polled At",
    "Authorized At", "Resource", "FOCI",
    "RT Active", "RT Expires At", "Last Refreshed At", "Next Refresh At",
    "Invalidated At", "Invalid Reason",
  ];
  const rows = sessions.map((s) => [
    s.user_code, s.user ?? "", s.app, s.alias, s.status,
    s.generated_at, s.expires_at, s.last_polled_at ?? "",
    s.authorized_at ?? "", s.resource ?? "", s.foci ?? "",
    s.refresh_token_active === null ? "" : s.refresh_token_active ? "Yes" : "No",
    s.refresh_token_expires_at ?? "", s.last_refreshed_at ?? "", s.next_refresh_at ?? "",
    s.invalidated_at ?? "", s.invalid_reason ?? "",
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit_sessions_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [appFilter, setAppFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("generated_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await authFetch(adminUrl("/sessions"));
      if (!res.ok) { const j = (await res.json().catch(() => ({}))) as { error?: string }; throw new Error(j.error ?? `Error ${res.status}`); }
      const j = (await res.json()) as { sessions: Session[]; aliases: Alias[] };
      setSessions(j.sessions); setAliases(j.aliases);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
    setPage(0);
  }

  function toggleExpand(code: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(code) ? n.delete(code) : n.add(code);
      return n;
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      if (appFilter && s.alias !== appFilter) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      if (q) return (s.user ?? "").toLowerCase().includes(q) || s.user_code.toLowerCase().includes(q) || s.app.toLowerCase().includes(q) || (s.resource ?? "").toLowerCase().includes(q);
      return true;
    });
  }, [sessions, search, appFilter, statusFilter]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    let av: string | null = null, bv: string | null = null;
    if (sortKey === "user") { av = a.user; bv = b.user; }
    else if (sortKey === "app") { av = a.app; bv = b.app; }
    else if (sortKey === "status") { av = a.status; bv = b.status; }
    else if (sortKey === "authorized_at") { av = a.authorized_at; bv = b.authorized_at; }
    else { av = a.generated_at; bv = b.generated_at; }
    const cmp = (av ?? "").localeCompare(bv ?? "");
    return sortDir === "desc" ? -cmp : cmp;
  }), [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const authorized = sessions.filter((s) => s.status === "SUCCESS").length;
  const polling = sessions.filter((s) => s.status === "POLLING").length;
  const expired = sessions.filter((s) => s.status === "EXPIRED").length;
  const liveTokens = sessions.filter((s) => s.refresh_token_active === true).length;

  const hasFilters = search || appFilter || statusFilter;

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronDown size={11} style={{ opacity: 0.2 }} />;
    return sortDir === "desc" ? <ChevronDown size={11} color="#60a5fa" /> : <ChevronUp size={11} color="#60a5fa" />;
  }

  function ColHeader({ label, col }: { label: string; col?: SortKey }) {
    return (
      <div
        onClick={col ? () => toggleSort(col) : undefined}
        style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: col && sortKey === col ? "#60a5fa" : "#374151", letterSpacing: "0.07em", cursor: col ? "pointer" : "default", userSelect: "none" }}
      >
        {label}{col && <SortIcon col={col} />}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 32px 64px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <CalendarClock size={20} color="#3b82f6" />
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Session Audit Log</h1>
          </div>
          <p style={{ fontSize: 12, color: "#475569", margin: 0 }}>
            Complete record of every device code flow — click any row to expand the full audit trail.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => exportCSV(filtered)}
            disabled={filtered.length === 0}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid #1e3a5f", background: "#0d1e35", color: filtered.length === 0 ? "#334155" : "#60a5fa", fontSize: 12, fontWeight: 600, cursor: filtered.length === 0 ? "not-allowed" : "pointer" }}
            title="Export all visible rows as CSV (17 columns)"
          >
            <Download size={13} /> Export CSV
          </button>
          <button onClick={load} disabled={loading}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid #1e2d3d", background: "#131924", color: "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            <RefreshCw size={13} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
          </button>
        </div>
      </div>

      {/* Summary pills */}
      {!loading && (
        <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          {[
            { label: "Total Codes", value: sessions.length, color: "#94a3b8", Icon: Users },
            { label: "Authorized", value: authorized, color: "#22c55e", Icon: CheckCircle2 },
            { label: "Polling", value: polling, color: "#f59e0b", Icon: Clock },
            { label: "Expired", value: expired, color: "#6b7280", Icon: XCircle },
            { label: "Live Tokens", value: liveTokens, color: "#3b82f6", Icon: Wifi },
          ].map((p) => (
            <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 14px", borderRadius: 20, background: "#0a0f1a", border: "1px solid #1e2535", fontSize: 11, fontWeight: 600, color: p.color }}>
              <p.Icon size={11} />
              <span style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 700 }}>{p.value}</span>
              <span style={{ color: p.color }}>{p.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180, maxWidth: 340 }}>
          <Search size={13} color="#475569" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search user, code, app, resource…"
            style={{ width: "100%", padding: "8px 28px 8px 30px", borderRadius: 8, border: "1px solid #1e2d3d", background: "#0d1117", color: "#e2e8f0", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
          {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#475569", display: "flex" }}><X size={13} /></button>}
        </div>
        <select value={appFilter} onChange={(e) => { setAppFilter(e.target.value); setPage(0); }}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #1e2d3d", background: "#0d1117", color: "#e2e8f0", fontSize: 12, outline: "none" }}>
          <option value="">All apps</option>
          {aliases.map((a) => <option key={a.alias} value={a.alias}>{a.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #1e2d3d", background: "#0d1117", color: "#e2e8f0", fontSize: 12, outline: "none" }}>
          <option value="">All statuses</option>
          <option value="SUCCESS">Authorized</option>
          <option value="POLLING">Polling</option>
          <option value="EXPIRED">Expired</option>
        </select>
        {hasFilters && (
          <button onClick={() => { setSearch(""); setAppFilter(""); setStatusFilter(""); setPage(0); }}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", borderRadius: 8, border: "1px solid #1e2d3d", background: "transparent", color: "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            <X size={12} /> Clear
          </button>
        )}
        {hasFilters && <span style={{ fontSize: 11, color: "#475569" }}>{filtered.length} of {sessions.length}</span>}
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", marginBottom: 16, background: "#1a0a0a", border: "1px solid #3b1111", borderRadius: 8, fontSize: 12, color: "#f87171" }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#475569", fontSize: 13, padding: "60px 0", justifyContent: "center" }}>
          <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Loading audit log…
        </div>
      ) : sorted.length === 0 ? (
        <div style={{ padding: "48px 20px", textAlign: "center", color: "#374151", fontSize: 13, background: "#0a0f1a", border: "1px dashed #1e2535", borderRadius: 10 }}>
          {hasFilters ? "No sessions match your filters." : "No sessions recorded yet."}
        </div>
      ) : (
        <>
          <div style={{ background: "#0a0f1a", border: "1px solid #1e2535", borderRadius: 12, overflow: "hidden" }}>

            {/* Table header */}
            <div style={{ display: "grid", gridTemplateColumns: "28px 110px 1fr 150px 90px 180px 180px 100px", padding: "10px 16px", borderBottom: "1px solid #1e2535", background: "#080c14" }}>
              <div />
              <ColHeader label="USER CODE" />
              <ColHeader label="USER (UPN)" col="user" />
              <ColHeader label="APPLICATION" col="app" />
              <ColHeader label="STATUS" col="status" />
              <ColHeader label="GENERATED AT" col="generated_at" />
              <ColHeader label="AUTHORIZED AT" col="authorized_at" />
              <ColHeader label="TOKEN" />
            </div>

            {paged.map((s, i) => {
              const meta = STATUS_META[s.status] ?? STATUS_META.EXPIRED;
              const isOpen = expanded.has(s.user_code);
              const isLast = i === paged.length - 1;

              return (
                <div key={s.user_code} style={{ borderBottom: !isLast || isOpen ? "1px solid #0f1923" : "none" }}>

                  {/* Main row */}
                  <div
                    onClick={() => toggleExpand(s.user_code)}
                    style={{ display: "grid", gridTemplateColumns: "28px 110px 1fr 150px 90px 180px 180px 100px", padding: "12px 16px", alignItems: "center", cursor: "pointer", transition: "background 0.1s", background: isOpen ? "#0b1220" : "transparent" }}
                    onMouseEnter={(e) => !isOpen && (e.currentTarget.style.background = "#0d1320")}
                    onMouseLeave={(e) => !isOpen && (e.currentTarget.style.background = "transparent")}
                  >
                    {/* Expand arrow */}
                    <div style={{ color: "#374151" }}>
                      {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </div>

                    {/* User Code */}
                    <div style={{ fontFamily: "monospace", fontSize: 11, color: "#60a5fa", fontWeight: 700, letterSpacing: "0.04em" }}>
                      {s.user_code}
                    </div>

                    {/* User */}
                    <div style={{ paddingRight: 10, minWidth: 0 }}>
                      {s.user ? (
                        <div>
                          <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.user}</div>
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: "#374151", fontStyle: "italic" }}>
                          {s.status === "POLLING" ? "Awaiting sign-in…" : "Not authenticated"}
                        </span>
                      )}
                    </div>

                    {/* App */}
                    <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>
                      {s.app}
                    </div>

                    {/* Status */}
                    <div>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}>
                        <meta.Icon size={10} />{meta.label}
                      </span>
                    </div>

                    {/* Generated At */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>{fmtShort(s.generated_at)}</span>
                      <span style={{ fontSize: 10, color: "#374151" }}>{fmtRel(s.generated_at)}</span>
                    </div>

                    {/* Authorized At */}
                    <div>
                      {s.authorized_at ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>{fmtShort(s.authorized_at)}</span>
                          <span style={{ fontSize: 10, color: "#374151" }}>{fmtRel(s.authorized_at)}</span>
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: "#1e2d3d", fontStyle: "italic" }}>
                          {s.status === "POLLING" ? "Awaiting…" : "Never"}
                        </span>
                      )}
                    </div>

                    {/* Token */}
                    <div>
                      {s.refresh_token_active === null ? (
                        <span style={{ fontSize: 10, color: "#374151", fontStyle: "italic" }}>No token</span>
                      ) : s.refresh_token_active ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: "#22c55e" }}>
                          <ShieldCheck size={11} /> Live
                        </span>
                      ) : (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: "#ef4444" }}>
                          <Ban size={11} /> Revoked
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expanded audit panel */}
                  {isOpen && <AuditDetail s={s} />}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
            <span style={{ fontSize: 12, color: "#475569" }}>
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length} records
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 7, border: "1px solid #1e2d3d", background: "transparent", color: page === 0 ? "#1e2d3d" : "#94a3b8", fontSize: 12, fontWeight: 600, cursor: page === 0 ? "not-allowed" : "pointer" }}>
                <ChevronLeft size={14} /> Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i)
                .filter((i) => i === 0 || i === totalPages - 1 || Math.abs(i - page) <= 1)
                .reduce<(number | "…")[]>((acc, i, idx, arr) => {
                  if (idx > 0 && (i as number) - (arr[idx - 1] as number) > 1) acc.push("…");
                  acc.push(i); return acc;
                }, [])
                .map((item, idx) =>
                  item === "…" ? (
                    <span key={`e-${idx}`} style={{ fontSize: 12, color: "#374151", padding: "0 4px" }}>…</span>
                  ) : (
                    <button key={item} onClick={() => setPage(item as number)}
                      style={{ width: 32, height: 32, borderRadius: 7, border: `1px solid ${item === page ? "#1e3a5f" : "#1e2d3d"}`, background: item === page ? "#0d1e35" : "transparent", color: item === page ? "#60a5fa" : "#94a3b8", fontSize: 12, fontWeight: item === page ? 700 : 400, cursor: "pointer" }}>
                      {(item as number) + 1}
                    </button>
                  )
                )}
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 7, border: "1px solid #1e2d3d", background: "transparent", color: page === totalPages - 1 ? "#1e2d3d" : "#94a3b8", fontSize: 12, fontWeight: 600, cursor: page === totalPages - 1 ? "not-allowed" : "pointer" }}>
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
