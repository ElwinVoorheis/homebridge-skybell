import type { ReactNode } from 'react';
import { DeviceList } from './screens/DeviceList';

export const routes: readonly { path: string; element: ReactNode }[] = [
  { path: '/', element: <DeviceList /> },
];
