import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = {
  width: 192,
  height: 192,
};
export const contentType = 'image/png';

export default function Icon192() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000000',
        }}
      >
        <svg
          width="192"
          height="192"
          viewBox="0 0 512 512"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="grad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" style={{ stopColor: '#00FF41', stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: '#10b981', stopOpacity: 1 }} />
            </linearGradient>
          </defs>

          <rect width="512" height="512" fill="#000000" />

          <path
            d="M 80 384 L 128 320 L 176 368 L 224 256 L 272 304 L 320 176 L 368 224 L 432 112 L 432 432 L 80 432 Z"
            fill="url(#grad)"
            opacity="0.15"
          />

          <path
            d="M 80 384 L 128 320 L 176 368 L 224 256 L 272 304 L 320 176 L 368 224 L 432 112"
            stroke="url(#grad)"
            strokeWidth="48"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <circle cx="432" cy="112" r="40" fill="#00FF41" opacity="1" />
          <circle cx="432" cy="112" r="64" fill="none" stroke="#00FF41" strokeWidth="12" opacity="0.4" />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}