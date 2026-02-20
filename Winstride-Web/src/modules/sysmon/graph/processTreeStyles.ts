// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CyStylesheet = any;

export const processTreeStyles: CyStylesheet[] = [
  // Base node
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      color: '#e6edf3',
      'font-size': '12px',
      'font-family': 'Inter, system-ui, sans-serif',
      'font-weight': 500,
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 8,
      'text-outline-color': '#010409',
      'text-outline-width': 2.5,
      'text-outline-opacity': 1,
      'min-zoomed-font-size': 0,
      'overlay-opacity': 0,
      'border-width': 1,
      'background-opacity': 1,
      'transition-property': 'opacity, border-width, border-color',
      'transition-duration': 180,
    },
  },

  // Process nodes — Medium integrity (default blue)
  {
    selector: 'node[type = "process"]',
    style: {
      shape: 'ellipse',
      'background-color': '#1f6feb',
      'background-fill': 'radial-gradient',
      'background-gradient-stop-colors': '#79c0ff #3b82f6 #1a56db',
      'background-gradient-stop-positions': '0% 50% 100%',
      'border-color': '#58a6ff',
      'border-opacity': 0.5,
      width: 30,
      height: 30,
    },
  },

  // Process nodes — High integrity (yellow)
  {
    selector: 'node[type = "process"][integrityLevel = "High"]',
    style: {
      'background-color': '#d29922',
      'background-fill': 'radial-gradient',
      'background-gradient-stop-colors': '#fde68a #eab308 #a16207',
      'background-gradient-stop-positions': '0% 50% 100%',
      'border-color': '#fde68a',
      'border-opacity': 0.6,
      width: 34,
      height: 34,
    },
  },

  // Process nodes — System integrity (red)
  {
    selector: 'node[type = "process"][integrityLevel = "System"]',
    style: {
      'background-color': '#da3633',
      'background-fill': 'radial-gradient',
      'background-gradient-stop-colors': '#ffa198 #f85149 #b62324',
      'background-gradient-stop-positions': '0% 50% 100%',
      'border-color': '#f97583',
      'border-opacity': 0.6,
      width: 34,
      height: 34,
    },
  },

  // Process nodes — Low integrity (gray)
  {
    selector: 'node[type = "process"][integrityLevel = "Low"]',
    style: {
      'background-color': '#484f58',
      'background-fill': 'radial-gradient',
      'background-gradient-stop-colors': '#8b949e #6e7681 #484f58',
      'background-gradient-stop-positions': '0% 50% 100%',
      'border-color': '#8b949e',
      'border-opacity': 0.5,
      width: 26,
      height: 26,
    },
  },

  // Network nodes — diamond, green
  {
    selector: 'node[type = "network"]',
    style: {
      shape: 'diamond',
      'background-color': '#238636',
      'background-fill': 'radial-gradient',
      'background-gradient-stop-colors': '#56d364 #3fb950 #238636',
      'background-gradient-stop-positions': '0% 50% 100%',
      'border-color': '#3fb950',
      'border-opacity': 0.5,
      width: 24,
      height: 24,
      'font-size': '10px',
    },
  },

  // File nodes — square, orange
  {
    selector: 'node[type = "file"]',
    style: {
      shape: 'round-rectangle',
      'background-color': '#d29922',
      'background-fill': 'radial-gradient',
      'background-gradient-stop-colors': '#f0a050 #f0883e #bd5d00',
      'background-gradient-stop-positions': '0% 50% 100%',
      'border-color': '#f0883e',
      'border-opacity': 0.5,
      width: 24,
      height: 24,
      'font-size': '10px',
    },
  },

  // Edges — spawned (parent→child)
  {
    selector: 'edge[type = "spawned"]',
    style: {
      'line-color': '#4a5568',
      'target-arrow-color': '#6b7280',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.6,
      'curve-style': 'bezier',
      width: 2,
      opacity: 0.8,
      'transition-property': 'opacity, line-color',
      'transition-duration': 180,
    },
  },

  // Edges — connected (process→network)
  {
    selector: 'edge[type = "connected"]',
    style: {
      'line-color': '#238636',
      'target-arrow-color': '#3fb950',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.5,
      'curve-style': 'bezier',
      'line-style': 'dashed',
      'line-dash-pattern': [6, 3],
      width: 1.5,
      opacity: 0.7,
      'transition-property': 'opacity, line-color',
      'transition-duration': 180,
    },
  },

  // Edges — created (process→file)
  {
    selector: 'edge[type = "created"]',
    style: {
      'line-color': '#bd5d00',
      'target-arrow-color': '#f0883e',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.5,
      'curve-style': 'bezier',
      'line-style': 'dashed',
      'line-dash-pattern': [4, 4],
      width: 1.5,
      opacity: 0.7,
      'transition-property': 'opacity, line-color',
      'transition-duration': 180,
    },
  },

  // Highlighted — selected + neighbors
  {
    selector: 'node.highlighted',
    style: {
      'border-width': 2.5,
      'border-opacity': 1,
      'z-index': 10,
      'font-weight': 700,
      'text-outline-width': 3,
    },
  },
  {
    selector: 'node.highlighted[type = "process"]',
    style: {
      'border-color': '#79c0ff',
      'shadow-blur': 18,
      'shadow-color': '#58a6ff',
      'shadow-opacity': 0.4,
      'shadow-offset-x': 0,
      'shadow-offset-y': 0,
    },
  },
  {
    selector: 'node.highlighted[type = "network"]',
    style: {
      'border-color': '#56d364',
      'shadow-blur': 18,
      'shadow-color': '#3fb950',
      'shadow-opacity': 0.4,
      'shadow-offset-x': 0,
      'shadow-offset-y': 0,
    },
  },
  {
    selector: 'node.highlighted[type = "file"]',
    style: {
      'border-color': '#f0883e',
      'shadow-blur': 18,
      'shadow-color': '#f0883e',
      'shadow-opacity': 0.4,
      'shadow-offset-x': 0,
      'shadow-offset-y': 0,
    },
  },
  {
    selector: 'edge.highlighted',
    style: {
      opacity: 0.9,
      'z-index': 10,
    },
  },

  // Dimmed
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

export const processTreeLayout = {
  name: 'breadthfirst',
  directed: true,
  spacingFactor: 1.5,
  animate: false,
  padding: 30,
};
