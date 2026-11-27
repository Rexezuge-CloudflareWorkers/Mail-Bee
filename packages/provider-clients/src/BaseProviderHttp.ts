import { ProviderApiNonRetryableError, ProviderApiRetryableError } from '@rexezuge/errors';
import { FetchHttpClient, HttpFetchError, type IHttpClient } from './http/HttpClient';

const defaultHttpClient: IHttpClient = new FetchHttpClient();

async function fetchJsonWithBearer<T>(
  url: string,
  accessToken: string,
  providerName: string,
  init: RequestInit = {},
  client: IHttpClient = defaultHttpClient,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  try {
    return (await client.fetchJson(url, { ...init, headers })) as T;
  } catch (error) {
    if (error instanceof HttpFetchError) {
      throw createProviderApiErrorFromStatus(
        providerName,
        'request',
        error.status,
        error.statusText,
        extractErrorDetail(error.body, error.statusText),
      );
    }
    throw error;
  }
}

function extractErrorDetail(body: string, fallback: string): string {
  if (!body) return fallback;
  try {
    const data = JSON.parse(body) as { error?: { message?: string } };
    return data.error?.message || body;
  } catch {
    return body;
  }
}

function createProviderApiError(providerName: string, operation: string, response: Response, detail: string): Error {
  return createProviderApiErrorFromStatus(providerName, operation, response.status, response.statusText, detail || response.statusText);
}

function createProviderApiErrorFromStatus(
  providerName: string,
  operation: string,
  status: number,
  statusText: string,
  detail: string,
): Error {
  const message: string = `${providerName} ${operation} failed (${status.toString()}): ${detail || statusText}`;
  // Carry the status so callers can classify (404/410 = message gone) and log
  // it without ever interpolating the message, which can contain mailbox data.
  return isRetryableHttpStatus(status) ? new ProviderApiRetryableError(message, status) : new ProviderApiNonRetryableError(message, status);
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

/**
 * Fetch a non-JSON provider response (raw MIME) with bearer auth.
 *
 * The injectable HTTP client only models JSON, and a raw message must keep its
 * bytes rather than round-trip through `JSON.parse`, so this uses `fetch`
 * directly. Errors still go through the same taxonomy as every other provider
 * call; callers that handle credentials log the classification only.
 */
async function fetchRawWithBearer(url: string, accessToken: string, providerName: string): Promise<string> {
  const headers: Headers = new Headers({ Authorization: `Bearer ${accessToken}` });
  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (error: unknown) {
    throw new ProviderApiRetryableError(
      `${providerName} raw message request failed: ${error instanceof Error ? error.name : 'network error'}`,
    );
  }
  if (!response.ok) {
    throw createProviderApiErrorFromStatus(providerName, 'fetch raw message', response.status, response.statusText, await response.text());
  }
  return response.text();
}

export { fetchJsonWithBearer, fetchRawWithBearer, createProviderApiError, createProviderApiErrorFromStatus, isRetryableHttpStatus };
