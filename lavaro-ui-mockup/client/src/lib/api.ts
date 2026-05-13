/**
 * Lavaro API client — connects to the VAR Basic FastAPI backend.
 * Configure via:
 *   VITE_API_BASE_URL  (default: http://localhost:8000)
 *   VITE_MEDIA_HOST    (default: window.location.hostname)
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) ?? 'http://localhost:8000';

function mediaHost(): string {
  return (import.meta.env.VITE_MEDIA_HOST as string) ?? window.location.hostname;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface CameraConfig {
  id: string;
  name: string;
  stream_path: string;
  position?: string;
}

export interface FieldConfig {
  id: string;
  name: string;
  cameras: CameraConfig[];
}

export interface VenueConfig {
  venue_id: string;
  venue_name: string;
  fields: FieldConfig[];
  access: { pin_required: boolean };
}

export interface Session {
  session_id: string;
  field_id: string;
  stream_path: string;
  venue_name?: string;
  field_name?: string;
  viewer_count?: number;
}

export interface Clip {
  clip_id: string;
  session_id: string;
  camera_id: string;
  duration_s: number;
  created_at: string;
  file_path?: string;
}

export interface HealthDetailed {
  mediamtx: boolean;
  db: boolean;
  disk_free_gb: number;
  cameras: Record<string, boolean>;
}

// ── Requests ─────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`);
  return res.json() as Promise<T>;
}

export async function getConfig(): Promise<VenueConfig> {
  return apiFetch<VenueConfig>('/api/config');
}

export async function verifyPin(pin: string): Promise<boolean> {
  const data = await apiFetch<{ valid: boolean }>('/api/config/verify-pin', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });
  return data.valid === true;
}

export async function createSession(field_id: string, stream_path: string): Promise<Session> {
  return apiFetch<Session>('/api/session', {
    method: 'POST',
    body: JSON.stringify({ field_id, stream_path }),
  });
}

export async function getSession(sessionId: string): Promise<Session> {
  return apiFetch<Session>(`/api/session/${sessionId}`);
}

export async function joinSession(sessionId: string): Promise<void> {
  await fetch(`${API_BASE}/api/session/${sessionId}/join`, { method: 'POST' });
}

export async function leaveSession(sessionId: string): Promise<void> {
  await fetch(`${API_BASE}/api/session/${sessionId}/leave`, { method: 'POST' });
}

export async function saveClip(params: {
  session_id: string;
  camera_id: string;
  offset_s: number;
  duration_s: number;
}): Promise<{ clip_id: string; job_id?: string }> {
  return apiFetch('/api/clip', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function getClips(params: {
  session_id?: string;
  field_id?: string;
}): Promise<Clip[]> {
  const qs = new URLSearchParams();
  if (params.session_id) qs.set('session_id', params.session_id);
  if (params.field_id) qs.set('field_id', params.field_id);
  try {
    return await apiFetch<Clip[]>(`/api/clips?${qs}`);
  } catch {
    return [];
  }
}

export async function getCameraStatus(cameraId: string): Promise<boolean> {
  try {
    const data = await apiFetch<{ online: boolean }>(`/api/cameras/${cameraId}/status`);
    return data.online === true;
  } catch {
    return false;
  }
}

export async function getHealthDetailed(): Promise<HealthDetailed | null> {
  try {
    return await apiFetch<HealthDetailed>('/api/health/detailed');
  } catch {
    return null;
  }
}

// ── URL helpers ───────────────────────────────────────────────────────────────

export function getHlsUrl(streamPath: string): string {
  return `http://${mediaHost()}:8888/${streamPath}/index.m3u8`;
}

export function getSpectatorUrl(sessionId: string): string {
  return `${window.location.origin}/f/${sessionId}`;
}

export function getClipFileUrl(sessionId: string, clipId: string): string {
  return `${API_BASE}/data/clips/${sessionId}/${clipId}.mp4`;
}
