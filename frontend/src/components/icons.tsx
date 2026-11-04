import React from "react"

export type IconProps = { className?: string ;size?: number | string }

export const Icon: Record<string, React.FC<IconProps>> = {
  Dashboard: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 15 15"
      fill="none"
    >
      <rect
        x="1"
        y="1"
        width="6"
        height="6"
        rx="1"
        fill="currentColor"
        opacity=".8"
      />
      <rect x="8" y="1" width="6" height="6" rx="1" fill="currentColor" />
      <rect x="1" y="8" width="6" height="6" rx="1" fill="currentColor" />
      <rect
        x="8"
        y="8"
        width="6"
        height="6"
        rx="1"
        fill="currentColor"
        opacity=".8"
      />
    </svg>
  ),
  Patients: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 15 15"
      fill="none"
    >
      <circle cx="7.5" cy="4.5" r="3" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M1.5 13c0-3.314 2.686-5 6-5s6 1.686 6 5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  Calendar: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 15 15"
      fill="none"
    >
      <rect
        x="1.5"
        y="2.5"
        width="12"
        height="11"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M5 1.5v2M10 1.5v2M1.5 6h12"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  ),
  Emergency: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 15 15"
      fill="none"
    >
      <path
        d="M7.5 1L9 5h4l-3.5 2.5 1.5 4L7.5 9 4 11.5l1.5-4L2 5h4L7.5 1z"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
      />
    </svg>
  ),
  Clinical: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 15 15"
      fill="none"
    >
      <path
        d="M7.5 2v11M2 7.5h11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  Inpatient: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 15 15"
      fill="none"
    >
      <rect
        x="1.5"
        y="6"
        width="12"
        height="6"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M4 6V4a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v2"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle cx="4.5" cy="9.5" r="1" fill="currentColor" />
    </svg>
  ),
  Nursing: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 15 15"
      fill="none"
    >
      <path
        d="M7.5 1.5a6 6 0 1 0 0 12 6 6 0 0 0 0-12z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M7.5 4.5v3l2 1.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  ),
  Lab: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 15 15"
      fill="none"
    >
      <path
        d="M5.5 1.5v5L2 12.5h11L9.5 6.5v-5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 1.5h7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="6" cy="9.5" r="1" fill="currentColor" />
    </svg>
  ),
  Radiology: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 15 15"
      fill="none"
    >
      <circle
        cx="7.5"
        cy="7.5"
        r="5.5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle
        cx="7.5"
        cy="7.5"
        r="2.5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M7.5 2v1M7.5 12v1M2 7.5h1M12 7.5h1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  ),
  Pharmacy: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 15 15"
      fill="none"
    >
      <rect
        x="2"
        y="3"
        width="11"
        height="9"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M5 7.5h5M7.5 5v5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  Surgery: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 15 15"
      fill="none"
    >
      <path
        d="M2 13L7.5 2l5.5 11"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 9h7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  ),
  Billing: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 15 15"
      fill="none"
    >
      <rect
        x="1.5"
        y="3"
        width="12"
        height="9"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M1.5 6h12" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M4.5 9.5h3M11 9.5h-.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  Insurance: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 15 15"
      fill="none"
    >
      <path
        d="M7.5 1.5L2 4v4c0 3.5 2.5 5.5 5.5 6 3-0.5 5.5-2.5 5.5-6V4L7.5 1.5z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M5 7.5l1.5 1.5 3-3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Reports: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 15 15"
      fill="none"
    >
      <rect
        x="2"
        y="1.5"
        width="11"
        height="12"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M4.5 5h6M4.5 7.5h6M4.5 10h4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  ),
  Analytics: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 15 15"
      fill="none"
    >
      <path
        d="M2 11.5l3.5-4 3 2.5 4.5-6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Admin: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 15 15"
      fill="none"
    >
      <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M7.5 1v1.5M7.5 12.5V14M1 7.5h1.5M12.5 7.5H14M2.6 2.6l1.1 1.1M11.3 11.3l1.1 1.1M2.6 12.4l1.1-1.1M11.3 3.7l1.1-1.1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  ),
  Search: ({ className, size }) => (
    <svg
      className={className}
      width={size || "14"}
      height={size || "14"}
      viewBox="0 0 14 14"
      fill="none"
    >
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M9.5 9.5L12.5 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  Bell: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 15 15"
      fill="none"
    >
      <path
        d="M7.5 1.5a5 5 0 0 0-5 5v3l-1 1.5h12l-1-1.5v-3a5 5 0 0 0-5-5z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M6 12.5a1.5 1.5 0 0 0 3 0"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  ),
  Message: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 15 15"
      fill="none"
    >
      <rect
        x="1.5"
        y="2.5"
        width="12"
        height="8"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M4 13l1.5-2.5h5L12 13"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Plus: ({ className, size }) => (
    <svg
      className={className}
      width={size || "13"}
      height={size || "13"}
      viewBox="0 0 13 13"
      fill="none"
    >
      <path
        d="M6.5 1v11M1 6.5h11"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  ),
  ChevronDown: ({ className, size }) => (
    <svg
      className={className}
      width={size || "12"}
      height={size || "12"}
      viewBox="0 0 12 12"
      fill="none"
    >
      <path
        d="M2.5 4.5l3.5 3 3.5-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  ChevronRight: ({ className, size }) => (
    <svg
      className={className}
      width={size || "11"}
      height={size || "11"}
      viewBox="0 0 11 11"
      fill="none"
    >
      <path
        d="M4 2.5l3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Alert: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 15 15"
      fill="none"
    >
      <path
        d="M7.5 1L14 13H1L7.5 1z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 6v3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="7.5" cy="11" r=".75" fill="currentColor" />
    </svg>
  ),
  X: ({ className, size }) => (
    <svg
      className={className}
      width={size || "12"}
      height={size || "12"}
      viewBox="0 0 12 12"
      fill="none"
    >
      <path
        d="M2 2l8 8M10 2l-8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  User: ({ className, size }) => (
    <svg
      className={className}
      width={size || "14"}
      height={size || "14"}
      viewBox="0 0 14 14"
      fill="none"
    >
      <circle cx="7" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M1.5 12c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  ),
  Filter: ({ className, size }) => (
    <svg
      className={className}
      width={size || "13"}
      height={size || "13"}
      viewBox="0 0 13 13"
      fill="none"
    >
      <path
        d="M1.5 3h10l-4 5v3.5L5.5 10V8L1.5 3z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Download: ({ className, size }) => (
    <svg
      className={className}
      width={size || "13"}
      height={size || "13"}
      viewBox="0 0 13 13"
      fill="none"
    >
      <path
        d="M6.5 1v8M3.5 6l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M1.5 11.5h10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  Refresh: ({ className, size }) => (
    <svg
      className={className}
      width={size || "13"}
      height={size || "13"}
      viewBox="0 0 13 13"
      fill="none"
    >
      <path
        d="M11 6.5a4.5 4.5 0 1 1-1.2-3.1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M9.8 1.5v2.5h-2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Cmd: ({ className, size }) => (
    <svg
      className={className}
      width={size || "13"}
      height={size || "13"}
      viewBox="0 0 13 13"
      fill="none"
    >
      <rect
        x="1.5"
        y="1.5"
        width="10"
        height="10"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M4.5 4.5h4v4h-4v-4z" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.5 6.5h4" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  FlaskConical: ({ className, size }) => (
    <svg
      className={className}
      width={size || "13"}
      height={size || "13"}
      viewBox="0 0 13 13"
      fill="none"
    >
      <path
        d="M5 2h3M4 2v3.5L1.5 10.5a1 1 0 0 0 .9 1.5h8.2a1 1 0 0 0 .9-1.5L9 5.5V2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Bed: ({ className, size }) => (
    <svg
      className={className}
      width={size || "13"}
      height={size || "13"}
      viewBox="0 0 13 13"
      fill="none"
    >
      <rect
        x="1"
        y="6.5"
        width="11"
        height="4"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M1 10.5v1.5M12 10.5v1.5M1 6.5V3.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <rect
        x="5"
        y="4"
        width="7"
        height="2.5"
        rx=".8"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  ),
  Stethoscope: ({ className, size }) => (
    <svg
      className={className}
      width={size || "13"}
      height={size || "13"}
      viewBox="0 0 13 13"
      fill="none"
    >
      <path
        d="M3 2.5C3 3.9 4.1 5 5.5 5S8 3.9 8 2.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M5.5 5v3C5.5 9.9 7 11.5 9 11.5s3.5-1.6 3.5-3.5V6.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="12.5" cy="6" r="1" stroke="currentColor" strokeWidth="1.1" />
      <path
        d="M2.5 2.5v2.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  ),
  Eye: ({ className, size }) => (
    <svg
      className={className}
      width={size || "13"}
      height={size || "13"}
      viewBox="0 0 13 13"
      fill="none"
    >
      <path
        d="M1 6.5C2.5 3.5 5.5 2 6.5 2s4 1.5 5.5 4.5C10.5 10 7.5 11 6.5 11S2.5 10 1 6.5z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle
        cx="6.5"
        cy="6.5"
        r="1.5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  ),
  TrendUp: ({ className, size }) => (
    <svg
      className={className}
      width={size || "13"}
      height={size || "13"}
      viewBox="0 0 13 13"
      fill="none"
    >
      <path
        d="M1.5 9.5l4-5 2.5 2 4-4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 2h3v3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Maximize: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 15 15"
      fill="none"
    >
      <path
        d="M3 5V3h2M12 5V3h-2M3 10v2h2M12 10v2h-2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Minimize: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 15 15"
      fill="none"
    >
      <path
        d="M5 3v2H3M10 3v2h2M5 12v-2H3M10 12v-2h2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Heart: ({ className, size }) => (
    <svg
      className={className}
      width={size || "13"}
      height={size || "13"}
      viewBox="0 0 13 13"
      fill="none"
    >
      <path
        d="M6.5 11.5L1.5 6.5C0.3 5.3 0.3 3.3 1.5 2.1C2.7 0.9 4.7 0.9 5.9 2.1L6.5 2.7L7.1 2.1C8.3 0.9 10.3 0.9 11.5 2.1C12.7 3.3 12.7 5.3 11.5 6.5L6.5 11.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Clock: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  Activity: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  Rupee: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 3h12" />
      <path d="M6 8h12" />
      <path d="M6 13h5a4 4 0 0 0 0-8H6" />
      <path d="M6 13l9 8" />
    </svg>
  ),
  Check: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Discharge: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  Ambulance: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="6" width="14" height="11" rx="2" />
      <path d="M15 9h4l3 4v4h-7V9z" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M8 10h4" />
      <path d="M10 8v4" />
    </svg>
  ),
  Pause: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  ),
  Play: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
    </svg>
  ),
  Printer: ({ className, size }) => (
    <svg
      className={className}
      width={size || "15"}
      height={size || "15"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  ),
}
