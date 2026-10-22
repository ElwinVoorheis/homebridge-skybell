import { Link, useParams } from 'react-router-dom';
import { useDevices } from '../api/queries';
import { LivePlayer } from '../player/LivePlayer';
import { RtspAddress } from './RtspAddress';
import { Snapshot } from './Snapshot';
import { ErrorMessage, Loading, messageOf } from './states';

/** One device: live video, RTSP address and snapshot (FR-10, FR-11, FR-13). */
export function DeviceScreen() {
  const { id } = useParams();
  const devices = useDevices();
  const device = devices.data?.find((d) => d.id === id);

  return (
    <main className="page">
      <header className="page-header">
        <Link to="/">← All doorbells</Link>
      </header>
      {devices.isPending && <Loading label="Loading device…" />}
      {devices.isError && (
        <ErrorMessage message={messageOf(devices.error)} onRetry={() => void devices.refetch()} />
      )}
      {devices.isSuccess && !device && <p className="error">Device not found</p>}
      {device && (
        <>
          <h1>{device.name}</h1>
          <div className="device-layout">
            {device.rtspUrl && (
              <div>
                <LivePlayer deviceId={device.id} deviceName={device.name} />
                <RtspAddress url={device.rtspUrl} />
              </div>
            )}
            {device.mediaKinds.includes('photo') && (
              <Snapshot deviceId={device.id} deviceName={device.name} />
            )}
          </div>
        </>
      )}
    </main>
  );
}
