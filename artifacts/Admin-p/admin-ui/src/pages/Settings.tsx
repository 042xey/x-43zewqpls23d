import { useEffect, useState, type ComponentType } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Globe2,
  Loader2,
  Mail,
  Palette,
  Save,
  Settings as SettingsIcon,
} from "lucide-react";
import {
  loadExternalAppUrl,
  saveExternalAppUrl,
  type ExternalAppName,
} from "@/lib/api";

type AppSettingProps = {
  app: ExternalAppName;
  title: string;
  description: string;
  placeholder: string;
  icon: ComponentType<{ size?: number; color?: string }>;
};

export default function Settings() {
  return (
    <div
      style={{
        maxWidth: 820,
        margin: "0 auto",
        padding: "32px 32px 64px",
      }}
    >
      <header style={{ marginBottom: 30 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 7,
          }}
        >
          <SettingsIcon size={20} color="#3b82f6" />
          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#f1f5f9",
            }}
          >
            Settings
          </h1>
        </div>

        <p
          style={{
            fontSize: 13,
            lineHeight: 1.6,
            color: "#64748b",
            maxWidth: 620,
          }}
        >
          Configure each external application independently. Saving one
          destination will not change the other.
        </p>
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <StandaloneAppSetting
          app="webmail"
          title="Webmail"
          description="Set the destination opened by the Webmail navigation tab."
          placeholder="https://mail.me"
          icon={Mail}
        />

        <StandaloneAppSetting
          app="svg-generator"
          title="SVG Generator"
          description="Set the destination opened by the SVG Generator navigation tab."
          placeholder="https://example.com/svg-generator"
          icon={Palette}
        />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 9,
          marginTop: 24,
          padding: "13px 14px",
          background: "#0d1420",
          border: "1px solid #1e2d3d",
          borderRadius: 8,
          color: "#64748b",
          fontSize: 12,
          lineHeight: 1.65,
        }}
      >
        <ExternalLink
          size={14}
          color="#3b82f6"
          style={{ flexShrink: 0, marginTop: 2 }}
        />
        <span>
          Clicking Webmail or SVG Generator opens its saved destination in a
          new browser tab. The admin panel stays open in the current tab.
        </span>
      </div>
    </div>
  );
}

function StandaloneAppSetting({
  app,
  title,
  description,
  placeholder,
  icon: Icon,
}: AppSettingProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;

    loadExternalAppUrl(app)
      .then((loadedUrl) => {
        if (active) setUrl(loadedUrl);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Failed to load this setting.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [app]);

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const savedUrl = await saveExternalAppUrl(app, url);
      setUrl(savedUrl);
      setSaved(true);
      window.dispatchEvent(new Event("external-apps-updated"));
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Failed to save this setting.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      style={{
        background: "#0a0f1a",
        border: "1px solid #1e2535",
        borderRadius: 12,
        padding: 22,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginBottom: 5,
        }}
      >
        <Icon size={16} color="#60a5fa" />
        <h2
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#cbd5e1",
          }}
        >
          {title}
        </h2>
      </div>

      <p
        style={{
          color: "#475569",
          fontSize: 12,
          lineHeight: 1.6,
          marginBottom: 18,
        }}
      >
        {description}
      </p>

      <label
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 7,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#64748b",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          Destination URL
        </span>

        <input
          type="url"
          value={url}
          disabled={loading || saving}
          onChange={(event) => {
            setUrl(event.target.value);
            setError("");
            setSaved(false);
          }}
          placeholder={placeholder}
          spellCheck={false}
          style={{
            width: "100%",
            padding: "11px 12px",
            background: "#080c14",
            border: `1px solid ${error ? "#7f1d1d" : "#1e2d3d"}`,
            borderRadius: 8,
            color: "#e2e8f0",
            fontSize: 13,
            outline: "none",
            fontFamily: "monospace",
            opacity: loading || saving ? 0.7 : 1,
          }}
        />
      </label>

      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 7,
            marginTop: 12,
            color: "#fca5a5",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <AlertCircle
            size={14}
            style={{ flexShrink: 0, marginTop: 1 }}
          />
          {error}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginTop: 16,
        }}
      >
        <button
          type="button"
          onClick={save}
          disabled={loading || saving}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "9px 15px",
            border: "none",
            borderRadius: 8,
            background:
              loading || saving
                ? "#1e2d3d"
                : "linear-gradient(135deg,#2563eb,#4f46e5)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            cursor: loading || saving ? "wait" : "pointer",
            opacity: loading || saving ? 0.7 : 1,
          }}
        >
          {saving ? (
            <Loader2
              size={13}
              style={{
                animation: "spin 1s linear infinite",
              }}
            />
          ) : (
            <Save size={13} />
          )}
          {saving ? "Saving…" : `Save ${title} settings`}
        </button>

        {saved && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: "#4ade80",
              fontSize: 12,
            }}
          >
            <CheckCircle2 size={14} />
            Saved
          </span>
        )}
      </div>
    </section>
  );
}