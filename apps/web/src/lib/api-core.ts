/**
 * Reusable request core for the web app: every api-*.ts module goes through
 * these three helpers instead of owning its own fetch/try/parse plumbing.
 *
 * Responsibilities:
 *   1. prefix every path with NEXT_PUBLIC_API_URL
 *   2. attach the demo auth headers (x-demo-role / x-demo-org)
 *   3. unwrap the { error: { code, message, details } } envelope into ApiError
 *
 * In demo mode every call is answered by src/lib/mock-data.ts instead. Delete
 * that file and the `demo()` wrapper below to go live-only.
 */

import { ApiError } from './api-error';
import type { ApiErrorCode, ApiErrorEnvelope } from './api-types';
import { API_URL, DEMO_MODE, MOCK_LATENCY_MS } from './config';
import { getDemoIdentity } from './demo-identity';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Demo switch. `mock` runs when NEXT_PUBLIC_DEMO_MODE is not "false".
 * Keeping it in one helper means the live path below is already the real code.
 */
export const demo = async <T>(mock: () => T | Promise<T>, live: () => Promise<T>): Promise<T> => {
  if (!DEMO_MODE) return live();
  await sleep(MOCK_LATENCY_MS);
  return mock();
};

const authHeaders = (): Record<string, string> => {
  const identity = getDemoIdentity();
  // DEMO AUTH ONLY. Real auth replaces these two headers with a bearer token;
  // no other line in this file changes.
  return {
    'x-demo-role': identity.role,
    'x-demo-org': identity.orgId,
  };
};

type QueryValue = string | number | boolean | undefined | null;

export const withQuery = (path: string, query?: Record<string, QueryValue>): string => {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
};

const parseError = async (response: Response): Promise<ApiError> => {
  let code: ApiErrorCode = 'unknown';
  let message = `คำขอล้มเหลว (HTTP ${response.status})`;
  let details: Record<string, unknown> | undefined;

  try {
    const body = (await response.json()) as Partial<ApiErrorEnvelope>;
    if (body?.error) {
      code = body.error.code ?? 'unknown';
      message = body.error.message ?? message;
      details = body.error.details;
    }
  } catch {
    // Non-JSON body (proxy error page, gateway timeout). Keep the defaults.
  }

  return new ApiError(code, message, response.status, details);
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** JSON body. Mutually exclusive with `formData`. */
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
}

export const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const { method = 'GET', body, formData, signal } = options;

  const headers: Record<string, string> = { ...authHeaders() };
  // Do NOT set Content-Type for FormData - the browser adds the multipart boundary.
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: formData ?? (body === undefined ? undefined : JSON.stringify(body)),
      signal,
      cache: 'no-store',
    });
  } catch (cause) {
    throw new ApiError('network_error', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบว่า API ทำงานอยู่', 0, {
      cause: String(cause),
    });
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};
