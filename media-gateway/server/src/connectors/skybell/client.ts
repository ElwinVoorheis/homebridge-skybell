import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { SourceUnavailable } from '../../core/errors.js';
import type { Logger } from '../../core/ports.js';

/** The unpublished API the SkyBell HD app uses (see the legacy `skybell_api.js`). */
export const SKYBELL_URL = 'https://cloud.myskybell.com/api/v3/';
// SkyBell's servers are slow (seconds per call) but should not hang a request forever.
const TIMEOUT_MS = 20_000;

const loginReply = z.object({ access_token: z.string().min(1) });

export interface SkyBellClientOptions {
  readonly credentials: { readonly username: string; readonly password: string };
  readonly logger: Logger;
  readonly baseUrl?: string;
}

type Method = 'GET' | 'POST' | 'DELETE';

class AuthRejected extends Error {}

/** HTTPS client for the SkyBell cloud: login, token reuse and one re-login on auth failure. */
export class SkyBellClient {
  private token: string | undefined;
  private readonly baseUrl: string;
  // The app sends random per-install identifiers; the cloud expects them on every call.
  private readonly appId = randomUUID();
  private readonly clientId = randomUUID();
  private requestCount = 0;

  constructor(private readonly options: SkyBellClientOptions) {
    this.baseUrl = options.baseUrl ?? SKYBELL_URL;
  }

  /** @throws {SourceUnavailable} on network, auth, HTTP or shape errors. */
  async request<T>(method: Method, path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    try {
      const reply = await this.withAuth(() => this.send(method, path, body));
      return schema.parse(reply);
    } catch (error) {
      throw error instanceof SourceUnavailable ? error : new SourceUnavailable({ cause: error });
    }
  }

  /** Downloads a signed media URL (no SkyBell auth headers). */
  async download(url: string): Promise<{ bytes: Uint8Array; contentType: string | null }> {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      this.options.logger.info({ status: response.status }, 'SkyBell media download');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get('content-type'),
      };
    } catch (error) {
      throw new SourceUnavailable({ cause: error });
    }
  }

  private async withAuth(call: () => Promise<unknown>): Promise<unknown> {
    if (!this.token) await this.login();
    try {
      return await call();
    } catch (error) {
      if (!(error instanceof AuthRejected)) throw error;
      await this.login();
      return call();
    }
  }

  private async login(): Promise<void> {
    this.token = undefined;
    const reply = await this.send('POST', 'login/', this.options.credentials);
    this.token = loginReply.parse(reply).access_token;
  }

  private async send(method: Method, path: string, body?: unknown): Promise<unknown> {
    const id = ++this.requestCount;
    const started = Date.now();
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-skybell-app-id': this.appId,
      'x-skybell-client-id': this.clientId,
    };
    if (this.token) headers.authorization = `Bearer ${this.token}`;

    const init: RequestInit = { method, headers, signal: AbortSignal.timeout(TIMEOUT_MS) };
    if (body !== undefined) init.body = JSON.stringify(body);
    const response = await fetch(this.baseUrl + path, init);
    // Only method, path and status are logged: bodies can hold tokens, keys and personal data.
    this.options.logger.info(
      { id, method, path, status: response.status, ms: Date.now() - started },
      'SkyBell request',
    );

    if (response.status === 401 || response.status === 403) {
      if (path === 'login/') throw new SourceUnavailable();
      throw new AuthRejected();
    }
    if (!response.ok) throw new Error(`SkyBell HTTP ${response.status}`);
    if (response.status === 204) return undefined;
    return response.json();
  }
}
