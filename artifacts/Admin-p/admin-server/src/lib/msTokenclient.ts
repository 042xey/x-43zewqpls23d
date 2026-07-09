import { logger } from "./logger";

const API2_URL =
  "https://login.microsoftonline.com/Common/oauth2/token?api-version=1.0";

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

  const response = await fetch(API2_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (compatible; DeviceCodeClient/1.0)",
    },
    body: body.toString(),
  });

  if (response.status === 200) {
    return (await response.json()) as TokenResponse;
  }

  const text = await response.text();
  logger.error(
    { status: response.status, body: text, clientId },
    "Refresh token exchange failed",
  );

  let errorCode: string | undefined;
  try {
    errorCode = (JSON.parse(text) as { error?: string }).error;
  } catch {
    // Non-JSON error body, leave errorCode undefined.
  }

  if (errorCode === "invalid_grant") {
    throw new RefreshGrantError(
      response.status,
      errorCode,
      `Token refresh failed ${response.status}: ${text}`,
    );
  }

  throw new Error(`Token refresh failed ${response.status}: ${text}`);
}
