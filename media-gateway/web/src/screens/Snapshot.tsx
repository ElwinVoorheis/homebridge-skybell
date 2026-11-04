import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { fetchPhoto } from '../api/client';
import { Loading } from './states';

/** Latest snapshot, loaded on open and refreshed only on request (FR-11). */
export function Snapshot({ deviceId, deviceName }: { deviceId: string; deviceName: string }) {
  const photo = useQuery({
    queryKey: ['photo', deviceId],
    queryFn: () => fetchPhoto(deviceId),
    // Each fetch costs a slow SkyBell round trip; only the button refreshes.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const src = useObjectUrl(photo.data);

  return (
    <section className="tile" aria-labelledby="snapshot-heading">
      <h2 id="snapshot-heading">Snapshot</h2>
      <div className="frame">
        {src ? (
          <img src={src} alt={`Latest snapshot from ${deviceName}`} />
        ) : photo.isPending ? (
          <Loading label="Loading snapshot…" />
        ) : null}
      </div>
      {photo.isError && (
        <p role="alert" className="error">
          {photo.data ? 'Could not refresh snapshot' : 'Could not load snapshot'}
        </p>
      )}
      <div className="row">
        <button
          type="button"
          className="button"
          onClick={() => void photo.refetch()}
          disabled={photo.isFetching}
        >
          Refresh snapshot
        </button>
      </div>
    </section>
  );
}

function useObjectUrl(blob: Blob | undefined): string | undefined {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob]);
  // Frees the previous image's memory once a newer snapshot replaces it.
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url;
}
