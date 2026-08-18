import { useLocation } from "wouter";
import { adminUrl } from "@/lib/api";
import {
  LayoutDashboard,
  Key,
  Users,
  Globe,
  Bell,
  Palette,
  Wrench,
  Cloud,
  Mail,
  LogOut,
  ShieldCheck,
  Shield,
  Settings,
  ExternalLink,
} from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";
import { loadExternalAppUrls, type ExternalAppUrls } from "@/lib/api";

const sections = [
  {
    label: "MAIN",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
      { icon: Key, label: "Active Tokens", href: "/tokens" },
      { icon: Users, label: "Sessions", href: "/sessions" },
      { icon: Globe, label: "Proxies", href: "/proxies" },
    ],
  },
  {
    label: "AUTOMATION",
    items: [
      { icon: Bell, label: "Keyword Alerts", href: "/alerts" },
    ],
  },
  {
    label: "APPEARANCE",
    items: [
      { icon: Palette, label: "SVG Generator", href: "/svg" },
      { icon: Wrench, label: "Essential Tools", href: "/tools" },
    ],
  },
  {
    label: "ACCOUNT",
    items: [
      { icon: Cloud, label: "Deploy", href: "/deploy" },
      { icon: Shield, label: "Tunnel", href: "/tunnel" },
      { icon: Mail, label: "Webmail", href: "/webmail" },
      { icon: Settings, label: "Settings", href: "/settings" },
    ],
  },
];

export default function Sidebar() {
  const [location, navigate] = useLocation();
  const [externalApps, setExternalApps] = useState<ExternalAppUrls>({
    webmail_url: "",
    svg_generator_url: "",
  });

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const urls = await loadExternalAppUrls();
        if (active) setExternalApps(urls);
      } catch {
        // The destination tabs remain available as setup links if settings
        // cannot be loaded.
      }
    };

    void load();
    window.addEventListener("external-apps-updated", load);

    return () => {
      active = false;
      window.removeEventListener("external-apps-updated", load);
    };
  }, [location]);

  function openExternalApp(
    event: MouseEvent<HTMLButtonElement>,
    type: "webmail" | "svg_generator",
    fallbackPath: string,
  ) {
    event.preventDefault();
    const url =
      type === "webmail"
        ? externalApps.webmail_url
        : externalApps.svg_generator_url;

    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    navigate(fallbackPath);
  }

  function isActive(href: string) {
    if (href === "/dashboard") return location === "/" || location === "/dashboard";
    return location === href;
  }

  function handleLogout() {
    try { localStorage.clear(); } catch { /* ignore */ }
    try { sessionStorage.clear(); } catch { /* ignore */ }
    window.location.href = adminUrl("/logout");
  }

  return (
    <aside
      style={{
        width: 220,
        minWidth: 220,
        background: "#0a0d14",
        borderRight: "1px solid #1e2535",
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        position: "sticky",
        top: 0,
        height: "100vh",
        overflowY: "auto",
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: "20px 16px 16px",
          borderBottom: "1px solid #1e2535",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "linear-gradient(135deg, #3b82f6, #6366f1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ShieldCheck size={18} color="white" />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", letterSpacing: "0.01em" }}>
            Admin Panel
          </div>
          <div style={{ fontSize: 10, color: "#475569", marginTop: 1 }}>v1.0.0</div>
        </div>
      </div>

      {/* Nav sections */}
      <nav style={{ flex: 1, padding: "12px 8px" }}>
        {sections.map((section) => (
          <div key={section.label} style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "#374151",
                letterSpacing: "0.08em",
                padding: "0 8px",
                marginBottom: 4,
              }}
            >
              {section.label}
            </div>
            {section.items.map((item) => {
              const active = isActive(item.href);
              const externalType =
                item.href === "/webmail"
                  ? "webmail"
                  : item.href === "/svg"
                    ? "svg_generator"
                    : undefined;
              return (
                <button
                  key={item.href}
                  onClick={(event) =>
                    externalType
                      ? openExternalApp(event, externalType, "/settings")
                      : navigate(item.href)
                  }
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    padding: "7px 8px",
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    background: active ? "#1e3a5f" : "transparent",
                    color: active ? "#60a5fa" : "#64748b",
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    textAlign: "left",
                    marginBottom: 1,
                    transition: "all 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLButtonElement).style.background = "#131924";
                      (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                      (e.currentTarget as HTMLButtonElement).style.color = "#64748b";
                    }
                  }}
                >
                  <item.icon size={15} />
                  {item.label}
                  {externalType && (
                    <ExternalLink
                      size={11}
                      style={{ marginLeft: "auto", opacity: 0.55 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Logout */}
      <div style={{ padding: "8px", borderTop: "1px solid #1e2535" }}>
        <button
          onClick={handleLogout}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "7px 8px",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            background: "transparent",
            color: "#ef4444",
            fontSize: 13,
            fontWeight: 500,
            textAlign: "left",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#2d1a1a";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          }}
        >
          <LogOut size={15} />
          Logout
        </button>
      </div>
    </aside>
  );
}
