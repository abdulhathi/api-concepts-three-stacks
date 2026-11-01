// The pictures on flow-diagram nodes: simple line icons on a 24 × 24 grid, drawn for this lab.
// Each kind also belongs to a color family, so people, the network edge, compute and data read apart at a glance.
import type { ReactNode } from 'react';
import type { NodeKind } from '../video/types';

export type Family = 'people' | 'edge' | 'compute' | 'data' | 'cache' | 'ops';

export const FAMILY: Record<NodeKind, Family> = {
  user: 'people', client: 'people', phone: 'people', browser: 'people',
  dns: 'edge', cdn: 'edge', lb: 'edge', gateway: 'edge', internet: 'edge', firewall: 'edge',
  server: 'compute', service: 'compute', worker: 'compute', function: 'compute', scheduler: 'compute', ai: 'compute',
  db: 'data', queue: 'data', stream: 'data', storage: 'data', search: 'data', file: 'data',
  cache: 'cache',
  monitor: 'ops', auth: 'ops', mail: 'ops', payment: 'ops', video: 'ops', map: 'ops', clock: 'ops',
};

export const ICONS: Record<NodeKind, ReactNode> = {
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.2 3.6-6.5 8-6.5s8 2.3 8 6.5" />
    </>
  ),
  client: (
    <>
      <rect x="4" y="4.5" width="16" height="11" rx="1.5" />
      <path d="M2 19.5h20M9.5 19.5l.8-2h3.4l.8 2" />
    </>
  ),
  phone: (
    <>
      <rect x="6.5" y="2" width="11" height="20" rx="2.2" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  browser: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M6 6.5h.01M8.5 6.5h.01M11 6.5h.01" />
    </>
  ),
  dns: (
    <>
      <path d="M12 2v20M5 4.5h11l3 3-3 3H5zM19 12.5H8l-3 3 3 3h11z" />
    </>
  ),
  cdn: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3.5 9h17M3.5 15h17" />
    </>
  ),
  lb: (
    <>
      <circle cx="12" cy="5" r="2.6" />
      <path d="M12 7.6v4.4M12 12l-7 5M12 12l7 5M12 12v5" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="12" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
    </>
  ),
  gateway: (
    <>
      <path d="M3 21V10l9-7 9 7v11" />
      <path d="M9 21v-7h6v7" />
    </>
  ),
  internet: <path d="M7 19h10.5a4.5 4.5 0 0 0 .6-8.96A6.5 6.5 0 0 0 5.6 11.5 3.8 3.8 0 0 0 7 19z" />,
  firewall: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M3 9.3h18M3 14.7h18M9 4v5.3M15 4v5.3M6 9.3v5.4M12 9.3v5.4M18 9.3v5.4M9 14.7V20M15 14.7V20" />
    </>
  ),
  server: (
    <>
      <rect x="4" y="3" width="16" height="8" rx="1.6" />
      <rect x="4" y="13" width="16" height="8" rx="1.6" />
      <path d="M7.5 7h.01M7.5 17h.01M11 7h5.5M11 17h5.5" />
    </>
  ),
  service: <path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z" />,
  worker: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
  function: (
    <>
      <path d="M6 3.5h3.5l8.5 17" />
      <path d="M12.3 10.5L6.5 20.5" />
    </>
  ),
  scheduler: (
    <>
      <rect x="3" y="4.5" width="18" height="16.5" rx="2" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4M8 13.5h2M14 13.5h2M8 17h2" />
    </>
  ),
  ai: (
    <>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
  db: (
    <>
      <ellipse cx="12" cy="5.5" rx="8" ry="3" />
      <path d="M4 5.5v13c0 1.66 3.58 3 8 3s8-1.34 8-3v-13" />
      <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
    </>
  ),
  cache: <path d="M13.5 2.5L5 13.5h6l-1 8 8.5-11h-6z" />,
  queue: (
    <>
      <rect x="2.5" y="7" width="5" height="10" rx="1" />
      <rect x="9.5" y="7" width="5" height="10" rx="1" />
      <rect x="16.5" y="7" width="5" height="10" rx="1" />
    </>
  ),
  stream: (
    <>
      <path d="M2.5 7h19M2.5 12h19M2.5 17h19" />
      <path d="M7 5v4M12 10v4M17 15v4" />
    </>
  ),
  storage: (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="2.6" />
      <path d="M4 6l1.6 13.2c.2 1.2 3 2.3 6.4 2.3s6.2-1.1 6.4-2.3L20 6" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5l5.5 5.5" />
    </>
  ),
  file: (
    <>
      <path d="M6 2.5h8.5L19 7v14.5H6z" />
      <path d="M14 2.5V7.5h5M9 12h7M9 15.5h7" />
    </>
  ),
  monitor: (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 15l4-4.5 3 3 6-7" />
    </>
  ),
  auth: (
    <>
      <rect x="5" y="10.5" width="14" height="10.5" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 14.5v3" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 6.5l8.5 6.5 8.5-6.5" />
    </>
  ),
  payment: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M2.5 10h19M6 15h4" />
    </>
  ),
  video: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M10 9v6l5-3z" />
    </>
  ),
  map: (
    <>
      <path d="M12 21.5s7-6.6 7-12a7 7 0 1 0-14 0c0 5.4 7 12 7 12z" />
      <circle cx="12" cy="9.5" r="2.6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.4 2" />
    </>
  ),
};
