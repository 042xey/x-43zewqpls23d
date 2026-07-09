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
