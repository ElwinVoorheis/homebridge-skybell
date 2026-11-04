/** A device as the server's `GET /api/devices` returns it (plan §4). */
export interface Device {
  readonly id: string;
  readonly name: string;
  readonly mediaKinds: readonly string[];
  readonly rtspUrl: string | null;
}

/** An error with a message safe to show the user. */
export class ApiError extends Error {
  override readonly name = 'ApiError';
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const UNEXPECTED = 'Unexpected reply from the server';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDevice(value: unknown): value is Device {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    Array.isArray(value.mediaKinds) &&
    value.mediaKinds.every((k) => typeof k === 'string') &&
    (value.rtspUrl === null || typeof value.rtspUrl === 'string')
  );
}

/** Absolute URL on this origin (Node's fetch in tests needs one; browsers accept it too). */
export function apiUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

export function photoUrl(deviceId: string): string {
  return apiUrl(`/api/devices/${encodeURIComponent(deviceId)}/media/photo`);
}

async function errorFrom(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => undefined);
  const message =
    isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string'
      ? body.error.message
      : `Request failed (${response.status})`;
  return new ApiError(message, response.status);
}

export async function fetchDevices(signal?: AbortSignal): Promise<Device[]> {
  const response = await fetch(apiUrl('/api/devices'), signal ? { signal } : {});
  if (!response.ok) throw await errorFrom(response);
  const body: unknown = await response.json();
  if (!Array.isArray(body) || !body.every(isDevice))
    throw new ApiError(UNEXPECTED, response.status);
  return body;
}

/** Fetches the snapshot as a blob, so a failed refresh can keep showing the old image (spec §7). */
export async function fetchPhoto(deviceId: string): Promise<Blob> {
  const response = await fetch(photoUrl(deviceId), { cache: 'no-store' });
  if (!response.ok) throw await errorFrom(response);
  return response.blob();
}
