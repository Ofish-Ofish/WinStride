import { useState, useCallback, type ReactNode } from 'react';

interface SidePanelProps {
  children: ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  className?: string;
}

export default function SidePanel({
  children,
  defaultWidth = 400,
  minWidth = 260,
  maxWidth = 1000,
  className = 'flex-shrink-0 bg-[#0d1117] border border-[#21262d] rounded-xl overflow-y-auto gf-scrollbar self-stretch',
}: SidePanelProps) {
  const [width, setWidth] = useState(defaultWidth);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      setWidth(Math.min(maxWidth, Math.max(minWidth, startW + delta)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [width, minWidth, maxWidth]);

  return (
    <>
      <div
        onMouseDown={onResizeStart}
        className="w-1.5 flex-shrink-0 cursor-col-resize group flex items-center justify-center hover:bg-[#58a6ff]/10 transition-colors"
      >
        <div className="w-[3px] h-10 rounded-full bg-[#30363d] group-hover:bg-[#58a6ff]/60 transition-colors" />
      </div>
      <div className={className} style={{ width }}>
        {children}
      </div>
    </>
  );
}
