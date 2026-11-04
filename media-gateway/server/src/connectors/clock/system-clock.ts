import { setTimeout as delay } from 'node:timers/promises';
import type { Clock } from '../../core/ports.js';

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, signal) => delay(ms, undefined, signal ? { signal } : {}),
};
