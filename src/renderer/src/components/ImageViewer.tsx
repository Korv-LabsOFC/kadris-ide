import { useState } from 'react'
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'

export default function ImageViewer({ dataUrl, fileName }: { dataUrl: string; fileName: string }) {
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#111318' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        borderBottom: '1px solid #2a2d35',
        background: '#1a1d24',
        fontSize: 12,
        color: '#8b8fa3',
      }}>
        <button type="button" style={btnStyle} title="Zoom in" onClick={() => setScale(s => s + 0.25)}>
          <ZoomIn size={14} />
        </button>
        <button type="button" style={btnStyle} title="Zoom out" onClick={() => setScale(s => Math.max(0.25, s - 0.25))}>
          <ZoomOut size={14} />
        </button>
        <button type="button" style={btnStyle} title="Reset zoom" onClick={() => setScale(1)}>
          {Math.round(scale * 100)}%
        </button>
        <span style={{ color: '#444', margin: '0 2px' }}>|</span>
        <button type="button" style={btnStyle} title="Rotate left" onClick={() => setRotation(r => r - 90)}>
          <RotateCcw size={14} />
        </button>
        <button type="button" style={btnStyle} title="Rotate right" onClick={() => setRotation(r => r + 90)}>
          <RotateCcw size={14} style={{ transform: 'scaleX(-1)' }} />
        </button>
        <span style={{ flex: 1 }} />
        <span style={{ color: '#8b8fa3', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fileName}
        </span>
      </div>
      <div style={{
        flex: 1,
        overflow: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundImage: `
          linear-gradient(45deg, #1e2128 25%, transparent 25%),
          linear-gradient(-45deg, #1e2128 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, #1e2128 75%),
          linear-gradient(-45deg, transparent 75%, #1e2128 75%)
        `,
        backgroundSize: '16px 16px',
        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
        background: '#181b22',
        backgroundColor: '#14161c',
      }}>
        <img
          src={dataUrl}
          alt={fileName}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            transform: `scale(${scale}) rotate(${rotation}deg)`,
            transition: 'transform 0.15s ease',
          }}
        />
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 26,
  height: 26,
  border: 'none',
  borderRadius: 4,
  background: 'transparent',
  color: '#8b8fa3',
  cursor: 'pointer',
  fontSize: 11,
  padding: 0,
}
