import { useRef, useState } from 'react';

/** The address other apps (e.g. Frigate) read the live stream from, with a Copy button (FR-13). */
export function RtspAddress({ url }: { url: string }) {
  const [status, setStatus] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const copy = async (): Promise<void> => {
    try {
      // Undefined on plain-http LAN pages (not a secure context); handled below.
      await navigator.clipboard.writeText(url);
      setStatus('Copied');
    } catch {
      input.current?.select();
      setStatus('Copy blocked by the browser: the address is selected, press Ctrl+C');
    }
  };

  return (
    <div className="tile">
      <label htmlFor="rtsp-address">RTSP address for Frigate and other apps</label>
      <div className="row">
        <input
          id="rtsp-address"
          ref={input}
          className="address"
          readOnly
          value={url}
          size={Math.min(url.length, 40)}
        />
        <button
          type="button"
          className="button"
          aria-label="Copy RTSP address"
          onClick={() => void copy()}
        >
          Copy
        </button>
        <span role="status" className="muted">
          {status}
        </span>
      </div>
    </div>
  );
}
