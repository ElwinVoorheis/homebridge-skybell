import type { ReactNode } from 'react';
import { DeviceList } from './screens/DeviceList';
import { DeviceScreen } from './screens/DeviceScreen';

export const routes: readonly { path: string; element: ReactNode }[] = [
  { path: '/', element: <DeviceList /> },
  { path: '/devices/:id', element: <DeviceScreen /> },
];
