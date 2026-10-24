import { useQuery } from '@tanstack/react-query';
import { fetchDevices } from './client';

export function useDevices() {
  return useQuery({ queryKey: ['devices'], queryFn: ({ signal }) => fetchDevices(signal) });
}
