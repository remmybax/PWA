// Square-cap, miter-join line icons taken from the design files.

type P = { size?: number; strokeWidth?: number; label?: string; color?: string };

function Svg({ size = 18, strokeWidth = 2, label, color = "currentColor", children }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    >
      {children}
    </svg>
  );
}

export const ListIcon = (p: P) => (
  <Svg {...p}>
    <path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" />
  </Svg>
);
export const FlashIcon = (p: P) => (
  <Svg {...p}>
    <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
  </Svg>
);
export const ChevronLeft = (p: P) => (
  <Svg {...p}>
    <path d="m15 18-6-6 6-6" />
  </Svg>
);
export const ChevronRight = (p: P) => (
  <Svg {...p}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);
export const WarnIcon = (p: P) => (
  <Svg strokeWidth={2.2} {...p}>
    <path d="M12 9v4" /><path d="M12 17h.01" />
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
  </Svg>
);
export const CheckIcon = (p: P) => (
  <Svg strokeWidth={2.5} {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);
export const ArrowRight = (p: P) => (
  <Svg strokeWidth={2.2} {...p}>
    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
  </Svg>
);
export const EyeIcon = (p: P) => (
  <Svg strokeWidth={2.2} {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
  </Svg>
);
export const CameraIcon = (p: P) => (
  <Svg {...p}>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" />
  </Svg>
);
export const DownloadIcon = (p: P) => (
  <Svg {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" />
  </Svg>
);
export const ImageIcon = (p: P) => (
  <Svg strokeWidth={1.8} {...p}>
    <rect x="3" y="3" width="18" height="18" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
  </Svg>
);
export const UploadIcon = (p: P) => (
  <Svg {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" />
  </Svg>
);
export const CloseIcon = (p: P) => (
  <Svg {...p}>
    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
  </Svg>
);
export const TruckIcon = (p: P) => (
  <Svg {...p}>
    <path d="M1 4h13v12H1z" /><path d="M14 8h4l4 4v4h-8z" /><circle cx="5.5" cy="18.5" r="2" /><circle cx="17.5" cy="18.5" r="2" />
  </Svg>
);
export const TicketIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 3h16v18l-3-2-3 2-2-2-2 2-3-2-3 2z" /><path d="M8 8h8" /><path d="M8 12h8" /><path d="M8 16h5" />
  </Svg>
);
export const QrIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 3h7v7H3z" /><path d="M14 3h7v7h-7z" /><path d="M3 14h7v7H3z" /><path d="M14 14h3v3h-3z" /><path d="M20 14v.01" /><path d="M14 20h.01" /><path d="M20 20h1v1" /><path d="M17 17h4" />
  </Svg>
);
export const PrintIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6 9V2h12v7" /><path d="M6 18H2v-9h20v9h-4" /><path d="M6 14h12v8H6z" />
  </Svg>
);
export const LockIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 11h16v11H4z" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Svg>
);
export const WrenchIcon = (p: P) => (
  <Svg {...p}>
    <path d="M14.7 6.3a4 4 0 0 0 5 5L22 14l-8 8-2.3-2.3a4 4 0 0 0-5-5L2 10l8-8z" />
  </Svg>
);
export const ShareIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 12v8h16v-8" /><path d="m16 6-4-4-4 4" /><path d="M12 2v13" />
  </Svg>
);
export const PlusIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14" /><path d="M5 12h14" />
  </Svg>
);
export const TrashIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 6h18" /><path d="M8 6V3h8v3" /><path d="M5 6l1 15h12l1-15" />
  </Svg>
);
