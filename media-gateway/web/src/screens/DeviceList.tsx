import { Link } from 'react-router-dom';
import { useDevices } from '../api/queries';
import { ErrorMessage, Loading, messageOf } from './states';

/** Lists every device; each links to its device screen (FR-9). */
export function DeviceList() {
  const devices = useDevices();

  return (
    <main className="page">
      <header className="page-header">
        <h1>Doorbells</h1>
      </header>
      {devices.isPending && <Loading label="Loading devices…" />}
      {devices.isError && (
        <ErrorMessage message={messageOf(devices.error)} onRetry={() => void devices.refetch()} />
      )}
      {devices.isSuccess && devices.data.length === 0 && <p className="muted">No devices found</p>}
      {devices.isSuccess && devices.data.length > 0 && (
        <ul className="tile-grid">
          {devices.data.map((device) => (
            <li key={device.id} className="tile">
              <h2>
                <Link to={`/devices/${encodeURIComponent(device.id)}`}>{device.name}</Link>
              </h2>
              <p className="muted">{device.mediaKinds.join(' · ')}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
