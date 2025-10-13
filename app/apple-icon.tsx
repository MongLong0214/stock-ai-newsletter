import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = {
  width: 180,
  height: 180,
};
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#000',
          backgroundImage: 'linear-gradient(135deg, #000 0%, #001a00 100%)',
        }}
      >
        <div
          style={{
            fontSize: '72px',
            fontWeight: 'bold',
            color: '#00ff41',
            letterSpacing: '4px',
            textShadow: '0 0 20px #00ff41',
            display: 'flex',
          }}
        >
          SM
        </div>
        <div
          style={{
            fontSize: '16px',
            color: '#00ff41',
            marginTop: '8px',
            opacity: 0.8,
            display: 'flex',
          }}
        >
          STOCK MATRIX
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}