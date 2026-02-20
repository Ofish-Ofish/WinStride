// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CyStylesheet = any;

// Simple 4-pane Windows logo as SVG data URI (white on transparent)
const WIN_LOGO = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
    <rect x="10" y="10" width="36" height="36" rx="3" fill="white"/>
    <rect x="54" y="10" width="36" height="36" rx="3" fill="white"/>
    <rect x="10" y="54" width="36" height="36" rx="3" fill="white"/>
    <rect x="54" y="54" width="36" height="36" rx="3" fill="white"/>
  </svg>`
)}`;

// Cast needed: Cytoscape runtime supports gradient arrays + shadow props
// but @types/cytoscape's StylesheetStyle is too narrow
export const graphStyles: CyStylesheet[] = [
  // Base node
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      color: '#e6edf3',
      'font-size': '10px',
      'font-family': 'Inter, system-ui, sans-serif',
      'font-weight': 400,
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 7,
      'text-outline-color': '#010409',
      'text-outline-width': 2.5,
      'text-outline-opacity': 1,
      'min-zoomed-font-size': 6,
      'overlay-opacity': 0,
      'border-width': 1,
      'background-opacity': 1,
      'transition-property': 'opacity, border-width, border-color, background-color',
      'transition-duration': 180,
    },
  },

  // User nodes — blue circles with radial gradient
  {
    selector: 'node[type = "user"]',
    style: {
      shape: 'ellipse',
      'background-color': '#1f6feb',
      'background-fill': 'radial-gradient',
      'background-gradient-stop-colors': '#79c0ff #3b82f6 #1a56db',
      'background-gradient-stop-positions': '0% 50% 100%',
      'border-color': '#58a6ff',
      'border-opacity': 0.5,
      width: 'mapData(logonCount, 1, 50, 24, 50)',
      height: 'mapData(logonCount, 1, 50, 24, 50)',
    },
  },

  // Privileged user — red-pink diamond, radial gradient
  {
    selector: 'node[type = "user"][?privileged]',
    style: {
      shape: 'diamond',
      'background-color': '#da3633',
      'background-fill': 'radial-gradient',
      'background-gradient-stop-colors': '#ffa198 #f85149 #b62324',
      'background-gradient-stop-positions': '0% 50% 100%',
      'border-color': '#f97583',
      'border-opacity': 0.6,
      width: 'mapData(logonCount, 1, 50, 30, 56)',
      height: 'mapData(logonCount, 1, 50, 30, 56)',
    },
  },

  // Machine nodes — rounded square with Windows logo
  {
    selector: 'node[type = "machine"]',
    style: {
      shape: 'round-rectangle',
      'background-color': '#2ea043',
      'border-color': '#3fb950',
      'border-opacity': 0.5,
      width: 'mapData(logonCount, 1, 100, 36, 64)',
      height: 'mapData(logonCount, 1, 100, 36, 64)',
      'background-image': WIN_LOGO,
      'background-width': '75%',
      'background-height': '75%',
      'background-image-opacity': 0.4,
      'font-weight': 600,
      'font-size': '11px',
    },
  },

  // Edges — bezier auto-fans parallel edges between same node pair
  {
    selector: 'edge',
    style: {
      label: 'data(logonTypeLabel)',
      color: '#c9d1d9',
      'font-size': '10px',
      'font-family': 'Inter, system-ui, sans-serif',
      'text-outline-color': '#010409',
      'text-outline-width': 2,
      'text-outline-opacity': 0.9,
      'text-rotation': 'autorotate',
      'text-margin-y': -8,
      'min-zoomed-font-size': 6,
      width: 'mapData(logonCount, 1, 50, 1.5, 5)',
      'line-color': '#30363d',
      'target-arrow-color': '#484f58',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.6,
      'curve-style': 'bezier',
      'control-point-step-size': 40,
      opacity: 0.55,
      'overlay-padding': 8,
      'transition-property': 'opacity, line-color, width',
      'transition-duration': 180,
    },
  },

  // Failed logon edges — red dashed
  {
    selector: 'edge[?isFailed]',
    style: {
      'line-color': '#6e1a1a',
      'target-arrow-color': '#8b2525',
      'line-style': 'dashed',
      'line-dash-pattern': [6, 3],
    },
  },
  {
    selector: 'edge.highlighted[?isFailed]',
    style: {
      'line-color': '#f85149',
      'target-arrow-color': '#f85149',
    },
  },

  // Highlighted — selected + neighbors glow in their own color
  {
    selector: 'node.highlighted',
    style: {
      'border-width': 2.5,
      'border-opacity': 1,
      'z-index': 10,
      color: '#ffffff',
      'font-weight': 600,
      'text-outline-width': 3,
    },
  },
  {
    selector: 'node.highlighted[type = "user"]',
    style: {
      'border-color': '#79c0ff',
      'shadow-blur': 20,
      'shadow-color': '#58a6ff',
      'shadow-opacity': 0.45,
      'shadow-offset-x': 0,
      'shadow-offset-y': 0,
    },
  },
  {
    selector: 'node.highlighted[type = "user"][?privileged]',
    style: {
      'border-color': '#ffa198',
      'shadow-blur': 20,
      'shadow-color': '#f97583',
      'shadow-opacity': 0.45,
      'shadow-offset-x': 0,
      'shadow-offset-y': 0,
    },
  },
  {
    selector: 'node.highlighted[type = "machine"]',
    style: {
      'border-color': '#56d364',
      'shadow-blur': 22,
      'shadow-color': '#3fb950',
      'shadow-opacity': 0.45,
      'shadow-offset-x': 0,
      'shadow-offset-y': 0,
    },
  },
  {
    selector: 'edge.highlighted',
    style: {
      'line-color': '#6e7681',
      'target-arrow-color': '#6e7681',
      opacity: 0.9,
      width: 'mapData(logonCount, 1, 50, 1.5, 5)',
      'z-index': 10,
    },
  },

  // Dimmed — ghost outline
  {
    selector: 'node.dimmed',
    style: {
      'background-opacity': 0.05,
      'border-opacity': 0.1,
      'text-opacity': 0.08,
      'shadow-opacity': 0,
    },
  },
  {
    selector: 'edge.dimmed',
    style: {
      opacity: 0.04,
    },
  },
];
