import type { LayoutOptions } from 'cytoscape';

export const coseLayout: LayoutOptions = {
  name: 'cose',
  animate: true,
  animationDuration: 600,
  animationEasing: 'ease-out-cubic' as any,
  idealEdgeLength: 160,
  nodeOverlap: 30,
  nodeRepulsion: 12000,
  edgeElasticity: 80,
  gravity: 0.15,
  numIter: 1500,
  initialTemp: 400,
  coolingFactor: 0.96,
  minTemp: 1.0,
  fit: true,
  padding: 50,
};
