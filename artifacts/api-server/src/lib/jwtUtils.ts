export function extractUserFromJwt(jwt: string | undefined | null): string {
  if (!jwt) return "unknown";
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return "unknown";
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8"),
    ) as Record<string, unknown>;
    return (
      (decoded["unique_name"] as string) ??
      (decoded["upn"] as string) ??
      (decoded["preferred_username"] as string) ??
      (decoded["email"] as string) ??
      (decoded["sub"] as string) ??
      "unknown"
    );
  } catch {
    return "unknown";
  }
}
