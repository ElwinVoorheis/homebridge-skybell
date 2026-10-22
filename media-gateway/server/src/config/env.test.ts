import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './env.js';

const valid = {
  SKYBELL_USERNAME: 'owner@example.com',
  SKYBELL_PASSWORD: 'super-secret-password',
  INTERNAL_SECRET: 'a-long-internal-secret-value',
  RTSP_PUBLIC_HOST: 'nvr.lan',
};

describe('loadConfig', () => {
  it('parses a valid environment and applies defaults', () => {
    const config = loadConfig(valid);

    expect(config).toEqual({
      skybell: { username: 'owner@example.com', password: 'super-secret-password' },
      internalSecret: 'a-long-internal-secret-value',
      publicPort: 3000,
      internalPort: 3001,
      rtspPublicUrl: 'rtsp://nvr.lan:8554',
      mediamtxRtspUrl: 'rtsp://mediamtx:8554',
      logLevel: 'info',
    });
  });

  it('accepts overrides for ports and URLs', () => {
    const config = loadConfig({
      ...valid,
      PUBLIC_PORT: '8000',
      INTERNAL_PORT: '8001',
      RTSP_PUBLIC_PORT: '9554',
      MEDIAMTX_RTSP_URL: 'rtsp://media:8554',
      LOG_LEVEL: 'debug',
    });

    expect(config.publicPort).toBe(8000);
    expect(config.internalPort).toBe(8001);
    expect(config.rtspPublicUrl).toBe('rtsp://nvr.lan:9554');
    expect(config.mediamtxRtspUrl).toBe('rtsp://media:8554');
    expect(config.logLevel).toBe('debug');
  });

  it('names every missing variable', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    try {
      loadConfig({});
    } catch (error) {
      const message = (error as Error).message;
      for (const name of [
        'SKYBELL_USERNAME',
        'SKYBELL_PASSWORD',
        'INTERNAL_SECRET',
        'RTSP_PUBLIC_HOST',
      ]) {
        expect(message).toContain(name);
      }
    }
  });

  it('rejects a short internal secret', () => {
    expect(() => loadConfig({ ...valid, INTERNAL_SECRET: 'short' })).toThrow(/INTERNAL_SECRET/);
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ ...valid, PUBLIC_PORT: '99999' })).toThrow(/PUBLIC_PORT/);
  });

  it('never includes a value in the error message', () => {
    const env = { ...valid, INTERNAL_SECRET: 'tiny', PUBLIC_PORT: 'not-a-port' };

    expect(() => loadConfig(env)).toThrow(ConfigError);
    try {
      loadConfig(env);
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain('tiny');
      expect(message).not.toContain('not-a-port');
      expect(message).not.toContain(valid.SKYBELL_PASSWORD);
    }
  });
});
