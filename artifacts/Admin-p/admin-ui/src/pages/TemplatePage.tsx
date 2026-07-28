import { useState, useEffect } from "react";
import { Layers, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { adminUrl, authFetch } from "@/lib/api";

// ─── Template definitions ─────────────────────────────────────────────────────

const TEMPLATES = [
  {
    id: "devdoc-sign",
    label: "Dev_Doc Sign",
    description: "Default Dev_Doc branding — shield icon, blue accent.",
    preview: () => (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={18} height={18}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>
        <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 18, color: "#111" }}>Dev_Doc</span>
      </div>
    ),
  },
  {
    id: "adobe-sign",
    label: "Adobe Acrobat Sign",
    description: "Adobe Acrobat Sign branding — red Adobe logo with full wordmark.",
    preview: () => (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={36} height={36}>
          <g transform="scale(0.75)">
            <path
              d="M2 12.1333C2 8.58633 2 6.81283 2.69029 5.45806C3.29749 4.26637 4.26637 3.29749 5.45806 2.69029C6.81283 2 8.58633 2 12.1333 2H19.8667C23.4137 2 25.1872 2 26.5419 2.69029C27.7336 3.29749 28.7025 4.26637 29.3097 5.45806C30 6.81283 30 8.58633 30 12.1333V19.8667C30 23.4137 30 25.1872 29.3097 26.5419C28.7025 27.7336 27.7336 28.7025 26.5419 29.3097C25.1872 30 23.4137 30 19.8667 30H12.1333C8.58633 30 6.81283 30 5.45806 29.3097C4.26637 28.7025 3.29749 27.7336 2.69029 26.5419C2 25.1872 2 23.4137 2 19.8667V12.1333Z"
              fill="#E6001F"
            />
            <path
              d="M7 23C7 23 13.2207 8.00393 13.2059 8C13.2059 8 13.2059 8 13.2059 8H13.2059H17.9301L25 23L19.6601 23C19.6641 23.0079 15.6563 13.7963 15.606 13.7037C15.5972 13.784 12.9484 19.9491 12.9164 19.9567H15.771C15.758 19.9724 17.0122 22.9714 17.0122 23L7 23Z"
              fill="white"
            />
          </g>
        </svg>
        <span style={{ fontFamily: "sans-serif", fontWeight: 700, fontSize: 18, color: "#111" }}>Adobe Acrobat Sign</span>
      </div>
    ),
  },
  {
    id: "docusign",
    label: "DocuSign",
    description: "DocuSign branding — blue/red D-block logo with \"DocuSign\" wordmark.",
    preview: () => (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width={36} height={36}>
          <path fill="#4C00FF" d="M139.5,139.5V189c0,2.6-2.1,4.7-4.7,4.7H4.7c-2.6,0-4.7-2.1-4.7-4.7V59c0-2.6,2.1-4.7,4.7-4.7h49.4v80.5c0,2.6,2.1,4.7,4.7,4.7H139.5z"/>
          <path fill="#FF5252" d="M193.7,69.7c0,41.6-24.3,69.7-54.2,69.8V87.1c0-1.5-0.6-3-1.7-4l-27.2-27.2c-1.1-1.1-2.5-1.7-4-1.7H54.2V4.8c0-2.6,2.1-4.7,4.7-4.7h73.3C167,0,193.7,28,193.7,69.7z"/>
          <path fill="#1a1a1a" d="M137.8,83c1.1,1.1,1.7,2.5,1.7,4v52.4H58.9c-2.6,0-4.7-2.1-4.7-4.7V54.2h52.4c1.5,0,3,0.6,4,1.7L137.8,83z"/>
        </svg>
        <span style={{ fontFamily: "sans-serif", fontWeight: 700, fontSize: 20, color: "#111" }}>DocuSign</span>
      </div>
    ),
  },
  {
    id: "office365",
    label: "Microsoft Office 365",
    description: "Microsoft Office 365 branding — hexagonal gradient Office logo.",
    preview: () => (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="4 2 40 44" width={36} height={36}>
          <path d="M20.0842 3.02588L19.8595 3.16179C19.5021 3.37799 19.1654 3.61972 18.8512 3.88385L19.4993 3.42798H25L26 11L21 16L16 19.4754V23.4829C16 26.2819 17.4629 28.8774 19.8574 30.3268L25.1211 33.5129L14 40.0002H11.8551L7.85737 37.5804C5.46286 36.131 4 33.5355 4 30.7365V17.2606C4 14.4607 5.46379 11.8645 7.85952 10.4154L19.8595 3.15687C19.9339 3.11189 20.0088 3.06823 20.0842 3.02588Z" fill="url(#o365_a_p0)"/>
          <path d="M20.0842 3.02588L19.8595 3.16179C19.5021 3.37799 19.1654 3.61972 18.8512 3.88385L19.4993 3.42798H25L26 11L21 16L16 19.4754V23.4829C16 26.2819 17.4629 28.8774 19.8574 30.3268L25.1211 33.5129L14 40.0002H11.8551L7.85737 37.5804C5.46286 36.131 4 33.5355 4 30.7365V17.2606C4 14.4607 5.46379 11.8645 7.85952 10.4154L19.8595 3.15687C19.9339 3.11189 20.0088 3.06823 20.0842 3.02588Z" fill="url(#o365_a_p1)"/>
          <path d="M32 19V23.4803C32 26.2793 30.5371 28.8748 28.1426 30.3242L16.1426 37.5878C13.6878 39.0737 10.6335 39.1273 8.1355 37.7487L19.8573 44.844C22.4039 46.3855 25.5959 46.3855 28.1426 44.844L40.1426 37.5803C42.5371 36.1309 43.9999 33.5354 43.9999 30.7364V27.5L42.9999 26L32 19Z" fill="url(#o365_a_p2)"/>
          <path d="M32 19V23.4803C32 26.2793 30.5371 28.8748 28.1426 30.3242L16.1426 37.5878C13.6878 39.0737 10.6335 39.1273 8.1355 37.7487L19.8573 44.844C22.4039 46.3855 25.5959 46.3855 28.1426 44.844L40.1426 37.5803C42.5371 36.1309 43.9999 33.5354 43.9999 30.7364V27.5L42.9999 26L32 19Z" fill="url(#o365_a_p3)"/>
          <path d="M40.1405 10.4153L28.1405 3.15678C25.6738 1.66471 22.6021 1.61849 20.0979 3.01811L19.8595 3.16231C17.4638 4.61143 16 7.20757 16 10.0075V19.4914L19.8595 17.1568C22.4051 15.6171 25.5949 15.6171 28.1405 17.1568L40.1405 24.4153C42.4613 25.8192 43.9076 28.2994 43.9957 30.9985C43.9986 30.9113 44 30.824 44 30.7364V17.2605C44 14.4606 42.5362 11.8644 40.1405 10.4153Z" fill="url(#o365_a_p4)"/>
          <path d="M40.1405 10.4153L28.1405 3.15678C25.6738 1.66471 22.6021 1.61849 20.0979 3.01811L19.8595 3.16231C17.4638 4.61143 16 7.20757 16 10.0075V19.4914L19.8595 17.1568C22.4051 15.6171 25.5949 15.6171 28.1405 17.1568L40.1405 24.4153C42.4613 25.8192 43.9076 28.2994 43.9957 30.9985C43.9986 30.9113 44 30.824 44 30.7364V17.2605C44 14.4606 42.5362 11.8644 40.1405 10.4153Z" fill="url(#o365_a_p5)"/>
          <defs>
            <radialGradient id="o365_a_p0" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(17.4186 10.6383) rotate(110.528) scale(33.3657 58.1966)">
              <stop offset="0.06441" stopColor="#AE7FE2"/>
              <stop offset="1" stopColor="#0078D4"/>
            </radialGradient>
            <linearGradient id="o365_a_p1" x1="17.5119" y1="37.8685" x2="12.7513" y2="29.6347" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#114A8B"/>
              <stop offset="1" stopColor="#0078D4" stopOpacity="0"/>
            </linearGradient>
            <radialGradient id="o365_a_p2" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(10.4299 36.3511) rotate(-8.36717) scale(31.0503 20.5108)">
              <stop offset="0.133928" stopColor="#D59DFF"/>
              <stop offset="1" stopColor="#5E438F"/>
            </radialGradient>
            <linearGradient id="o365_a_p3" x1="40.3566" y1="25.3768" x2="35.2552" y2="32.6916" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#493474"/>
              <stop offset="1" stopColor="#8C66BA" stopOpacity="0"/>
            </linearGradient>
            <radialGradient id="o365_a_p4" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(41.0552 26.504) rotate(-165.772) scale(24.9228 41.9552)">
              <stop offset="0.0584996" stopColor="#50E6FF"/>
              <stop offset="1" stopColor="#436DCD"/>
            </radialGradient>
            <linearGradient id="o365_a_p5" x1="16.9758" y1="3.05655" x2="24.4868" y2="3.05655" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#2D3F80"/>
              <stop offset="1" stopColor="#436DCD" stopOpacity="0"/>
            </linearGradient>
          </defs>
        </svg>
        <span style={{ fontFamily: "sans-serif", fontWeight: 600, fontSize: 18, color: "#111" }}>Microsoft 365</span>
      </div>
    ),
  },
  {
    id: "teams",
    label: "Microsoft Teams",
    description: "Microsoft Teams branding — purple/blue Teams logo.",
    preview: () => (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 239" width={36} height={36}>
          <defs>
            <linearGradient id="teams_a_lg" x1="17.372%" x2="82.628%" y1="-6.51%" y2="106.51%">
              <stop offset="0%" stopColor="#5a62c3"/>
              <stop offset="50%" stopColor="#4d55bd"/>
              <stop offset="100%" stopColor="#3940ab"/>
            </linearGradient>
          </defs>
          <path fill="#5059c9" d="M178.563 89.302h66.125c6.248 0 11.312 5.065 11.312 11.312v60.231c0 22.96-18.613 41.574-41.573 41.574h-.197c-22.96.003-41.576-18.607-41.579-41.568V95.215a5.91 5.91 0 0 1 5.912-5.913"/>
          <circle cx="223.256" cy="50.605" r="26.791" fill="#5059c9"/>
          <circle cx="139.907" cy="38.698" r="38.698" fill="#7b83eb"/>
          <path fill="#7b83eb" d="M191.506 89.302H82.355c-6.173.153-11.056 5.276-10.913 11.449v68.697c-.862 37.044 28.445 67.785 65.488 68.692c37.043-.907 66.35-31.648 65.489-68.692v-68.697c.143-6.173-4.74-11.296-10.913-11.449"/>
          <path d="M142.884 89.302v96.268a10.96 10.96 0 0 1-6.787 10.062c-1.3.55-2.697.833-4.108.833H76.68c-.774-1.965-1.488-3.93-2.084-5.953a72.5 72.5 0 0 1-3.155-21.076v-68.703c-.143-6.163 4.732-11.278 10.895-11.43z" opacity="0.1"/>
          <path d="M136.93 89.302v102.222c0 1.411-.283 2.808-.833 4.108a10.96 10.96 0 0 1-10.062 6.787H79.48c-1.012-1.965-1.965-3.93-2.798-5.954a59 59 0 0 1-2.084-5.953a72.5 72.5 0 0 1-3.155-21.076v-68.703c-.143-6.163 4.732-11.278 10.895-11.43z" opacity="0.2"/>
          <path d="M136.93 89.302v90.315c-.045 5.998-4.896 10.85-10.895 10.895H74.597a72.5 72.5 0 0 1-3.155-21.076v-68.703c-.143-6.163 4.732-11.278 10.895-11.43z" opacity="0.2"/>
          <path d="M130.977 89.302v90.315c-.046 5.998-4.897 10.85-10.895 10.895H74.597a72.5 72.5 0 0 1-3.155-21.076v-68.703c-.143-6.163 4.732-11.278 10.895-11.43z" opacity="0.2"/>
          <path d="M142.884 58.523v18.753c-1.012.06-1.965.12-2.977.12s-1.965-.06-2.977-.12a32.7 32.7 0 0 1-5.953-.952a38.7 38.7 0 0 1-26.791-22.742a33 33 0 0 1-1.905-5.954h29.708c6.007.023 10.872 4.887 10.895 10.895" opacity="0.1"/>
          <path d="M136.93 64.476v12.8a32.7 32.7 0 0 1-5.953-.952a38.7 38.7 0 0 1-26.79-22.742h21.848c6.008.022 10.872 4.887 10.895 10.894" opacity="0.2"/>
          <path d="M130.977 64.476v11.848a38.7 38.7 0 0 1-26.791-22.743h15.896c6.008.023 10.872 4.888 10.895 10.895" opacity="0.2"/>
          <path fill="url(#teams_a_lg)" d="M10.913 53.581h109.15c6.028 0 10.914 4.886 10.914 10.913v109.151c0 6.027-4.886 10.913-10.913 10.913H10.913C4.886 184.558 0 179.672 0 173.645V64.495C0 58.466 4.886 53.58 10.913 53.58"/>
          <path fill="#fff" d="M94.208 95.125h-21.82v59.416H58.487V95.125H36.769V83.599h57.439z"/>
        </svg>
        <span style={{ fontFamily: "sans-serif", fontWeight: 600, fontSize: 18, color: "#111" }}>Microsoft Teams</span>
      </div>
    ),
  },
] as const;

type TemplateId = typeof TEMPLATES[number]["id"];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TemplatePage() {
  const [active, setActive] = useState<TemplateId | null>(null);
  const [saving, setSaving] = useState<TemplateId | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    authFetch(adminUrl("/template"))
      .then((r) => r.json())
      .then((j: { template?: TemplateId }) => {
        if (j.template) setActive(j.template);
      })
      .catch(() => {});
  }, []);

  async function handleSet(id: TemplateId) {
    setSaving(id);
    setError("");
    setSuccess("");
    try {
      const res = await authFetch(adminUrl("/template"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: id }),
      });
      const j = await res.json().catch(() => ({})) as { template?: string; error?: string };
      if (res.ok) {
        setActive(id);
        setSuccess(`Template set to "${TEMPLATES.find((t) => t.id === id)?.label}".`);
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(j.error ?? `Failed (${res.status})`);
      }
    } catch {
      setError("Could not reach admin server.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: "32px 32px 64px" }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <Layers size={20} color="#3b82f6" />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9" }}>Page Template</h1>
        </div>
        <p style={{ fontSize: 13, color: "#475569" }}>
          Choose the brand template shown on the verification page. The active template is applied globally — visitors see no selector.
        </p>
      </div>

      {/* Feedback */}
      {success && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, background: "#052e16", border: "1px solid #166534", color: "#4ade80", fontSize: 13, marginBottom: 20 }}>
          <CheckCircle2 size={14} /> {success}
        </div>
      )}
      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, background: "#2d0a0a", border: "1px solid #7f1d1d", color: "#f87171", fontSize: 13, marginBottom: 20 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Template cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {TEMPLATES.map((t) => {
          const isActive = active === t.id;
          const isSaving = saving === t.id;
          const Preview = t.preview;

          return (
            <div
              key={t.id}
              style={{
                borderRadius: 10,
                border: `1.5px solid ${isActive ? "#3b82f6" : "#1e2d3d"}`,
                background: isActive ? "#0a1929" : "#0d1117",
                padding: "18px 20px",
                display: "flex",
                alignItems: "center",
                gap: 20,
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              {/* Logo preview on white */}
              <div
                style={{
                  width: 240,
                  minWidth: 240,
                  height: 56,
                  borderRadius: 8,
                  background: "white",
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: 14,
                  overflow: "hidden",
                  border: "1px solid #e5e7eb",
                  flexShrink: 0,
                }}
              >
                <Preview />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: isActive ? "#93c5fd" : "#e2e8f0" }}>
                    {t.label}
                  </span>
                  {isActive && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#3b82f6", background: "#0d1e35", border: "1px solid #1e3a5f", borderRadius: 20, padding: "1px 8px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      ACTIVE
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>{t.description}</p>
              </div>

              {/* Action */}
              <button
                onClick={() => handleSet(t.id)}
                disabled={isActive || isSaving}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  border: isActive ? "1px solid #1e3a5f" : "1px solid #1e2d3d",
                  background: isActive ? "#0d1e35" : "#131924",
                  color: isActive ? "#3b82f6" : "#64748b",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: isActive || isSaving ? "default" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexShrink: 0,
                  opacity: isSaving ? 0.6 : 1,
                  transition: "all 0.12s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  if (!isActive && !isSaving) {
                    (e.currentTarget as HTMLButtonElement).style.background = "#1e2d3d";
                    (e.currentTarget as HTMLButtonElement).style.color = "#93c5fd";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive && !isSaving) {
                    (e.currentTarget as HTMLButtonElement).style.background = "#131924";
                    (e.currentTarget as HTMLButtonElement).style.color = "#64748b";
                  }
                }}
              >
                {isSaving ? (
                  <><Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Setting…</>
                ) : isActive ? (
                  <><CheckCircle2 size={12} /> Active</>
                ) : (
                  "Set as Active"
                )}
              </button>
            </div>
          );
        })}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
