import { logger } from "./logger";

const API2_URL =
  "https://login.microsoftonline.com/Common/oauth2/token?api-version=1.0";
const REQUEST_TIMEOUT_MS = 30_000;

export interface TokenResponse {
  token_type: string;
  access_token: string;
  refresh_token: string;
  scope: string;
  expires_in: number;
  resource?: string;
  ext_expires_in?: number;
  not_before?: number;
  id_token?: string;
}

export class RefreshGrantError extends Error {
  constructor(
    public readonly status: number,
    public readonly errorCode: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "RefreshGrantError";
  }
}

function sanitizeDescription(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .slice(0, 256);
}

function providerErrorSummary(text: string): {
  errorCode?: string;
  description?: string;
} {
  try {
    const body = JSON.parse(text) as {
      error?: unknown;
      error_description?: unknown;
    };
    return {
      errorCode: typeof body.error === "string" ? body.error.slice(0, 128) : undefined,
      description:
        typeof body.error_description === "string"
          ? sanitizeDescription(body.error_description)
          : undefined,
    };
  } catch {
    return {};
  }
}

export async function refreshAccessToken(
  clientId: string,
  refreshToken: string,
  resource: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    resource,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(API2_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (compatible; DeviceCodeClient/1.0)",
      },
      body: body.toString(),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 200) {
    return (await response.json()) as TokenResponse;
  }

  const text = await response.text();
  const summary = providerErrorSummary(text);
  logger.error({ status: response.status, clientId, ...summary }, "Refresh token exchange failed");

  const errorCode = summary.errorCode;

  if (errorCode === "invalid_grant") {
    throw new RefreshGrantError(
      response.status,
      errorCode,
      `Token refresh failed ${response.status}`,
    );
  }

  throw new Error(`Token refresh failed ${response.status}`);
}
