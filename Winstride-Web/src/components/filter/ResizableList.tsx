import { useState, useCallback } from 'react';

export default function ResizableList({
  children,
  defaultHeight,
  minHeight = 60,
}: {
  children: React.ReactNode;
  defaultHeight: number;
  minHeight?: number;
}) {
  const [height, setHeight] = useState(defaultHeight);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = height;
      const onMove = (ev: MouseEvent) => {
        setHeight(Math.max(minHeight, startH + ev.clientY - startY));
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [height, minHeight],
  );

  return (
    <div>
      <div
        className="overflow-y-auto gf-scrollbar pr-1"
        style={{ height }}
      >
        {children}
      </div>
      <div
        onMouseDown={onDragStart}
        className="flex items-center justify-center h-3 cursor-row-resize group"
      >
        <div className="w-8 h-[3px] rounded-full bg-[#21262d] group-hover:bg-[#58a6ff]/50 transition-colors" />
      </div>
    </div>
  );
}
