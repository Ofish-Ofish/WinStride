/* ------------------------------------------------------------------ */
/*  Shared slider + scrollbar CSS — injected once per app lifecycle    */
/* ------------------------------------------------------------------ */

const SLIDER_CSS = `
.gf-slider{-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer;height:20px;width:100%;position:relative;z-index:2}
.gf-slider::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#58a6ff;border:2px solid #0d1117;box-shadow:0 0 8px rgba(88,166,255,0.35);margin-top:-6px;transition:box-shadow .15s}
.gf-slider::-webkit-slider-thumb:hover{box-shadow:0 0 12px rgba(88,166,255,0.55)}
.gf-slider::-webkit-slider-runnable-track{height:4px;background:transparent;border-radius:2px}
.gf-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#58a6ff;border:2px solid #0d1117;box-shadow:0 0 8px rgba(88,166,255,0.35)}
.gf-slider::-moz-range-track{height:4px;background:transparent;border-radius:2px;border:none}
.gf-slider-dual{-webkit-appearance:none;appearance:none;background:transparent;height:20px;width:100%;position:absolute;top:0;left:0;pointer-events:none;z-index:3}
.gf-slider-dual::-webkit-slider-thumb{-webkit-appearance:none;pointer-events:auto;width:16px;height:16px;border-radius:50%;background:#58a6ff;border:2px solid #0d1117;box-shadow:0 0 8px rgba(88,166,255,0.35);margin-top:-6px;transition:box-shadow .15s;cursor:pointer}
.gf-slider-dual::-webkit-slider-thumb:hover{box-shadow:0 0 12px rgba(88,166,255,0.55)}
.gf-slider-dual::-webkit-slider-runnable-track{height:4px;background:transparent;border-radius:2px}
.gf-slider-dual::-moz-range-thumb{pointer-events:auto;width:14px;height:14px;border-radius:50%;background:#58a6ff;border:2px solid #0d1117;box-shadow:0 0 8px rgba(88,166,255,0.35);cursor:pointer}
.gf-slider-dual::-moz-range-track{height:4px;background:transparent;border-radius:2px;border:none}
.gf-scrollbar::-webkit-scrollbar{width:6px}
.gf-scrollbar::-webkit-scrollbar-track{background:transparent}
.gf-scrollbar::-webkit-scrollbar-thumb{background:#30363d;border-radius:3px}
.gf-scrollbar::-webkit-scrollbar-thumb:hover{background:#3d444d}
`;

let injected = false;

export function injectFilterStyles() {
  if (injected) return;
  injected = true;
  const style = document.createElement('style');
  style.textContent = SLIDER_CSS;
  document.head.appendChild(style);
}
