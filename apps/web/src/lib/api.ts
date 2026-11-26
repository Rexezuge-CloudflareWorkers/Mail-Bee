/**
 * Same-origin API helpers. Every endpoint the SPA calls lives under `/user`,
 * so relative paths keep the session cookies and Cloudflare Access context.
 */
export async function apiFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> {
  return fetch(input, { credentials: 'same-origin', ...init });
}

export async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `HTTP ${response.status}`);
  }
  return response.json();
}

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, value);
  }
  return search.toString();
}

export async function apiGet<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  const query = params ? buildQuery(params) : '';
  return readJson<T>(await apiFetch(query ? `${path}?${query}` : path));
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return readJson<T>(
    await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

export async function apiDelete<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  const query = params ? buildQuery(params) : '';
  return readJson<T>(await apiFetch(query ? `${path}?${query}` : path, { method: 'DELETE' }));
}
