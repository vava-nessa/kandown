/**
 * @file Inline SVG icon set
 * @description Centralizes small stroke icons used by the Kandown web UI.
 *
 * 📖 Icons are local React components instead of an external dependency so the
 * published single-file app stays compact and fully self-contained.
 *
 * @functions
 *  → Icon.* — named SVG icon components with shared stroke defaults
 *
 * @exports Icon
 */

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const defaults: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export const Icon = {
  Plus: ({ size = 14, ...p }: IconProps) => (
    <svg {...defaults} width={size} height={size} {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  X: ({ size = 14, ...p }: IconProps) => (
    <svg {...defaults} width={size} height={size} {...p}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
  Search: ({ size = 14, ...p }: IconProps) => (
    <svg {...defaults} width={size} height={size} {...p}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  ),
  Refresh: ({ size = 14, ...p }: IconProps) => (
    <svg {...defaults} width={size} height={size} {...p}>
      <path d="M21 12a9 9 0 0 1-15 6.5L3 16m0 0v5m0-5h5M3 12a9 9 0 0 1 15-6.5L21 8m0 0V3m0 5h-5" />
    </svg>
  ),
  Trash: ({ size = 14, ...p }: IconProps) => (
    <svg {...defaults} width={size} height={size} {...p}>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14" />
    </svg>
  ),
  ChevronDown: ({ size = 14, ...p }: IconProps) => (
    <svg {...defaults} width={size} height={size} {...p}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  Command: ({ size = 14, ...p }: IconProps) => (
    <svg {...defaults} width={size} height={size} {...p}>
      <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
    </svg>
  ),
  LayoutBoard: ({ size = 14, ...p }: IconProps) => (
    <svg {...defaults} width={size} height={size} {...p}>
      <rect x="3" y="3" width="7" height="18" rx="1" />
      <rect x="14" y="3" width="7" height="12" rx="1" />
    </svg>
  ),
  LayoutList: ({ size = 14, ...p }: IconProps) => (
    <svg {...defaults} width={size} height={size} {...p}>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  ),
  Density: ({ size = 14, ...p }: IconProps) => (
    <svg {...defaults} width={size} height={size} {...p}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  Folder: ({ size = 14, ...p }: IconProps) => (
    <svg {...defaults} width={size} height={size} {...p}>
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  ),
  Check: ({ size = 14, ...p }: IconProps) => (
    <svg {...defaults} width={size} height={size} {...p}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  Circle: ({ size = 14, ...p }: IconProps) => (
    <svg {...defaults} width={size} height={size} {...p}>
      <circle cx="12" cy="12" r="9" />
    </svg>
  ),
  Arrow: ({ size = 14, ...p }: IconProps) => (
    <svg {...defaults} width={size} height={size} {...p}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  ),
  ArrowLeft: ({ size = 14, ...p }: IconProps) => (
    <svg {...defaults} width={size} height={size} {...p}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  ),
  Settings: ({ size = 14, ...p }: IconProps) => (
    <svg {...defaults} width={size} height={size} {...p}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  LinkBreak: ({ size = 14, ...p }: IconProps) => (
    <svg {...defaults} width={size} height={size} {...p}>
      <path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71" />
      <path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71" />
      <line x1="8" y1="2" x2="8" y2="5" />
      <line x1="2" y1="8" x2="5" y2="8" />
      <line x1="16" y1="19" x2="16" y2="22" />
      <line x1="19" y1="16" x2="22" y2="16" />
    </svg>
  ),
};
