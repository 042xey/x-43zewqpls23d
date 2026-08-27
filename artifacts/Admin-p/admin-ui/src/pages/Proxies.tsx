import { useEffect, useState, useCallback } from "react";
import {
  Globe, Plus, Trash2, RefreshCw, Loader2, AlertTriangle,
  Clock, Upload, X, Wifi, WifiOff,
} from "lucide-react";
import { adminUrl, authFetch } from "@/lib/api";

interface Proxy {
  id: number;
  url: string;
  added_at: string;
  status?: "untested" | "reachable" | "unreachable";
  latency_ms?: number | null;
}

function parseHost(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + (u.port ? `:${u.port}` : "");
  } catch {
    return url;
  }
}

function parseProto(url: string): string {
  try { return new URL(url).protocol.replace(":", "").toUpperCase(); } catch { return "HTTP"; }
}

function parseAuth(url: string): string | null {
  try {
    const u = new URL(url);
    return u.username ? u.username : null;
  } catch { return null; }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function Proxies() {
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  function showToast(msg: string, type: "ok" | "err" = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(adminUrl("/proxies"));
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const j = (await res.json()) as { proxies: Proxy[] };
      setProxies(j.proxies.map((p) => ({ ...p, status: "untested" })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function testAll() {
    setTesting(true);
    try {
      const res = await authFetch(adminUrl("/proxies/test"), { method: "POST" });
      if (!res.ok) throw new Error("Test request failed");
      const j = (await res.json()) as { results: { id: number; reachable: boolean; latency_ms: number | null }[] };
      setProxies((prev) =>
        prev.map((p) => {
          const r = j.results.find((x) => x.id === p.id);
          if (!r) return p;
          return { ...p, status: r.reachable ? "reachable" : "unreachable", latency_ms: r.latency_ms };
        }),
      );
    } catch {
      showToast("Test failed — check server connection", "err");
    } finally {
      setTesting(false);
    }
  }

  async function addProxy() {
    setAddError("");
    const url = addUrl.trim();
    if (!url) return;
    if (!url.startsWith("http")) { setAddError("URL must start with http"); return; }
    setAdding(true);
    try {
      const res = await authFetch(adminUrl("/proxies/add"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const j = (await res.json()) as { id?: number; url?: string; added_at?: string; error?: string };
      if (!res.ok) { setAddError(j.error ?? "Failed to add"); return; }
      setProxies((prev) => [...prev, { id: j.id!, url: j.url!, added_at: j.added_at!, status: "untested" }]);
      setAddUrl("");
      showToast("Proxy added");
    } catch {
      setAddError("Network error");
    } finally {
      setAdding(false);
    }
  }

  async function deleteProxy(id: number) {
    setDeletingId(id);
    try {
      const res = await authFetch(adminUrl(`/proxies/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setProxies((prev) => prev.filter((p) => p.id !== id));
      showToast("Proxy removed");
    } catch {
      showToast("Failed to delete proxy", "err");
    } finally {
      setDeletingId(null);
    }
  }

  async function bulkImport() {
    const lines = bulkText
      .split(/[\n,]+/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith("http"));
    if (lines.length === 0) { showToast("No valid URLs found", "err"); return; }
    setBulkLoading(true);
    try {
      const current = proxies.map((p) => ({ url: p.url }));
      const merged = [...current, ...lines.map((url) => ({ url }))];
      const unique = Array.from(new Map(merged.map((x) => [x.url, x])).values());
      const res = await authFetch(adminUrl("/proxies"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxies: unique }),
      });
      if (!res.ok) throw new Error("Import failed");
      setBulkText("");
      setShowBulk(false);
      await load();
      showToast(`Imported ${lines.length} proxies`);
    } catch {
      showToast("Bulk import failed", "err");
    } finally {
      setBulkLoading(false);
    }
  }

  async function clearAll() {
    if (!confirm(`Remove all ${proxies.length} proxies? This cannot be undone.`)) return;
    try {
      await authFetch(adminUrl("/proxies"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxies: [] }),
      });
      setProxies([]);
      showToast("All proxies cleared");
    } catch {
      showToast("Failed to clear proxies", "err");
    }
  }

  const reachable = proxies.filter((p) => p.status === "reachable").length;
  const unreachable = proxies.filter((p) => p.status === "unreachable").length;
  const untested = proxies.filter((p) => p.status === "untested").length;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 32px 64px", position: "relative" }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 9999, padding: "10px 18px", borderRadius: 10, background: toast.type === "ok" ? "#052e16" : "#1a0a0a", border: `1px solid ${toast.type === "ok" ? "#166534" : "#3b1111"}`, color: toast.type === "ok" ? "#22c55e" : "#f87171", fontSize: 12, fontWeight: 600, boxShadow: "0 4px 24px #0008" }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Globe size={20} color="#3b82f6" />
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Proxy Manager</h1>
          </div>
          <p style={{ fontSize: 12, color: "#475569", margin: 0 }}>
            HTTP proxies used to route device code polling requests.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowBulk(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid #1e3a5f", background: "#0d1e35", color: "#60a5fa", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            <Upload size={13} /> Bulk Import
          </button>
          <button
            onClick={testAll}
            disabled={testing || proxies.length === 0}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid #1e2d3d", background: "#131924", color: proxies.length === 0 ? "#334155" : "#94a3b8", fontSize: 12, fontWeight: 600, cursor: proxies.length === 0 ? "not-allowed" : "pointer" }}
          >
            {testing ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Wifi size={13} />}
            Test All
          </button>
          <button onClick={load} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid #1e2d3d", background: "#131924", color: "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            <RefreshCw size={13} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
          </button>
        </div>
      </div>

      {/* Summary pills */}
      {!loading && proxies.length > 0 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { label: "Total", value: proxies.length, color: "#94a3b8" },
            { label: "Reachable", value: reachable, color: "#22c55e" },
            { label: "Unreachable", value: unreachable, color: "#ef4444" },
            { label: "Untested", value: untested, color: "#475569" },
          ].map((p) => (
            <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: "#0a0f1a", border: "1px solid #1e2535", fontSize: 11, fontWeight: 600, color: p.color }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.color, display: "inline-block" }} />
              {p.value} {p.label}
            </div>
          ))}
        </div>
      )}

      {/* Add proxy input */}
      <div style={{ background: "#0a0f1a", border: "1px solid #1e2535", borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", letterSpacing: "0.06em", marginBottom: 10 }}>ADD PROXY</div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <input
              type="text"
              value={addUrl}
              onChange={(e) => { setAddUrl(e.target.value); setAddError(""); }}
              onKeyDown={(e) => e.key === "Enter" && addProxy()}
              placeholder="http://user:pass@host:port"
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${addError ? "#3b1111" : "#1e2d3d"}`, background: "#0d1117", color: "#e2e8f0", fontSize: 12, outline: "none", boxSizing: "border-box", fontFamily: "monospace" }}
            />
            {addError && <div style={{ fontSize: 11, color: "#f87171", marginTop: 5 }}>{addError}</div>}
          </div>
          <button
            onClick={addProxy}
            disabled={adding || !addUrl.trim()}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 8, border: "none", background: !addUrl.trim() ? "#0d1e35" : "#1d4ed8", color: !addUrl.trim() ? "#334155" : "#fff", fontSize: 12, fontWeight: 600, cursor: !addUrl.trim() ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
          >
            {adding ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={13} />}
            Add Proxy
          </button>
        </div>
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", marginBottom: 16, background: "#1a0a0a", border: "1px solid #3b1111", borderRadius: 8, fontSize: 12, color: "#f87171" }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#475569", fontSize: 13, padding: "60px 0", justifyContent: "center" }}>
          <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Loading proxies…
        </div>
      ) : proxies.length === 0 ? (
        <div style={{ padding: "48px 20px", textAlign: "center", color: "#374151", fontSize: 13, background: "#0a0f1a", border: "1px dashed #1e2535", borderRadius: 10 }}>
          No proxies configured. Add one above or use Bulk Import.
        </div>
      ) : (
        <>
          <div style={{ background: "#0a0f1a", border: "1px solid #1e2535", borderRadius: 12, overflow: "hidden" }}>
            {/* Table header */}
            <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 90px 90px 120px 60px", padding: "10px 16px", borderBottom: "1px solid #1e2535", background: "#080c14" }}>
              {["#", "Proxy URL", "Protocol", "Auth", "Added", ""].map((h) => (
                <div key={h} style={{ fontSize: 10, fontWeight: 700, color: "#374151", letterSpacing: "0.06em" }}>{h.toUpperCase()}</div>
              ))}
            </div>

            {proxies.map((p, i) => {
              const statusColor = p.status === "reachable" ? "#22c55e" : p.status === "unreachable" ? "#ef4444" : "#374151";
              const StatusIcon = p.status === "reachable" ? Wifi : p.status === "unreachable" ? WifiOff : Clock;
              const auth = parseAuth(p.url);
              return (
                <div
                  key={p.id}
                  style={{ display: "grid", gridTemplateColumns: "44px 1fr 90px 90px 120px 60px", padding: "12px 16px", borderBottom: i < proxies.length - 1 ? "1px solid #0f1923" : "none", alignItems: "center", transition: "background 0.1s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#0d1320")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {/* Status indicator + number */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span title={p.status === "reachable" ? `${p.latency_ms}ms` : p.status ?? "untested"}>
                      <StatusIcon size={12} color={statusColor} aria-hidden="true" />
                    </span>
                    <span style={{ fontSize: 11, color: "#374151" }}>{i + 1}</span>
                  </div>

                  {/* URL */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingRight: 8, minWidth: 0 }}>
                    <span style={{ fontFamily: "monospace", fontSize: 12, color: "#60a5fa", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {parseHost(p.url)}
                    </span>
                    {p.status === "reachable" && p.latency_ms != null && (
                      <span style={{ fontSize: 10, color: "#22c55e" }}>{p.latency_ms}ms latency</span>
                    )}
                    {p.status === "unreachable" && (
                      <span style={{ fontSize: 10, color: "#ef4444" }}>Unreachable</span>
                    )}
                  </div>

                  {/* Protocol */}
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 6, background: "#0d1e35", border: "1px solid #1e3a5f", color: "#60a5fa" }}>
                      {parseProto(p.url)}
                    </span>
                  </div>

                  {/* Auth */}
                  <div style={{ fontSize: 11, color: auth ? "#a3e635" : "#374151", fontStyle: auth ? "normal" : "italic" }}>
                    {auth ? auth : "No auth"}
                  </div>

                  {/* Added */}
                  <div style={{ fontSize: 11, color: "#475569" }}>
                    {fmtDate(p.added_at)}
                  </div>

                  {/* Delete */}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => deleteProxy(p.id)}
                      disabled={deletingId === p.id}
                      style={{ display: "flex", alignItems: "center", padding: "5px 8px", borderRadius: 6, border: "1px solid #1e2d3d", background: "transparent", color: "#475569", cursor: "pointer", transition: "all 0.15s" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#3b1111"; (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#1e2d3d"; (e.currentTarget as HTMLButtonElement).style.color = "#475569"; }}
                      title="Remove proxy"
                    >
                      {deletingId === p.id ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {proxies.length > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <button onClick={clearAll} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid #3b1111", background: "transparent", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <Trash2 size={12} /> Clear All
              </button>
            </div>
          )}
        </>
      )}

      {/* Bulk import modal */}
      {showBulk && (
        <div style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#0d1117", border: "1px solid #1e2d3d", borderRadius: 14, padding: 28, width: 520, maxWidth: "90vw", boxShadow: "0 20px 60px #0008" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>Bulk Import Proxies</div>
              <button onClick={() => setShowBulk(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", display: "flex" }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: 12, color: "#475569", marginBottom: 14, margin: "0 0 14px" }}>
              Paste one proxy URL per line (or comma-separated). These will be <strong style={{ color: "#94a3b8" }}>merged</strong> with existing proxies.
            </p>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"http://user:pass@host:port\nhttp://host2:port\n…"}
              rows={8}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #1e2d3d", background: "#080c14", color: "#e2e8f0", fontSize: 12, outline: "none", resize: "vertical", fontFamily: "monospace", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
              <button onClick={() => setShowBulk(false)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #1e2d3d", background: "transparent", color: "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button
                onClick={bulkImport}
                disabled={bulkLoading || !bulkText.trim()}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8, border: "none", background: "#1d4ed8", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                {bulkLoading ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={13} />}
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
