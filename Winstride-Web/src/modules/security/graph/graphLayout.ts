import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';

cytoscape.use(fcose);

export const coseLayout = {
  name: 'fcose',
  animate: false,
  fit: true,
  padding: 150,
  nodeDimensionsIncludeLabels: true,
  // Light refinement from pre-computed hub-spoke positions
  nodeRepulsion: 8000,
  idealEdgeLength: 200,
  edgeElasticity: 0.45,
  gravity: 0.25,
  gravityRange: 1.5,
  numIter: 2500,
  tile: true,
  tilingPaddingVertical: 40,
  tilingPaddingHorizontal: 40,
  quality: 'proof',
  // Use the pre-computed positions as starting points
  randomize: false,
};
