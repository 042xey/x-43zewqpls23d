const PREFIX = (import.meta.env.VITE_ADMIN_ROUTE_PREFIX as string | undefined) ?? "admin";

export function adminUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/api/${PREFIX}${clean}`;
}

export function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const key = sessionStorage.getItem("admin_key") ?? "";
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "X-Admin-Key": key,
    },
  });
}

export interface ExternalAppUrls {
  webmail_url: string;
  svg_generator_url: string;
}

export type ExternalAppName = "webmail" | "svg-generator";

export async function loadExternalAppUrls(): Promise<ExternalAppUrls> {
  const response = await authFetch(adminUrl("/external-apps"));
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Unable to load external app settings (${response.status})`);
  }
  return (await response.json()) as ExternalAppUrls;
}

export async function loadExternalAppUrl(
  app: ExternalAppName,
): Promise<string> {
  const response = await authFetch(
    adminUrl(`/external-apps/${app}`),
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(
      body.error ??
        `Unable to load ${app} settings (${response.status})`,
    );
  }

  const body = (await response.json()) as { url?: string };
  return body.url ?? "";
}

export async function saveExternalAppUrl(
  app: ExternalAppName,
  url: string,
): Promise<string> {
  const response = await authFetch(
    adminUrl(`/external-apps/${app}`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    },
  );

  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    url?: string;
  };

  if (!response.ok) {
    throw new Error(
      body.error ??
        `Unable to save ${app} settings (${response.status})`,
    );
  }

  return body.url ?? "";
}
