/** Backend çağrıları. Hata yanıtları BACKEND.md §3.3 biçimindedir: { error, source, message }. */
import { describeCode } from "./codes";
import { env } from "./env";

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(`${env.apiUrl}${path}`, { signal, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export type PostResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function postJson<T>(path: string, body: unknown): Promise<PostResult<T>> {
  try {
    const res = await fetch(`${env.apiUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!res.ok) {
      const code = data.error ?? `HTTP ${res.status}`;
      return { ok: false, error: data.message ? `${describeCode(code)}: ${data.message}` : describeCode(code) };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "Backend'e ulaşılamadı" };
  }
}
