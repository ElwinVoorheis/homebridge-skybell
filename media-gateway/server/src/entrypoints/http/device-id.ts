import { z } from 'zod';
import { InvalidDeviceId } from './errors.js';

// Ids end up in URL paths and MediaMTX path names; restrict to a safe alphabet (NFR-2, AC-4).
const deviceIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

/** @throws {InvalidDeviceId} */
export function parseDeviceId(params: unknown): string {
  const result = z.object({ id: deviceIdSchema }).safeParse(params);
  if (!result.success) throw new InvalidDeviceId();
  return result.data.id;
}
