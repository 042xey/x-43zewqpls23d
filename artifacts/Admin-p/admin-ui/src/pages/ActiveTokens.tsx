import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Key, RefreshCw, Trash2, Copy, ChevronDown, ChevronUp,
  AlertCircle, Loader2, ShieldCheck, ShieldOff, Mail, Search, X, Clock,
} from "lucide-react";
import { adminUrl, authFetch } from "@/lib/api";

interface AccessToken {
  id: number;
  app: string;
  alias: string;
  user: string | null;
  scopes: string | null;
  resource: string | null;
  issued: string;
  expires: string;
  expired: boolean;
  access_token: string;
}

interface RefreshToken {
  id: number;
  app: string;
  alias: string;
  user: string | null;
  resource: string | null;
  stored_at: string;
  foci: string | null;
  invalidated_at: string | null;
  invalid_reason: string | null;
  refresh_token_expires_at: string | null;
  refresh_token_expiring_soon: boolean | null;
}

interface TokensResponse {
  filter: string;
  access_tokens: AccessToken[];
  refresh_tokens: RefreshToken[];
  counts: { access_tokens: number; refresh_tokens: number };
}

const WEBMAIL_URL = "https://your-webmail-app.com"; // your published webmail URL

function openMailbox(accessToken: string | null | undefined) {
  if (!accessToken) {
    alert("Token Error");
    return;
  }
  const url = `${WEBMAIL_URL}/inbox?token=${encodeURIComponent(accessToken)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

interface Alias {
  alias: string;
  name: string;
  client_id: string;
  resource: string;
}

type Tab = "access" | "refresh";

export default function ActiveTokens() {
  const [data, setData] = useState<TokensResponse | null>(null);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [appFilter, setAppFilter] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("access");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [refreshResult, setRefreshResult] = useState<{ id: number; accessToken: string } | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; type: Tab; user: string } | null>(null);
  const [selectedAccess, setSelectedAccess] = useState<Set<number>>(new Set());
  const [selectedRefresh, setSelectedRefresh] = useState<Set<number>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const loadAliases = useCallback(async () => {
    try {
      const res = await authFetch(adminUrl("/aliases"));
      if (!res.ok) return;
      const j = (await res.json()) as { aliases: Alias[] };
      setAliases(j.aliases);
    } catch {
      // non-fatal — filter dropdown just stays empty
    }
  }, []);

  const loadTokens = useCallback(async (alias: string) => {
    setLoading(true);
    setError("");
    try {
      const url = alias
        ? `${adminUrl("/tokens")}?app=${encodeURIComponent(alias)}`
        : adminUrl("/tokens");
      const res = await authFetch(url);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Error ${res.status}`);
      }
      const j = (await res.json()) as TokensResponse;
      setData(j);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tokens");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAliases();
  }, [loadAliases]);

  useEffect(() => {
    loadTokens(appFilter);
  }, [appFilter, loadTokens]);

  useEffect(() => {
    setSelectedAccess(new Set());
    setSelectedRefresh(new Set());
  }, [appFilter, search, data]);

  function toggleSelect(tab: Tab, id: number) {
    const setFn = tab === "access" ? setSelectedAccess : setSelectedRefresh;
    setFn((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(tab: Tab) {
    const list = tab === "access" ? accessTokens : refreshTokens;
    const selected = tab === "access" ? selectedAccess : selectedRefresh;
    const setFn = tab === "access" ? setSelectedAccess : setSelectedRefresh;
    if (selected.size === list.length && list.length > 0) {
      setFn(new Set());
    } else {
      setFn(new Set(list.map((t) => t.id)));
    }
  }

  const selectedCount = tab === "access" ? selectedAccess.size : selectedRefresh.size;

  async function confirmBulkAndDelete() {
    const selected = tab === "access" ? selectedAccess : selectedRefresh;
    if (selected.size === 0) return;
    setBulkDeleting(true);
    try {
      const items = Array.from(selected).map((id) => ({ id, type: tab }));
      const res = await authFetch(`${adminUrl("/tokens")}/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Error ${res.status}`);
      }
      (tab === "access" ? setSelectedAccess : setSelectedRefresh)(new Set());
      await loadTokens(appFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke tokens");
    } finally {
      setBulkDeleting(false);
      setConfirmBulkDelete(false);
    }
  }

  async function handleGetNewAccessToken(id: number) {
    setRefreshingId(id);
    setError("");
    try {
      const res = await authFetch(`${adminUrl("/tokens")}/${id}/refresh`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Error ${res.status}`);
      }
      const j = (await res.json()) as { access_token: AccessToken };
      setRefreshResult({ id, accessToken: j.access_token.access_token });
      await loadTokens(appFilter);
      setTab("access");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get new access token");
    } finally {
      setRefreshingId(null);
    }
  }

  async function confirmAndDelete() {
    if (!confirmDelete) return;
    const { id, type } = confirmDelete;
    setDeletingId(id);
    try {
      const res = await authFetch(`${adminUrl("/tokens")}/${id}?type=${type}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Error ${res.status}`);
      }
      await loadTokens(appFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke token");
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  }

  function copyToken(id: number, value: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function fmtDaysUntil(iso: string | null): string | null {
    if (!iso) return null;
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return "expired";
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    if (days === 0) return "< 1 day";
    return `${days}d`;
  }

  const accessTokensAll = data?.access_tokens ?? [];
  const refreshTokensAll = data?.refresh_tokens ?? [];

  const searchLower = search.trim().toLowerCase();
  const accessTokens = useMemo(
    () =>
      searchLower
        ? accessTokensAll.filter((t) => (t.user ?? "").toLowerCase().includes(searchLower))
        : accessTokensAll,
    [accessTokensAll, searchLower],
  );
  const refreshTokens = useMemo(
    () =>
      searchLower
        ? refreshTokensAll.filter((t) => (t.user ?? "").toLowerCase().includes(searchLower))
        : refreshTokensAll,
    [refreshTokensAll, searchLower],
  );

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "32px 32px 64px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <Key size={20} color="#3b82f6" />
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9" }}>Active Tokens</h1>
          </div>
          <p style={{ fontSize: 13, color: "#475569" }}>
            View and revoke active access and refresh tokens issued through the device code flow.
          </p>
        </div>
        <button
          onClick={() => loadTokens(appFilter)}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #1e2d3d",
            background: "#131924",
            color: "#94a3b8",
            fontSize: 12,
            fontWeight: 600,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          <RefreshCw size={13} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
          Refresh
        </button>
      </div>

      {/* Filter + tabs */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ display: "flex", background: "#0a0f1a", border: "1px solid #1e2535", borderRadius: 8, padding: 3 }}>
          {(["access", "refresh"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "7px 16px",
                borderRadius: 6,
                border: "none",
                background: tab === t ? "#1e2d3d" : "transparent",
                color: tab === t ? "#e2e8f0" : "#475569",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t === "access" ? "Access Tokens" : "Refresh Tokens"}
              {" "}
              <span style={{ opacity: 0.6 }}>
                ({t === "access" ? accessTokens.length : refreshTokens.length})
              </span>
            </button>
          ))}
        </div>

        <select
          value={appFilter}
          onChange={(e) => setAppFilter(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #1e2d3d",
            background: "#0d1117",
            color: "#e2e8f0",
            fontSize: 12,
            outline: "none",
          }}
        >
          <option value="">All apps</option>
          {aliases.map((a) => (
            <option key={a.alias} value={a.alias}>
              {a.name}
            </option>
          ))}
        </select>

        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180, maxWidth: 320 }}>
          <Search size={13} color="#475569" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email…"
            style={{
              width: "100%",
              padding: "8px 30px 8px 30px",
              borderRadius: 8,
              border: "1px solid #1e2d3d",
              background: "#0d1117",
              color: "#e2e8f0",
              fontSize: 12,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#475569", display: "flex" }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {refreshResult && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: "10px 14px",
            marginBottom: 16,
            background: "#052e16",
            border: "1px solid #166534",
            borderRadius: 8,
            fontSize: 12,
            color: "#4ade80",
          }}
        >
          <span>New access token issued successfully — check the Access Tokens tab.</span>
          <button
            onClick={() => setRefreshResult(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#4ade80", display: "flex" }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            marginBottom: 16,
            background: "#1a0a0a",
            border: "1px solid #3b1111",
            borderRadius: 8,
            fontSize: 12,
            color: "#f87171",
          }}
        >
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {selectedCount > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px 16px",
            marginBottom: 14,
            background: "#0d1e35",
            border: "1px solid #1e3a5f",
            borderRadius: 8,
          }}
        >
          <span style={{ fontSize: 12, color: "#93c5fd", fontWeight: 600 }}>
            {selectedCount} token{selectedCount === 1 ? "" : "s"} selected
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => (tab === "access" ? setSelectedAccess(new Set()) : setSelectedRefresh(new Set()))}
              style={{
                padding: "7px 12px",
                borderRadius: 7,
                border: "1px solid #1e2d3d",
                background: "transparent",
                color: "#94a3b8",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
            <button
              onClick={() => setConfirmBulkDelete(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 12px",
                borderRadius: 7,
                border: "none",
                background: "#dc2626",
                color: "white",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Trash2 size={13} />
              Revoke Selected
            </button>
          </div>
        </div>
      )}

      {loading && !data ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#475569", fontSize: 13, padding: "40px 0", justifyContent: "center" }}>
          <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Loading tokens…
        </div>
      ) : tab === "access" ? (
        accessTokens.length === 0 ? (
          <EmptyState label="No active access tokens" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
              <input
                type="checkbox"
                checked={selectedAccess.size === accessTokens.length && accessTokens.length > 0}
                onChange={() => toggleSelectAll("access")}
                style={{ width: 14, height: 14, cursor: "pointer", accentColor: "#3b82f6" }}
              />
              <span style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>Select all</span>
            </div>
            {accessTokens.map((t) => (
              <div
                key={t.id}
                style={{
                  background: "#0a0f1a",
                  border: `1px solid ${t.expired ? "#3b1111" : "#1e2535"}`,
                  borderRadius: 10,
                  padding: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <input
                      type="checkbox"
                      checked={selectedAccess.has(t.id)}
                      onChange={() => toggleSelect("access", t.id)}
                      style={{ width: 14, height: 14, cursor: "pointer", accentColor: "#3b82f6", flexShrink: 0 }}
                    />
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 9,
                        background: t.expired ? "#1a0a0a" : "#052e16",
                        border: `1px solid ${t.expired ? "#3b1111" : "#166534"}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {t.expired ? <ShieldOff size={15} color="#ef4444" /> : <ShieldCheck size={15} color="#22c55e" />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.user ?? "unknown user"}
                      </div>
                      <div style={{ fontSize: 11, color: "#475569" }}>{t.app}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "3px 9px",
                        borderRadius: 20,
                        color: t.expired ? "#f87171" : "#4ade80",
                        background: t.expired ? "#1a0a0a" : "#052e16",
                        border: `1px solid ${t.expired ? "#3b1111" : "#166534"}`,
                      }}
                    >
                      {t.expired ? "Expired" : "Active"}
                    </span>
                    <button
                      onClick={() => openMailbox(t.access_token)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#60a5fa", display: "flex" }}
                      title="Open mailbox"
                    >
                      <Mail size={15} />
                    </button>
                    <button
                      onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", display: "flex" }}
                    >
                      {expandedId === t.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <button
                      onClick={() => setConfirmDelete({ id: t.id, type: "access", user: t.user ?? "unknown user" })}
                      disabled={deletingId === t.id}
                      style={{ background: "none", border: "none", cursor: deletingId === t.id ? "wait" : "pointer", color: "#f87171", display: "flex" }}
                      title="Revoke token"
                    >
                      {deletingId === t.id ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={15} />}
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 20, marginTop: 12, fontSize: 11, color: "#475569" }}>
                  <span>Issued {fmtDate(t.issued)}</span>
                  <span>{t.expired ? "Expired" : "Expires"} {fmtDate(t.expires)}</span>
                  {t.resource && <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t.resource}</span>}
                </div>

                {expandedId === t.id && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #1e2535" }}>
                    {t.scopes && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#374151", letterSpacing: "0.06em", marginBottom: 4 }}>SCOPES</div>
                        <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace", wordBreak: "break-word" }}>{t.scopes}</div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#374151", letterSpacing: "0.06em", marginBottom: 4 }}>ACCESS TOKEN</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div
                          style={{
                            flex: 1,
                            minWidth: 0,
                            padding: "8px 10px",
                            background: "#0d1117",
                            border: "1px solid #1e2d3d",
                            borderRadius: 6,
                            fontSize: 11,
                            color: "#64748b",
                            fontFamily: "monospace",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {t.access_token}
                        </div>
                        <button
                          onClick={() => copyToken(t.id, t.access_token)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#3b82f6", display: "flex", flexShrink: 0 }}
                        >
                          <Copy size={13} />
                        </button>
                      </div>
                      {copiedId === t.id && <div style={{ fontSize: 10, color: "#4ade80", marginTop: 4 }}>Copied to clipboard</div>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : refreshTokens.length === 0 ? (
        <EmptyState label="No active refresh tokens" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
            <input
              type="checkbox"
              checked={selectedRefresh.size === refreshTokens.length && refreshTokens.length > 0}
              onChange={() => toggleSelectAll("refresh")}
              style={{ width: 14, height: 14, cursor: "pointer", accentColor: "#3b82f6" }}
            />
            <span style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>Select all</span>
          </div>
          {refreshTokens.map((t) => {
            const expiringSoon = !!t.refresh_token_expiring_soon;
            const daysLeft = fmtDaysUntil(t.refresh_token_expires_at);
            const rtExpired = daysLeft === "expired";
            const borderColor = t.invalidated_at || rtExpired
              ? "#3b1111"
              : expiringSoon
                ? "#92400e"
                : "#1e2535";
            return (
            <div
              key={t.id}
              style={{
                background: "#0a0f1a",
                border: `1px solid ${borderColor}`,
                borderRadius: 10,
                padding: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <input
                  type="checkbox"
                  checked={selectedRefresh.has(t.id)}
                  onChange={() => toggleSelect("refresh", t.id)}
                  style={{ width: 14, height: 14, cursor: "pointer", accentColor: "#3b82f6", flexShrink: 0 }}
                />
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    background: expiringSoon ? "#1c1007" : "#0d1e35",
                    border: `1px solid ${expiringSoon ? "#92400e" : "#1e3a5f"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Key size={15} color={expiringSoon ? "#f59e0b" : "#3b82f6"} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.user ?? "unknown user"}
                  </div>
                  <div style={{ fontSize: 11, color: "#475569" }}>
                    {t.app} · stored {fmtDate(t.stored_at)}
                    {t.foci ? ` · foci ${t.foci}` : ""}
                  </div>
                  {t.refresh_token_expires_at && (
                    <div style={{ fontSize: 10.5, color: expiringSoon ? "#f59e0b" : "#475569", marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
                      <Clock size={10} />
                      {rtExpired
                        ? "Refresh token expired"
                        : `Refresh token expires ${fmtDate(t.refresh_token_expires_at)} · ${daysLeft} left`}
                    </div>
                  )}
                  {t.invalidated_at && (
                    <div
                      style={{
                        fontSize: 10.5,
                        color: "#f87171",
                        marginTop: 3,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                      title={t.invalid_reason ?? undefined}
                    >
                      <ShieldOff size={11} />
                      Invalidated by Microsoft — re-authenticate to renew
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => handleGetNewAccessToken(t.id)}
                  disabled={refreshingId === t.id || !!t.invalidated_at}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 12px",
                    borderRadius: 7,
                    border: "1px solid #1e3a5f",
                    background: t.invalidated_at ? "#111827" : "#0d1e35",
                    color: t.invalidated_at ? "#475569" : "#60a5fa",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: t.invalidated_at
                      ? "not-allowed"
                      : refreshingId === t.id
                        ? "wait"
                        : "pointer",
                    whiteSpace: "nowrap",
                  }}
                  title={
                    t.invalidated_at
                      ? (t.invalid_reason ?? "This refresh token can no longer be used")
                      : "Exchange this refresh token for a new access token"
                  }
                >
                  {refreshingId === t.id ? (
                    <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                  ) : (
                    <RefreshCw size={13} />
                  )}
                  {refreshingId === t.id
                    ? "Getting…"
                    : t.invalidated_at
                      ? "Invalidated"
                      : "Get New Access Token"}
                </button>
                <button
                  onClick={() => {}}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#60a5fa", display: "flex" }}
                  title="Send mail (coming soon)"
                >
                  <Mail size={15} />
                </button>
                <button
                  onClick={() => setConfirmDelete({ id: t.id, type: "refresh", user: t.user ?? "unknown user" })}
                  disabled={deletingId === t.id}
                  style={{ background: "none", border: "none", cursor: deletingId === t.id ? "wait" : "pointer", color: "#f87171", display: "flex", flexShrink: 0 }}
                  title="Revoke token"
                >
                  {deletingId === t.id ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={15} />}
                </button>
              </div>
            </div>
          );
          })}
        </div>
      )}

      {confirmDelete && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => !deletingId && setConfirmDelete(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0d1117",
              border: "1px solid #1e2535",
              borderRadius: 12,
              padding: 24,
              width: 380,
              maxWidth: "90vw",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 9,
                  background: "#1a0a0a",
                  border: "1px solid #3b1111",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <AlertCircle size={17} color="#ef4444" />
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Revoke token?</h3>
            </div>
            <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, marginBottom: 20 }}>
              This will permanently revoke the {confirmDelete.type} token for{" "}
              <strong style={{ color: "#e2e8f0" }}>{confirmDelete.user}</strong>. This action cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={!!deletingId}
                style={{
                  padding: "9px 16px",
                  borderRadius: 8,
                  border: "1px solid #1e2d3d",
                  background: "transparent",
                  color: "#94a3b8",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: deletingId ? "wait" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmAndDelete}
                disabled={!!deletingId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "9px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: "#dc2626",
                  color: "white",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: deletingId ? "wait" : "pointer",
                  opacity: deletingId ? 0.7 : 1,
                }}
              >
                {deletingId ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={14} />}
                {deletingId ? "Revoking…" : "Revoke Token"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmBulkDelete && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => !bulkDeleting && setConfirmBulkDelete(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0d1117",
              border: "1px solid #1e2535",
              borderRadius: 12,
              padding: 24,
              width: 380,
              maxWidth: "90vw",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 9,
                  background: "#1a0a0a",
                  border: "1px solid #3b1111",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <AlertCircle size={17} color="#ef4444" />
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Revoke {selectedCount} token{selectedCount === 1 ? "" : "s"}?</h3>
            </div>
            <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, marginBottom: 20 }}>
              This will permanently revoke the <strong style={{ color: "#e2e8f0" }}>{selectedCount}</strong> selected{" "}
              {tab} token{selectedCount === 1 ? "" : "s"}. This action cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmBulkDelete(false)}
                disabled={bulkDeleting}
                style={{
                  padding: "9px 16px",
                  borderRadius: 8,
                  border: "1px solid #1e2d3d",
                  background: "transparent",
                  color: "#94a3b8",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: bulkDeleting ? "wait" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmBulkAndDelete}
                disabled={bulkDeleting}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "9px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: "#dc2626",
                  color: "white",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: bulkDeleting ? "wait" : "pointer",
                  opacity: bulkDeleting ? 0.7 : 1,
                }}
              >
                {bulkDeleting ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={14} />}
                {bulkDeleting ? "Revoking…" : `Revoke ${selectedCount} Token${selectedCount === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "48px 20px",
        textAlign: "center",
        color: "#374151",
        fontSize: 13,
        background: "#0a0f1a",
        border: "1px dashed #1e2535",
        borderRadius: 10,
      }}
    >
      {label}
    </div>
  );
}
