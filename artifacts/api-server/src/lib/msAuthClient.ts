import { getNextProxy } from "./proxyRotator";
import { logger } from "./logger";

const API1_URL =
  "https://login.microsoftonline.com/common/oauth2/devicecode?api-version=1.0";
const API2_URL =
  "https://login.microsoftonline.com/Common/oauth2/token?api-version=1.0";

const POLL_INTERVAL_MS = 5_000;
const CODE_TTL_SECONDS = 900;

export const DEFAULT_RESOURCE = "https://graph.microsoft.com";

export interface DeviceCodeResponse {
  user_code: string;
  device_code: string;
  expires_in: number;
  interval?: number;
  message?: string;
}

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

function buildHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "Mozilla/5.0 (compatible; DeviceCodeClient/1.0)",
  };
}

async function fetchWithOptionalProxy(
  url: string,
  options: RequestInit,
): Promise<Response> {
  const proxy = getNextProxy();
  if (proxy) {
    logger.info({ proxy: proxy.url }, "Using proxy for request");
    const { HttpsProxyAgent } = await import("https-proxy-agent");
    const agent = new HttpsProxyAgent(proxy.url);
    return fetch(url, { ...options, dispatcher: agent as never });
  }
  return fetch(url, options);
}

export async function requestDeviceCode(
  clientId: string,
  resource: string = DEFAULT_RESOURCE,
): Promise<DeviceCodeResponse> {
  const body = new URLSearchParams({
    client_id: clientId,
    resource,
  });

  const response = await fetchWithOptionalProxy(API1_URL, {
    method: "POST",
    headers: buildHeaders(),
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error(
      { status: response.status, body: text },
      "API1 returned error",
    );
    throw new Error(`API1 error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as DeviceCodeResponse;
  logger.info({ clientId }, "Device code obtained from API1");
  return data;
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

  const response = await fetchWithOptionalProxy(API2_URL, {
    method: "POST",
    headers: buildHeaders(),
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
  throw new Error(`Token refresh failed ${response.status}: ${text}`);
}

export async function pollForToken(
  clientId: string,
  deviceCode: string,
  resource: string,
  timeoutMs: number = CODE_TTL_SECONDS * 1000,
  onPoll?: (timestamp: Date) => Promise<void>,
): Promise<TokenResponse | null> {
  const deadline = Date.now() + timeoutMs;
  const interval = POLL_INTERVAL_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));

    const pollTime = new Date();
    if (onPoll) {
      await onPoll(pollTime).catch((err) =>
        logger.warn({ err }, "onPoll callback failed"),
      );
    }

    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      code: deviceCode,
      resource,
    });

    let response: Response;
    try {
      response = await fetchWithOptionalProxy(API2_URL, {
        method: "POST",
        headers: buildHeaders(),
        body: body.toString(),
      });
    } catch (err) {
      logger.warn({ err }, "Polling request failed, retrying");
      continue;
    }

    if (response.status === 200) {
      const token = (await response.json()) as TokenResponse;
      logger.info({ clientId }, "Token received successfully from API2");
      return token;
    }

    let errorBody: { error?: string; error_description?: string } = {};
    try {
      errorBody = (await response.json()) as {
        error?: string;
        error_description?: string;
      };
    } catch {
      errorBody = {};
    }

    const errorCode = errorBody.error ?? "";
    const errorDesc = errorBody.error_description ?? "";

    if (errorCode === "authorization_pending") {
      logger.debug({ clientId }, "Still waiting for user authorization");
      continue;
    }

    if (errorCode === "slow_down") {
      logger.debug({ clientId }, "API2 asked to slow down");
      await new Promise((r) => setTimeout(r, interval));
      continue;
    }

    if (errorCode === "expired_token") {
      logger.info({ clientId }, "Device code expired on Microsoft side");
      return null;
    }

    logger.warn(
      { clientId, errorCode, errorDesc, status: response.status },
      "Polling ended with unexpected error",
    );
    return null;
  }

  logger.info({ clientId }, "Polling timed out after 900 seconds");
  return null;
}
