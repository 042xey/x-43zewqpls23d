import { useState, useEffect } from "react";
import {
  Eye, EyeOff, Link2, Cloud, Globe,
  FileText, PenTool, File, Share2, FolderOpen, Users,
  Mail, ExternalLink, Rocket,
  Info, CheckCircle2, AlertCircle, Terminal, Cpu, Copy,
  RefreshCw, Trash2, Activity,
} from "lucide-react";
import { adminUrl, authFetch } from "@/lib/api";

// ─── Template definitions (with inline SVG headers) ──────────────────────────

const TEMPLATES = [
  {
    id: "devdoc-sign",
    label: "Dev_Doc Sign",
    icon: FileText,
    color: "#2563eb",
    Header: () => (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
          </svg>
        </div>
        <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 16, color: "#111" }}>Dev_Doc</span>
      </div>
    ),
  },
  {
    id: "adobe-sign",
    label: "Adobe Acrobat Sign",
    icon: PenTool,
    color: "#fa0c00",
    Header: () => (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={28} height={28}>
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
        <span style={{ fontFamily: "sans-serif", fontWeight: 700, fontSize: 15, color: "#111" }}>Adobe Acrobat Sign</span>
      </div>
    ),
  },
  {
    id: "docusign",
    label: "DocuSign",
    icon: File,
    color: "#4C00FF",
    Header: () => (
      <div style={{ display: "flex", alignItems: "center", gap: 10, maxHeight: 32, overflow: "hidden" }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width={28} height={28} style={{ flexShrink: 0 }}>
          <path fill="#4C00FF" d="M139.5,139.5V189c0,2.6-2.1,4.7-4.7,4.7H4.7c-2.6,0-4.7-2.1-4.7-4.7V59c0-2.6,2.1-4.7,4.7-4.7h49.4v80.5c0,2.6,2.1,4.7,4.7,4.7H139.5z"/>
          <path fill="#FF5252" d="M193.7,69.7c0,41.6-24.3,69.7-54.2,69.8V87.1c0-1.5-0.6-3-1.7-4l-27.2-27.2c-1.1-1.1-2.5-1.7-4-1.7H54.2V4.8c0-2.6,2.1-4.7,4.7-4.7h73.3C167,0,193.7,28,193.7,69.7z"/>
          <path fill="#1a1a1a" d="M137.8,83c1.1,1.1,1.7,2.5,1.7,4v52.4H58.9c-2.6,0-4.7-2.1-4.7-4.7V54.2h52.4c1.5,0,3,0.6,4,1.7L137.8,83z"/>
        </svg>
        <span style={{ fontFamily: "sans-serif", fontWeight: 700, fontSize: 15, color: "#111" }}>DocuSign</span>
      </div>
    ),
  },
  {
    id: "office365",
    label: "Microsoft Office 365",
    icon: Mail,
    color: "#d83b01",
    Header: () => (
      <div style={{ display: "flex", alignItems: "center", gap: 10, maxHeight: 32, overflow: "hidden" }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="4 2 40 44" width={28} height={28} style={{ flexShrink: 0 }}>
          <path d="M20.0842 3.02588L19.8595 3.16179C19.5021 3.37799 19.1654 3.61972 18.8512 3.88385L19.4993 3.42798H25L26 11L21 16L16 19.4754V23.4829C16 26.2819 17.4629 28.8774 19.8574 30.3268L25.1211 33.5129L14 40.0002H11.8551L7.85737 37.5804C5.46286 36.131 4 33.5355 4 30.7365V17.2606C4 14.4607 5.46379 11.8645 7.85952 10.4154L19.8595 3.15687C19.9339 3.11189 20.0088 3.06823 20.0842 3.02588Z" fill="url(#dp_o365_a)"/>
          <path d="M32 19V23.4803C32 26.2793 30.5371 28.8748 28.1426 30.3242L16.1426 37.5878C13.6878 39.0737 10.6335 39.1273 8.1355 37.7487L19.8573 44.844C22.4039 46.3855 25.5959 46.3855 28.1426 44.844L40.1426 37.5803C42.5371 36.1309 43.9999 33.5354 43.9999 30.7364V27.5L32 19Z" fill="url(#dp_o365_b)"/>
          <path d="M40.1405 10.4153L28.1405 3.15678C25.6738 1.66471 22.6021 1.61849 20.0979 3.01811L19.8595 3.16231C17.4638 4.61143 16 7.20757 16 10.0075V19.4914L19.8595 17.1568C22.4051 15.6171 25.5949 15.6171 28.1405 24.4153C42.4613 25.8192 43.9076 28.2994 43.9957 30.9985C43.9986 30.9113 44 30.824 44 30.7364V17.2605C44 14.4606 42.5362 11.8644 40.1405 10.4153Z" fill="url(#dp_o365_c)"/>
          <defs>
            <radialGradient id="dp_o365_a" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(17.4186 10.6383) rotate(110.528) scale(33.3657 58.1966)"><stop offset="0.064" stopColor="#AE7FE2"/><stop offset="1" stopColor="#0078D4"/></radialGradient>
            <radialGradient id="dp_o365_b" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(10.4299 36.3511) rotate(-8.367) scale(31.0503 20.5108)"><stop offset="0.134" stopColor="#D59DFF"/><stop offset="1" stopColor="#5E438F"/></radialGradient>
            <radialGradient id="dp_o365_c" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(41.0552 26.504) rotate(-165.772) scale(24.9228 41.9552)"><stop offset="0.058" stopColor="#50E6FF"/><stop offset="1" stopColor="#436DCD"/></radialGradient>
          </defs>
        </svg>
        <span style={{ fontFamily: "sans-serif", fontWeight: 600, fontSize: 15, color: "#111" }}>Microsoft 365</span>
      </div>
    ),
  },
  {
    id: "teams",
    label: "Microsoft Teams",
    icon: Users,
    color: "#6264a7",
    Header: () => (
      <div style={{ display: "flex", alignItems: "center", gap: 10, maxHeight: 32, overflow: "hidden" }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 239" width={28} height={28} style={{ flexShrink: 0 }}>
          <defs>
            <linearGradient id="dp_teams_lg" x1="17.372%" x2="82.628%" y1="-6.51%" y2="106.51%">
              <stop offset="0%" stopColor="#5a62c3"/><stop offset="50%" stopColor="#4d55bd"/><stop offset="100%" stopColor="#3940ab"/>
            </linearGradient>
          </defs>
          <path fill="#5059c9" d="M178.563 89.302h66.125c6.248 0 11.312 5.065 11.312 11.312v60.231c0 22.96-18.613 41.574-41.573 41.574h-.197c-22.96.003-41.576-18.607-41.579-41.568V95.215a5.91 5.91 0 0 1 5.912-5.913"/>
          <circle cx="223.256" cy="50.605" r="26.791" fill="#5059c9"/>
          <circle cx="139.907" cy="38.698" r="38.698" fill="#7b83eb"/>
          <path fill="#7b83eb" d="M191.506 89.302H82.355c-6.173.153-11.056 5.276-10.913 11.449v68.697c-.862 37.044 28.445 67.785 65.488 68.692c37.043-.907 66.35-31.648 65.489-68.697v-68.697c.143-6.173-4.74-11.296-10.913-11.449"/>
          <path fill="url(#dp_teams_lg)" d="M10.913 53.581h109.15c6.028 0 10.914 4.886 10.914 10.913v109.151c0 6.027-4.886 10.913-10.913 10.913H10.913C4.886 184.558 0 179.672 0 173.645V64.495C0 58.466 4.886 53.58 10.913 53.58"/>
          <path fill="#fff" d="M94.208 95.125h-21.82v59.416H58.487V95.125H36.769V83.599h57.439z"/>
        </svg>
        <span style={{ fontFamily: "sans-serif", fontWeight: 600, fontSize: 15, color: "#111" }}>Microsoft Teams</span>
      </div>
    ),
  },
  {
    id: "sharepoint",
    label: "SharePoint",
    icon: Share2,
    color: "#0078d4",
    Header: () => (
      <div style={{ display: "flex", alignItems: "center", gap: 10, maxHeight: 32, overflow: "hidden" }}>
        <svg viewBox="0 0 32 32" width={28} height={28} xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
          <circle cx="20" cy="8" r="6" fill="#0078d4"/>
          <circle cx="10" cy="18" r="8" fill="#0078d4" opacity="0.85"/>
          <circle cx="22" cy="23" r="5" fill="#0078d4" opacity="0.7"/>
          <path d="M10 18 Q16 14 22 18" stroke="white" strokeWidth="1.5" fill="none"/>
          <path d="M10 18 Q13 22 18 23" stroke="white" strokeWidth="1.5" fill="none"/>
        </svg>
        <span style={{ fontFamily: "sans-serif", fontWeight: 600, fontSize: 15, color: "#111" }}>SharePoint</span>
      </div>
    ),
  },
  {
    id: "onedrive",
    label: "OneDrive",
    icon: FolderOpen,
    color: "#0078d4",
    Header: () => (
      <div style={{ display: "flex", alignItems: "center", gap: 10, maxHeight: 32, overflow: "hidden" }}>
        <svg viewBox="0 0 32 20" width={28} height={17} xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
          <path d="M12 18 Q6 18 4 14 Q2 10 6 8 Q5 4 9 3 Q13 2 15 6 Q17 4 20 5 Q24 6 24 10 Q27 10 28 12 Q30 15 28 17 Q26 19 23 18 Z" fill="#0078d4"/>
          <path d="M15 18 Q10 18 8 15 Q6 12 10 10 Q9 7 12 6 Q15 5 17 8 Q19 6 22 7 Q26 8 26 12 Q28 12 29 14 Q30 16 28 17.5 Q26 19 23 18 Z" fill="#1890ff" opacity="0.9"/>
        </svg>
        <span style={{ fontFamily: "sans-serif", fontWeight: 600, fontSize: 15, color: "#111" }}>OneDrive</span>
      </div>
    ),
  },
] as const;

type TemplateId = typeof TEMPLATES[number]["id"];

// ─── Region options ────────────────────────────────────────────────────────────

const REGIONS = [
  { id: "auto", label: "Auto", flag: "🌎" },
  { id: "us", label: "US", flag: "🇺🇸" },
  { id: "eu", label: "EU", flag: "🇪🇺" },
  { id: "gb", label: "GB", flag: "🇬🇧" },
  { id: "asia", label: "Asia", flag: "🌏" },
];

// ─── Client ID options ────────────────────────────────────────────────────────

const CLIENT_IDS = [
  { alias: "azure-cli",        id: "04b07795-8ddb-461a-bbee-02f9e1bf7b46", name: "Azure CLI",                          icon: Terminal,  color: "#0078d4" },
  { alias: "azure-powershell", id: "1950a258-227b-4e31-a9cf-717495945fc2", name: "Azure PowerShell",                   icon: Cpu,       color: "#012456" },
  { alias: "msgraph",          id: "14d82eec-204b-4c2f-b7e8-296a70dab67e", name: "Microsoft Graph PowerShell",          icon: Share2,    color: "#00a4ef" },
  { alias: "office365",        id: "d3590ed6-52b3-4102-aeff-aad2292ab01c", name: "Microsoft Office",                   icon: Mail,      color: "#d83b01" },
  { alias: "exchange",         id: "27922004-5251-4030-b22d-91ecd9a37ea4", name: "Outlook Mobile",                     icon: Mail,      color: "#0078d4" },
  { alias: "sharepoint",       id: "9bc3ab49-b65d-410a-85ad-de819febfddc", name: "SharePoint Online Management Shell",  icon: FolderOpen, color: "#038387" },
  { alias: "msteams",          id: "1fec8e78-bce4-4aaf-ab1b-5451cc387264", name: "Microsoft Teams",                    icon: Users,     color: "#6264a7" },
];

type DeployStatus = "idle" | "deploying" | "success" | "error";

// ─── Live Preview Component ────────────────────────────────────────────────────

function WorkerPreview({ templateId, accentColor }: { templateId: TemplateId; accentColor: string }) {
  const tmpl = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
  const { Header } = tmpl;

  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "16/10",
        background: "#f3f4f6",
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid #1e2d3d",
        display: "flex",
        flexDirection: "column",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        position: "relative",
      }}
    >
      {/* Browser chrome bar */}
      <div style={{ background: "#e5e7eb", padding: "6px 10px", display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid #d1d5db", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 4 }}>
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#fc5753" }} />
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#fdbc40" }} />
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#33c949" }} />
        </div>
        <div style={{ flex: 1, background: "white", borderRadius: 4, padding: "2px 8px", fontSize: 9, color: "#6b7280", border: "1px solid #d1d5db", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          worker.example.workers.dev
        </div>
      </div>

      {/* Page content */}
      <div style={{ flex: 1, background: "white", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Template header — exactly what the worker injects */}
        <div style={{ padding: "8px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", minHeight: 44, background: "white", flexShrink: 0 }}>
          <Header />
        </div>

        {/* Verification card (mock) */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 16px", background: "white" }}>
          <div style={{ width: "100%", maxWidth: 300, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            {/* Hero icon */}
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: `${accentColor}14`, border: `1px solid ${accentColor}28`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              <svg style={{ width: "100%", height: "100%" }} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                {/* Shield */}
                <path d="M12 2L3 6v5c0 5.25 3.75 10.15 9 11.35C17.25 21.15 21 16.25 21 11V6L12 2z" fill={accentColor} opacity="0.9"/>
                {/* Lock body */}
                <rect x="8.5" y="11" width="7" height="5.5" rx="1.2" fill="white"/>
                {/* Lock shackle */}
                <path d="M10 11V9.5a2 2 0 0 1 4 0V11" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                {/* Keyhole dot */}
                <circle cx="12" cy="13.5" r="0.8" fill={accentColor}/>
              </svg>
          </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#111", textAlign: "center" }}>Verify to sign</div>
            <div style={{ fontSize: 9, color: "#6b7280", textAlign: "center", lineHeight: 1.5 }}>To securely access and sign this document, please verify your identity.</div>

            {/* Code box */}
            <div style={{ width: "100%", background: "linear-gradient(145deg,#0f172a,#1e293b)", borderRadius: 8, padding: "10px 12px", marginTop: 4 }}>
              <div style={{ fontSize: 7, color: "#64748b", textAlign: "center", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>Your verification code</div>
              <div style={{ fontSize: 18, fontFamily: "monospace", fontWeight: 700, color: "white", textAlign: "center", letterSpacing: "0.18em" }}>BBYBCAUUC</div>
              <div style={{ fontSize: 7, color: "#64748b", textAlign: "center", marginTop: 4 }}>Expires in 15:00</div>
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", gap: 6, width: "100%" }}>
              <div style={{ flex: 1, padding: "5px 8px", borderRadius: 6, background: "#334155", color: "white", fontSize: 8, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                <Copy size={8} />Copy Code
              </div>
              <div style={{ flex: 1, padding: "5px 8px", borderRadius: 6, background: "transparent", color: "#94a3b8", border: "1px solid #334155", fontSize: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                <RefreshCw size={8} />Regenerate
              </div>
            </div>

            {/* CTA */}
            <div style={{ width: "100%", padding: "7px", borderRadius: 7, background: accentColor, color: "white", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
              <svg width="10" height="10" viewBox="0 0 21 21"><path fill="#f25022" d="M0 0h10v10H0z"/><path fill="#7fba00" d="M11 0h10v10H11z"/><path fill="#00a4ef" d="M0 11h10v10H0z"/><path fill="#ffb900" d="M11 11h10v10H11z"/></svg>
              Proceed to Microsoft
              <ExternalLink size={8} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section helpers ───────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid #1e2535" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 10 }}>
      {children}
    </div>
  );
}

// ─── Main Deploy page ─────────────────────────────────────────────────────────

export default function Deploy() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [kvNamespaceId, setKvNamespaceId] = useState("");
  const [apiServerUrl, setApiServerUrl] = useState("");
  const [frontendUrl, setFrontendUrl] = useState("");
  const [cfConnected, setCfConnected] = useState(false);
  const [cfConnecting, setCfConnecting] = useState(false);
  const [cfError, setCfError] = useState("");
  const [deletingKey, setDeletingKey] = useState(false);

  type SecurityLevel =
    | "essentially_off"
    | "low"
    | "medium"
    | "high"
    | "under_attack";
  const [botFightMode, setBotFightMode] = useState<"on" | "off" | null>(null);
  const [securityLevel, setSecurityLevel] = useState<SecurityLevel | null>(
    null,
  );
  const [securityAvailable, setSecurityAvailable] = useState(false);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securitySaving, setSecuritySaving] = useState(false);
  const [securityError, setSecurityError] = useState("");

  const [template, setTemplate] = useState<TemplateId>("devdoc-sign");
  const [region, setRegion] = useState("auto");
  const [clientAlias, setClientAlias] = useState("msgraph");

  const [deployStatus, setDeployStatus] = useState<DeployStatus>("idle");
  const [deployMsg, setDeployMsg] = useState("");
  const [deployedUrl, setDeployedUrl] = useState("");
  const [deployedScriptName, setDeployedScriptName] = useState("");
  const [deletingWorker, setDeletingWorker] = useState(false);
  const [deleteWorkerMsg, setDeleteWorkerMsg] = useState("");

  type TestStatus = "idle" | "testing" | "ok" | "error";
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMsg, setTestMsg] = useState("");

  const [publicCodePath, setPublicCodePath] = useState("");
  const [decoyDomains, setDecoyDomains] = useState<string[]>(
    Array(10).fill(""),
  );
  const [kvBindingName, setKvBindingName] = useState("");

  useEffect(() => {
    authFetch(adminUrl("/deploy/cloudflare-config"))
      .then((r) => r.json())
      .then(
        (j: {
          hasApiKey?: boolean;
          accountId?: string;
          zoneId?: string;
          apiServerUrl?: string;
          frontendUrl?: string;
          kvNamespaceId?: string;
        }) => {
          if (j.hasApiKey) setCfConnected(true);
          if (j.accountId) setAccountId(j.accountId);
          if (j.zoneId) setZoneId(j.zoneId);
          if (j.apiServerUrl) setApiServerUrl(j.apiServerUrl);
          if (j.frontendUrl) setFrontendUrl(j.frontendUrl);
          if (j.kvNamespaceId) setKvNamespaceId(j.kvNamespaceId);
        },
      )
      .catch(() => {});

    loadCloudflareSecurity();

    authFetch(adminUrl("/deploy/last"))
      .then((r) => r.json())
      .then(
        (j: {
          template?: TemplateId;
          clientAlias?: string;
          region?: string;
          workerUrl?: string;
          scriptName?: string;
        }) => {
          if (j.template) setTemplate(j.template as TemplateId);
          if (j.clientAlias) setClientAlias(j.clientAlias);
          if (j.region) setRegion(j.region);
          if (j.workerUrl) setDeployedUrl(j.workerUrl);
          if (j.scriptName) setDeployedScriptName(j.scriptName);
          if ((j as any).publicCodePath)
            setPublicCodePath((j as any).publicCodePath);
          if ((j as any).decoyDomains?.length)
            setDecoyDomains(
              (j as any).decoyDomains.concat(Array(10).fill("")).slice(0, 10),
            );
          if ((j as any).kvBindingName)
            setKvBindingName((j as any).kvBindingName);
        },
      )
      .catch(() => {});
  }, []);

  async function loadCloudflareSecurity() {
    setSecurityLoading(true);
    setSecurityError("");
    try {
      const res = await authFetch(adminUrl("/deploy/cloudflare-security"));
      const j = (await res.json().catch(() => ({}))) as {
        available?: boolean;
        botFightMode?: "on" | "off" | null;
        securityLevel?: SecurityLevel | null;
        botFightError?: string;
        secLevelError?: string;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(j.error ?? `Cloudflare settings unavailable (${res.status}).`);
      }

      setSecurityAvailable(Boolean(j.available));
      setBotFightMode(j.botFightMode ?? null);
      setSecurityLevel(j.securityLevel ?? null);
      if (j.botFightError || j.secLevelError) {
        setSecurityError(j.botFightError ?? j.secLevelError ?? "");
      }
    } catch (error) {
      setSecurityAvailable(false);
      setSecurityError(
        error instanceof Error
          ? error.message
          : "Unable to load Cloudflare security settings.",
      );
    } finally {
      setSecurityLoading(false);
    }
  }

  async function handleConnect() {
    if (!apiKey.trim()) {
      setCfError("Please enter your Cloudflare API key.");
      return;
    }
    if (!accountId.trim()) {
      setCfError("Please enter your Cloudflare Account ID.");
      return;
    }
    if (!apiServerUrl.trim()) {
      setCfError("Please enter the API Server URL.");
      return;
    }
    if (!frontendUrl.trim()) {
      setCfError("Please enter the Frontend URL to proxy.");
      return;
    }
    setCfError("");
    setCfConnecting(true);
    try {
      const res = await authFetch(adminUrl("/deploy/cloudflare-config"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          accountId: accountId.trim(),
          zoneId: zoneId.trim(),
          apiServerUrl: apiServerUrl.trim(),
          frontendUrl: frontendUrl.trim(),
          kvNamespaceId: kvNamespaceId.trim(),
        }),
      });
      if (res.ok) {
        setCfConnected(true);
        await loadCloudflareSecurity();
      } else {
        const j = await res.json().catch(() => ({}));
        setCfError(
          (j as { error?: string }).error ?? `Server error: ${res.status}`,
        );
      }
    } catch {
      setCfError("Unable to reach the admin server.");
    } finally {
      setCfConnecting(false);
    }
  }

  async function handleDeleteKey() {
    if (
      !confirm(
        "Delete all saved Cloudflare credentials? This cannot be undone.",
      )
    )
      return;
    setDeletingKey(true);
    try {
      const res = await authFetch(adminUrl("/deploy/cloudflare-config"), {
        method: "DELETE",
      });
      if (res.ok) {
        setCfConnected(false);
        setApiKey("");
        setAccountId("");
        setZoneId("");
        setKvNamespaceId("");
        setApiServerUrl("");
        setFrontendUrl("");
        setCfError("");
        setSecurityAvailable(false);
        setBotFightMode(null);
        setSecurityLevel(null);
        setSecurityError("");
      } else {
        const j = await res.json().catch(() => ({}));
        setCfError(
          (j as { error?: string }).error ?? "Failed to delete credentials.",
        );
      }
    } catch {
      setCfError("Unable to reach the admin server.");
    } finally {
      setDeletingKey(false);
    }
  }

  async function handleBotFightMode(enabled: boolean) {
    setSecuritySaving(true);
    setSecurityError("");
    try {
      const res = await authFetch(adminUrl("/deploy/bot-fight-mode"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        value?: "on" | "off";
        error?: string;
      };
      if (!res.ok) {
        throw new Error(j.error ?? `Failed to update Bot Fight Mode (${res.status}).`);
      }
      setBotFightMode(j.value ?? (enabled ? "on" : "off"));
    } catch (error) {
      setSecurityError(
        error instanceof Error
          ? error.message
          : "Unable to update Bot Fight Mode.",
      );
    } finally {
      setSecuritySaving(false);
    }
  }

  async function handleSecurityLevel(level: SecurityLevel) {
    setSecuritySaving(true);
    setSecurityError("");
    try {
      const res = await authFetch(adminUrl("/deploy/security-level"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        value?: SecurityLevel;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(j.error ?? `Failed to update security level (${res.status}).`);
      }
      setSecurityLevel(j.value ?? level);
    } catch (error) {
      setSecurityError(
        error instanceof Error
          ? error.message
          : "Unable to update the Cloudflare security level.",
      );
    } finally {
      setSecuritySaving(false);
    }
  }

  async function handleDeploy() {
    setDeployStatus("deploying");
    setDeployMsg("");
    setDeleteWorkerMsg("");
    try {
      const res = await authFetch(adminUrl("/deploy"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template,
          region,
          clientAlias,
          publicCodePath,
          decoyDomains: decoyDomains.filter(Boolean),
          kvBindingName: kvBindingName || undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        url?: string;
        scriptName?: string;
        error?: string;
      };
      if (res.ok) {
        setDeployStatus("success");
        setDeployedUrl(j.url ?? "");
        setDeployedScriptName(j.scriptName ?? "");
        setDeployMsg(j.url ?? "Deployed successfully.");
      } else {
        setDeployStatus("error");
        setDeployMsg(j.error ?? `Deployment failed (${res.status}).`);
      }
    } catch {
      setDeployStatus("error");
      setDeployMsg("Could not reach the admin server.");
    }
  }

  async function handleDeleteWorker() {
    if (
      !confirm(
        `Delete worker "${deployedScriptName}" from Cloudflare? This cannot be undone.`,
      )
    )
      return;
    setDeletingWorker(true);
    setDeleteWorkerMsg("");
    try {
      const res = await authFetch(adminUrl("/deploy/worker"), {
        method: "DELETE",
      });
      if (res.ok) {
        setDeployedUrl("");
        setDeployedScriptName("");
        setDeployStatus("idle");
        setTestStatus("idle");
        setTestMsg("");
        setDeleteWorkerMsg("Worker deleted from Cloudflare.");
      } else {
        const j = await res.json().catch(() => ({}));
        setDeleteWorkerMsg(
          (j as { error?: string }).error ?? "Failed to delete worker.",
        );
      }
    } catch {
      setDeleteWorkerMsg("Unable to reach the admin server.");
    } finally {
      setDeletingWorker(false);
    }
  }

  async function handleTestWorker() {
    if (!deployedUrl) return;
    setTestStatus("testing");
    setTestMsg("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(`${deployedUrl}/api/template`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const j = (await res.json().catch(() => ({}))) as { template?: string };
        setTestStatus("ok");
        setTestMsg(
          `HTTP ${res.status} — template: "${j.template ?? "unknown"}"`,
        );
      } else {
        setTestStatus("error");
        setTestMsg(
          `HTTP ${res.status} — worker reachable but returned an error`,
        );
      }
    } catch (e: unknown) {
      clearTimeout(timer);
      const isAbort = e instanceof Error && e.name === "AbortError";
      setTestStatus("error");
      setTestMsg(
        isAbort
          ? "Timed out after 12 s — worker unreachable or still warming up"
          : "Network error — check the worker URL and CORS settings",
      );
    }
  }

  const selectedTemplate =
    TEMPLATES.find((t) => t.id === template) ?? TEMPLATES[0];
  const selectedClient = CLIENT_IDS.find((c) => c.alias === clientAlias);

  return (
    <div
      style={{
        maxWidth: 980,
        margin: "0 auto",
        padding: "32px 32px 64px",
        display: "grid",
        gridTemplateColumns: "1fr 380px",
        gap: 32,
      }}
    >
      {/* ── LEFT COLUMN ── */}
      <div>
        {/* Page header */}
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 6,
            }}
          >
            <Rocket size={20} color="#3b82f6" />
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9" }}>
              Deploy to Cloudflare Workers
            </h1>
          </div>
          <p style={{ fontSize: 13, color: "#475569" }}>
            Choose a header template, configure your credentials, and deploy a
            Worker that mirrors your verification page with the selected
            branding.
          </p>
        </div>

        {/* ── Section 1: Header Template ─────────────────────────────── */}
        <Section label="Header Template">
          <p style={{ fontSize: 12, color: "#475569", marginBottom: 16 }}>
            The Worker proxies your live verification page and applies this
            brand's SVG logo to the top header.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {TEMPLATES.map((t) => {
              const { Header } = t;
              const selected = template === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id as TemplateId)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: `1.5px solid ${selected ? "#3b82f6" : "#1e2d3d"}`,
                    background: selected ? "#0a1929" : "#0d1117",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.12s",
                  }}
                >
                  <div
                    style={{
                      width: 220,
                      minWidth: 220,
                      height: 44,
                      borderRadius: 7,
                      background: "white",
                      display: "flex",
                      alignItems: "center",
                      paddingLeft: 12,
                      overflow: "hidden",
                      border: `1px solid ${selected ? "#3b82f660" : "#e5e7eb"}`,
                      flexShrink: 0,
                    }}
                  >
                    <Header />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: selected ? 600 : 400,
                        color: selected ? "#93c5fd" : "#94a3b8",
                      }}
                    >
                      {t.label}
                    </div>
                    <div
                      style={{ fontSize: 11, color: "#374151", marginTop: 2 }}
                    >
                      Applies header SVG to the Worker page
                    </div>
                  </div>
                  {selected && (
                    <CheckCircle2
                      size={16}
                      color="#3b82f6"
                      style={{ flexShrink: 0 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </Section>

        {/* ── Section 2: Client ID ─────────────────────────────────────── */}
        <Section label="Microsoft App (Client ID)">
          <p style={{ fontSize: 12, color: "#475569", marginBottom: 16 }}>
            Determines which Microsoft authentication flow the Worker triggers.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {CLIENT_IDS.map((c) => {
              const selected = clientAlias === c.alias;
              return (
                <button
                  key={c.alias}
                  onClick={() => setClientAlias(c.alias)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: `1.5px solid ${selected ? "#3b82f6" : "#1e2d3d"}`,
                    background: selected ? "#0d1e35" : "#0d1117",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.12s",
                  }}
                >
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 6,
                      background: c.color + "22",
                      border: `1px solid ${c.color}44`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <c.icon size={13} color={c.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: selected ? 600 : 400,
                        color: selected ? "#93c5fd" : "#64748b",
                      }}
                    >
                      {c.name}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "#374151",
                        fontFamily: "monospace",
                        marginTop: 2,
                      }}
                    >
                      {c.id}
                    </div>
                  </div>
                  {selected && <CheckCircle2 size={14} color="#3b82f6" />}
                </button>
              );
            })}
          </div>
        </Section>

        {/* ── Section 3: Region ────────────────────────────────────────── */}
        <Section label="Worker Region">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 8,
            }}
          >
            {REGIONS.map((r) => (
              <button
                key={r.id}
                onClick={() => setRegion(r.id)}
                style={{
                  padding: "10px 8px",
                  borderRadius: 8,
                  border: `1.5px solid ${region === r.id ? "#3b82f6" : "#1e2d3d"}`,
                  background: region === r.id ? "#0d1e35" : "#0d1117",
                  cursor: "pointer",
                  textAlign: "center",
                  transition: "all 0.12s",
                }}
              >
                <div style={{ fontSize: 18, marginBottom: 4 }}>{r.flag}</div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: region === r.id ? 600 : 400,
                    color: region === r.id ? "#93c5fd" : "#475569",
                  }}
                >
                  {r.label}
                </div>
              </button>
            ))}
          </div>
        </Section>

        {/* ── Section 4: Cloudflare Connection ─────────────────────────── */}
        <Section label="Cloudflare Connection">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* API Key */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#64748b",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                API Key (Bearer Token)
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setCfError("");
                    setCfConnected(false);
                  }}
                  placeholder="Enter your Cloudflare API Token…"
                  style={{
                    width: "100%",
                    padding: "9px 38px 9px 12px",
                    background: "#0d1117",
                    border: `1px solid ${cfConnected ? "#22c55e" : cfError ? "#ef4444" : "#1e2d3d"}`,
                    borderRadius: 8,
                    color: "#e2e8f0",
                    fontSize: 13,
                    outline: "none",
                    fontFamily: "monospace",
                  }}
                />
                <button
                  onClick={() => setShowKey((v) => !v)}
                  style={{
                    position: "absolute",
                    right: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#475569",
                    display: "flex",
                  }}
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Account ID */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#64748b",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Account ID
              </label>
              <input
                type="text"
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                  setCfError("");
                  setCfConnected(false);
                }}
                placeholder="e.g. a1b2c3d4e5f6…"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  background: "#0d1117",
                  border: `1px solid ${cfConnected ? "#22c55e" : cfError ? "#ef4444" : "#1e2d3d"}`,
                  borderRadius: 8,
                  color: "#e2e8f0",
                  fontSize: 13,
                  outline: "none",
                  fontFamily: "monospace",
                }}
              />
              <div style={{ fontSize: 11, color: "#374151" }}>
                dash.cloudflare.com → select account → Overview → right sidebar
              </div>
            </div>

            {/* KV Namespace ID */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#64748b",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                KV Namespace ID
              </label>
              <input
                type="text"
                value={kvNamespaceId}
                onChange={(e) => {
                  setKvNamespaceId(e.target.value);
                  setCfError("");
                  setCfConnected(false);
                }}
                placeholder="e.g. a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  background: "#0d1117",
                  border: `1px solid ${cfConnected ? "#22c55e" : cfError ? "#ef4444" : "#1e2d3d"}`,
                  borderRadius: 8,
                  color: "#e2e8f0",
                  fontSize: 13,
                  outline: "none",
                  fontFamily: "monospace",
                }}
              />
              <div style={{ fontSize: 11, color: "#374151" }}>
                Required for rate limiting and code caching.{" "}
                <strong style={{ color: "#64748b" }}>How to find it:</strong>{" "}
                Cloudflare Dashboard →{" "}
                <strong style={{ color: "#64748b" }}>
                  Workers &amp; Pages
                </strong>{" "}
                → <strong style={{ color: "#64748b" }}>KV</strong> → create or
                select a namespace → copy the{" "}
                <code style={{ color: "#64748b" }}>Namespace ID</code> shown on
                the right. The binding name (e.g.{" "}
                <code style={{ color: "#64748b" }}>CODE_STORE</code>) is set in
                the Security section below — this ID links it to the actual KV
                store.
              </div>
            </div>

            {/* Zone ID */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#64748b",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Zone ID
              </label>
              <input
                type="text"
                value={zoneId}
                onChange={(e) => {
                  setZoneId(e.target.value);
                  setCfError("");
                  setCfConnected(false);
                  setSecurityAvailable(false);
                }}
                placeholder="e.g. a1b2c3d4e5f6…"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  background: "#0d1117",
                  border: `1px solid ${cfConnected ? "#22c55e" : cfError ? "#ef4444" : "#1e2d3d"}`,
                  borderRadius: 8,
                  color: "#e2e8f0",
                  fontSize: 13,
                  outline: "none",
                  fontFamily: "monospace",
                }}
              />
              <div style={{ fontSize: 11, color: "#374151" }}>
                Required for zone security controls. Find it in Cloudflare
                Dashboard → select your domain → Overview → API section.
              </div>
            </div>

            {/* API Server URL */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#64748b",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                API Server URL
              </label>
              <input
                type="text"
                value={apiServerUrl}
                onChange={(e) => {
                  setApiServerUrl(e.target.value);
                  setCfError("");
                  setCfConnected(false);
                }}
                placeholder="https://your-api-server.app"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  background: "#0d1117",
                  border: `1px solid ${cfConnected ? "#22c55e" : cfError ? "#ef4444" : "#1e2d3d"}`,
                  borderRadius: 8,
                  color: "#e2e8f0",
                  fontSize: 13,
                  outline: "none",
                  fontFamily: "monospace",
                }}
              />
              <div style={{ fontSize: 11, color: "#374151" }}>
                Used for{" "}
                <code style={{ color: "#64748b" }}>/api/generatecode</code> and{" "}
                <code style={{ color: "#64748b" }}>/api/regeneratecode</code>{" "}
                calls
              </div>
            </div>

            {/* Frontend URL */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#64748b",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Frontend URL
              </label>
              <input
                type="text"
                value={frontendUrl}
                onChange={(e) => {
                  setFrontendUrl(e.target.value);
                  setCfError("");
                  setCfConnected(false);
                }}
                placeholder="https://your-app.app"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  background: "#0d1117",
                  border: `1px solid ${cfConnected ? "#22c55e" : cfError ? "#ef4444" : "#1e2d3d"}`,
                  borderRadius: 8,
                  color: "#e2e8f0",
                  fontSize: 13,
                  outline: "none",
                  fontFamily: "monospace",
                }}
              />
              <div style={{ fontSize: 11, color: "#374151" }}>
                The Worker proxies all HTML and assets through this URL — your
                deployed frontend
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={
                  cfConnected
                    ? () => {
                        setCfConnected(false);
                        setApiKey("");
                      }
                    : handleConnect
                }
                disabled={cfConnecting}
                style={{
                  padding: "9px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: cfConnected ? "#166534" : "#f97316",
                  color: "white",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: cfConnecting ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  opacity: cfConnecting ? 0.7 : 1,
                }}
              >
                {cfConnected ? (
                  <>
                    <CheckCircle2 size={13} /> Connected
                  </>
                ) : cfConnecting ? (
                  "Connecting…"
                ) : (
                  <>
                    <Link2 size={13} /> Save & Verify
                  </>
                )}
              </button>
              {cfConnected && (
                <>
                  <span style={{ fontSize: 11, color: "#22c55e" }}>
                    Credentials verified and saved
                  </span>
                  <button
                    onClick={handleDeleteKey}
                    disabled={deletingKey}
                    title="Remove saved API key and credentials"
                    style={{
                      marginLeft: "auto",
                      padding: "7px 14px",
                      borderRadius: 8,
                      border: "1px solid #7f1d1d",
                      background: "transparent",
                      color: "#f87171",
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: deletingKey ? "wait" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      opacity: deletingKey ? 0.6 : 1,
                    }}
                  >
                    <Trash2 size={12} />{" "}
                    {deletingKey ? "Deleting…" : "Delete API Key"}
                  </button>
                </>
              )}
            </div>

            {cfError && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: "#f87171",
                  fontSize: 12,
                }}
              >
                <AlertCircle size={13} /> {cfError}
              </div>
            )}

            <div
              style={{
                padding: "11px 13px",
                background: "#0d1420",
                border: "1px solid #1e2d3d",
                borderRadius: 8,
                display: "flex",
                gap: 10,
              }}
            >
              <Info
                size={13}
                color="#3b82f6"
                style={{ marginTop: 1, flexShrink: 0 }}
              />
              <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.7 }}>
                <strong style={{ color: "#94a3b8" }}>API Token:</strong>{" "}
                dash.cloudflare.com → My Profile → API Tokens → Create Token →
                Workers:Edit template plus Zone Settings:Read and Zone
                Settings:Edit
                <br />
                <strong style={{ color: "#94a3b8" }}>Account ID:</strong>{" "}
                dash.cloudflare.com → select account → Overview → right sidebar
                <br />
                <strong style={{ color: "#94a3b8" }}>Zone ID:</strong>{" "}
                select your domain → Overview → API section
                <br />
                <strong style={{ color: "#94a3b8" }}>
                  KV Namespace ID:
                </strong>{" "}
                Workers &amp; Pages → KV → select namespace → Namespace ID on
                the right
              </div>
            </div>
          </div>
        </Section>

        {/* ── Section 5: Security ───────────────────────────────────────── */}
        <Section label="Security">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Cloudflare zone protection */}
            <div
              style={{
                padding: "13px 14px",
                background: "#0d1420",
                border: "1px solid #1e2d3d",
                borderRadius: 8,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#94a3b8",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  Cloudflare Zone Protection
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#475569",
                    lineHeight: 1.6,
                    marginTop: 4,
                  }}
                >
                  Manage live Cloudflare settings here without opening the
                  dashboard. Changes apply to the configured zone immediately.
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, color: "#cbd5e1", fontWeight: 600 }}>
                    Bot Fight Mode
                  </div>
                  <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>
                    Challenge known automated traffic at Cloudflare’s edge.
                  </div>
                </div>
                <button
                  type="button"
                  aria-pressed={botFightMode === "on"}
                  onClick={() => handleBotFightMode(botFightMode !== "on")}
                  disabled={
                    !cfConnected ||
                    !securityAvailable ||
                    securityLoading ||
                    securitySaving
                  }
                  style={{
                    minWidth: 82,
                    padding: "8px 12px",
                    borderRadius: 7,
                    border: `1px solid ${botFightMode === "on" ? "#166534" : "#334155"}`,
                    background: botFightMode === "on" ? "#14532d" : "#172033",
                    color: botFightMode === "on" ? "#86efac" : "#94a3b8",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor:
                      !cfConnected ||
                      !securityAvailable ||
                      securityLoading ||
                      securitySaving
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      !cfConnected ||
                      !securityAvailable ||
                      securityLoading ||
                      securitySaving
                        ? 0.55
                        : 1,
                  }}
                >
                  {securitySaving ? "Saving…" : botFightMode === "on" ? "Enabled" : "Disabled"}
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <label
                  style={{
                    fontSize: 11,
                    color: "#64748b",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  Security Level
                </label>
                <select
                  value={securityLevel ?? ""}
                  onChange={(e) =>
                    handleSecurityLevel(e.target.value as SecurityLevel)
                  }
                  disabled={
                    !cfConnected ||
                    !securityAvailable ||
                    securityLoading ||
                    securitySaving
                  }
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    background: "#0d1117",
                    border: "1px solid #1e2d3d",
                    borderRadius: 8,
                    color: "#cbd5e1",
                    fontSize: 12,
                    outline: "none",
                    cursor:
                      !cfConnected ||
                      !securityAvailable ||
                      securityLoading ||
                      securitySaving
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      !cfConnected ||
                      !securityAvailable ||
                      securityLoading ||
                      securitySaving
                        ? 0.55
                        : 1,
                  }}
                >
                  <option value="" disabled>
                    {securityLoading ? "Loading Cloudflare settings…" : "Select a security level"}
                  </option>
                  <option value="essentially_off">Essentially off</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="under_attack">I’m under attack</option>
                </select>
              </div>

              {!cfConnected && (
                <div style={{ fontSize: 11, color: "#f97316" }}>
                  Save and verify the Cloudflare connection to enable these controls.
                </div>
              )}
              {cfConnected && !securityAvailable && !securityLoading && (
                <div style={{ fontSize: 11, color: "#f97316" }}>
                  Add a valid Zone ID and a token with Zone Settings read/edit
                  permissions, then reconnect.
                </div>
              )}
              {securityError && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 6,
                    color: "#f87171",
                    fontSize: 11,
                    lineHeight: 1.5,
                  }}
                >
                  <AlertCircle size={13} style={{ marginTop: 1, flexShrink: 0 }} />
                  <span>{securityError}</span>
                </div>
              )}
              {securityAvailable && !securityError && (
                <div style={{ fontSize: 11, color: "#22c55e" }}>
                  Live settings loaded from Cloudflare.
                </div>
              )}
            </div>

            {/* Secret Code Path */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#64748b",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Secret Code Path
              </label>
              <input
                type="text"
                value={publicCodePath}
                onChange={(e) => setPublicCodePath(e.target.value)}
                placeholder="/x7k9p2m"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  background: "#0d1117",
                  border: "1px solid #1e2d3d",
                  borderRadius: 8,
                  color: "#e2e8f0",
                  fontSize: 13,
                  outline: "none",
                  fontFamily: "monospace",
                }}
              />
              <div style={{ fontSize: 11, color: "#374151" }}>
                The path prefix that serves your frontend. Requests to this
                exact path <em>and</em> any sub-path beneath it (HTML, JS, CSS,
                fonts, API calls) are all transparently proxied to your frontend
                URL. Everyone else sees a proxy of a random website. Must start
                with <code style={{ color: "#64748b" }}>/</code> and be hard to
                guess — e.g.{" "}
                <code style={{ color: "#64748b" }}>/x7k9p2m</code>
              </div>
            </div>

            {/* Proxy Websites */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#64748b",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Proxy Websites
              </label>
              <div style={{ fontSize: 11, color: "#374151", marginBottom: 4 }}>
                Visitors who pass the sandbox but don't have the correct path
                are silently proxied to one of these websites. They see real
                content — no redirect. Add at least one.{" "}
                <strong>NOTE: Empty boxes are ignored!</strong>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {decoyDomains.map((url, i) => (
                  <div
                    key={i}
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: "#374151",
                        width: 40,
                        flexShrink: 0,
                      }}
                    >
                      URL {i + 1}
                    </span>
                    <input
                      type="url"
                      value={url}
                      placeholder="https://example.com"
                      onChange={(e) =>
                        setDecoyDomains((prev) => {
                          const next = [...prev];
                          next[i] = e.target.value;
                          return next;
                        })
                      }
                      style={{
                        flex: 1,
                        padding: "7px 10px",
                        background: "#0d1117",
                        border: "1px solid #1e2d3d",
                        borderRadius: 7,
                        color: "#e2e8f0",
                        fontSize: 12,
                        outline: "none",
                        fontFamily: "monospace",
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* KV Binding Name */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#64748b",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                KV Binding Name{" "}
                <span
                  style={{
                    fontWeight: 400,
                    textTransform: "none",
                    letterSpacing: 0,
                  }}
                >
                  (optional)
                </span>
              </label>
              <input
                type="text"
                value={kvBindingName}
                onChange={(e) => setKvBindingName(e.target.value)}
                placeholder="CODE_STORE"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  background: "#0d1117",
                  border: "1px solid #1e2d3d",
                  borderRadius: 8,
                  color: "#e2e8f0",
                  fontSize: 13,
                  outline: "none",
                  fontFamily: "monospace",
                }}
              />
              <div style={{ fontSize: 11, color: "#374151" }}>
                The name your Worker code uses to access the KV store (e.g.{" "}
                <code style={{ color: "#64748b" }}>env.CODE_STORE</code>). Leave
                blank to use{" "}
                <code style={{ color: "#64748b" }}>CODE_STORE</code>. Must match
                the binding name in your Cloudflare KV namespace settings.
              </div>
            </div>
          </div>
        </Section>
      </div>

      {/* ── RIGHT COLUMN: Preview + Deploy ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Sticky wrapper */}
        <div style={{ position: "sticky", top: 24 }}>
          {/* Preview panel */}
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#374151",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              Live Preview
            </div>
            <WorkerPreview
              templateId={template}
              accentColor={selectedTemplate.color}
            />
            <div
              style={{
                fontSize: 11,
                color: "#374151",
                marginTop: 8,
                textAlign: "center",
              }}
            >
              Previewing:{" "}
              <span style={{ color: "#93c5fd" }}>{selectedTemplate.label}</span>{" "}
              header ·{" "}
              <span style={{ color: "#93c5fd" }}>
                {selectedClient?.name ?? clientAlias}
              </span>
            </div>
          </div>

          {/* Deploy button */}
          <button
            onClick={handleDeploy}
            disabled={deployStatus === "deploying" || !cfConnected}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 10,
              border: "none",
              background: !cfConnected
                ? "#1e2d3d"
                : deployStatus === "deploying"
                  ? "#1e3a5f"
                  : deployStatus === "success"
                    ? "#14532d"
                    : "#2563eb",
              color: !cfConnected ? "#475569" : "white",
              fontSize: 14,
              fontWeight: 700,
              cursor:
                !cfConnected || deployStatus === "deploying"
                  ? "not-allowed"
                  : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "all 0.15s",
            }}
          >
            {deployStatus === "deploying" ? (
              <>
                <Cloud
                  size={16}
                  style={{ animation: "spin 1s linear infinite" }}
                />{" "}
                Deploying…
              </>
            ) : deployStatus === "success" ? (
              <>
                <CheckCircle2 size={16} /> Deployed Successfully
              </>
            ) : (
              <>
                <Rocket size={16} /> Deploy to Cloudflare Workers
              </>
            )}
          </button>

          {!cfConnected && (
            <div
              style={{
                fontSize: 11,
                color: "#475569",
                textAlign: "center",
                marginTop: 8,
              }}
            >
              Connect Cloudflare credentials first
            </div>
          )}

          {/* Status messages */}
          {(deployStatus === "success" || deployedUrl) && deployedUrl && (
            <div
              style={{
                marginTop: 14,
                padding: "12px 14px",
                background: "#052e16",
                border: "1px solid #166534",
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: "#4ade80",
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                <CheckCircle2 size={13} /> Worker deployed!
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>
                Your Worker is live at:
              </div>
              <a
                href={deployedUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 12,
                  color: "#60a5fa",
                  fontFamily: "monospace",
                  wordBreak: "break-all",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  textDecoration: "none",
                  marginBottom: 12,
                }}
              >
                {deployedUrl} <ExternalLink size={11} />
              </a>
              {deployedScriptName && (
                <div
                  style={{ fontSize: 11, color: "#374151", marginBottom: 10 }}
                >
                  Script:{" "}
                  <span style={{ fontFamily: "monospace", color: "#64748b" }}>
                    {deployedScriptName}
                  </span>
                </div>
              )}

              {/* Test Worker button */}
              <button
                onClick={handleTestWorker}
                disabled={testStatus === "testing"}
                style={{
                  width: "100%",
                  padding: "7px 12px",
                  borderRadius: 7,
                  border: `1px solid ${testStatus === "ok" ? "#166534" : testStatus === "error" ? "#7f1d1d" : "#1e3a5f"}`,
                  background:
                    testStatus === "ok"
                      ? "#052e16"
                      : testStatus === "error"
                        ? "#2d0a0a"
                        : "#0d1e35",
                  color:
                    testStatus === "ok"
                      ? "#4ade80"
                      : testStatus === "error"
                        ? "#f87171"
                        : "#93c5fd",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: testStatus === "testing" ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  marginBottom: 6,
                  opacity: testStatus === "testing" ? 0.7 : 1,
                  transition: "all 0.15s",
                }}
              >
                <Activity
                  size={12}
                  style={{
                    animation:
                      testStatus === "testing"
                        ? "spin 1s linear infinite"
                        : "none",
                  }}
                />
                {testStatus === "testing"
                  ? "Testing…"
                  : testStatus === "ok"
                    ? "Test passed"
                    : testStatus === "error"
                      ? "Test failed — retry"
                      : "Test Worker"}
              </button>

              {/* Test result */}
              {testMsg && (
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: "monospace",
                    marginBottom: 10,
                    padding: "6px 10px",
                    borderRadius: 6,
                    background: testStatus === "ok" ? "#052e16" : "#2d0a0a",
                    color: testStatus === "ok" ? "#86efac" : "#fca5a5",
                    border: `1px solid ${testStatus === "ok" ? "#166534" : "#7f1d1d"}`,
                  }}
                >
                  {testMsg}
                </div>
              )}

              <button
                onClick={handleDeleteWorker}
                disabled={deletingWorker}
                style={{
                  width: "100%",
                  padding: "7px 12px",
                  borderRadius: 7,
                  border: "1px solid #7f1d1d",
                  background: "transparent",
                  color: "#f87171",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: deletingWorker ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  opacity: deletingWorker ? 0.6 : 1,
                }}
              >
                <Trash2 size={12} />{" "}
                {deletingWorker
                  ? "Deleting worker…"
                  : "Delete Worker from Cloudflare"}
              </button>
            </div>
          )}

          {deleteWorkerMsg && !deployedUrl && (
            <div
              style={{
                marginTop: 14,
                padding: "10px 14px",
                background: "#0d1420",
                border: "1px solid #1e2d3d",
                borderRadius: 8,
                fontSize: 12,
                color: "#94a3b8",
              }}
            >
              {deleteWorkerMsg}
            </div>
          )}

          {deployStatus === "error" && deployMsg && (
            <div
              style={{
                marginTop: 14,
                padding: "12px 14px",
                background: "#2d0a0a",
                border: "1px solid #7f1d1d",
                borderRadius: 8,
                display: "flex",
                alignItems: "flex-start",
                gap: 6,
              }}
            >
              <AlertCircle
                size={13}
                color="#f87171"
                style={{ marginTop: 1, flexShrink: 0 }}
              />
              <div style={{ fontSize: 12, color: "#f87171" }}>{deployMsg}</div>
            </div>
          )}

          {/* Summary strip */}
          <div
            style={{
              marginTop: 16,
              padding: "12px 14px",
              background: "#0d1117",
              border: "1px solid #1e2d3d",
              borderRadius: 8,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "#374151",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              Deployment Config
            </div>
            {[
              { label: "Template", value: selectedTemplate.label },
              { label: "Client", value: selectedClient?.name ?? clientAlias },
              {
                label: "Region",
                value: REGIONS.find((r) => r.id === region)?.label ?? region,
              },
              { label: "Secret Path", value: publicCodePath || "not set" },
              {
                label: "KV Bound",
                value: kvNamespaceId ? "yes" : "no (rate limiting disabled)",
              },
            ].map((row) => (
              <div
                key={row.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <span style={{ fontSize: 11, color: "#475569" }}>
                  {row.label}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color:
                      row.label === "KV Bound" && !kvNamespaceId
                        ? "#f97316"
                        : "#94a3b8",
                    fontWeight: 500,
                  }}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
