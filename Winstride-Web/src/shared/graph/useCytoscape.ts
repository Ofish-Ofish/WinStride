import { useEffect, useRef, useState, useCallback, type RefObject } from 'react';
import cytoscape, { type Core, type EventObject } from 'cytoscape';
import type { SelectedElement, UseCytoscapeOptions } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObject = Record<string, any>;

export function useCytoscape(
  containerRef: RefObject<HTMLDivElement | null>,
  nodes: Array<{ id: string } & AnyObject>,
  edges: Array<{ id: string; source: string; target: string } & AnyObject>,
  visible: boolean,
  options: UseCytoscapeOptions,
): { selected: SelectedElement | null; fitToView: () => void; resetLayout: () => void } {
  const cyRef = useRef<Core | null>(null);
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const selectedRef = useRef<SelectedElement | null>(null);

  // Keep ref in sync so event handlers always see the latest value
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // Stable references to options that don't change identity
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current) return;

    const opts = optionsRef.current;
    const cy = cytoscape({
      container: containerRef.current,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      style: opts.styles as any,
      layout: { name: 'grid' }, // placeholder; real layout runs after data
      minZoom: opts.minZoom ?? 0.2,
      maxZoom: opts.maxZoom ?? 5,
      wheelSensitivity: opts.wheelSensitivity ?? 3,
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [containerRef]);

  // Track whether we've done the initial full layout
  const hasLaidOut = useRef(false);

  // Update elements when data changes — diff-based to preserve positions
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const opts = optionsRef.current;
    const layoutConfig = opts.layout;
    const padding = layoutConfig.padding ?? 10;

    if (nodes.length === 0) {
      cy.elements().remove();
      hasLaidOut.current = false;
      return;
    }

    const isFirstLayout = !hasLaidOut.current;
    const shouldRelayout = opts.relayoutOnDataChange || isFirstLayout;
    const newNodeIds = new Set(nodes.map((n) => n.id));
    const newEdgeIds = new Set(edges.map((e) => e.id));

    cy.batch(() => {
      // Remove nodes/edges that no longer exist
      cy.nodes().forEach((n) => {
        if (!newNodeIds.has(n.id())) n.remove();
      });
      cy.edges().forEach((e) => {
        if (!newEdgeIds.has(e.id())) e.remove();
      });

      // Add or update nodes
      for (const node of nodes) {
        const existing = cy.getElementById(node.id);
        const { id, ...rest } = node;
        if (existing.length > 0) {
          existing.data(rest);
        } else {
          // New node — place near connected neighbor or at center
          let pos = { x: 0, y: 0 };
          if (!isFirstLayout && !opts.relayoutOnDataChange) {
            const connEdge = edges.find(
              (e) => e.source === node.id || e.target === node.id,
            );
            if (connEdge) {
              const neighborId =
                connEdge.source === node.id ? connEdge.target : connEdge.source;
              const neighbor = cy.getElementById(neighborId);
              if (neighbor.length > 0) {
                const np = neighbor.position();
                pos = {
                  x: np.x + (Math.random() - 0.5) * 200,
                  y: np.y + (Math.random() - 0.5) * 200,
                };
              }
            }
          }
          cy.add({ group: 'nodes', data: { id, ...rest }, position: pos });
        }
      }

      // Add or update edges
      for (const edge of edges) {
        const existing = cy.getElementById(edge.id);
        const { id, source, target, ...rest } = edge;
        if (existing.length > 0) {
          existing.data(rest);
        } else {
          cy.add({
            group: 'edges',
            data: { id, source, target, ...rest },
          });
        }
      }
    });

    // Run layout
    if (shouldRelayout) {
      const layout = cy.layout(layoutConfig);
      layout.on('layoutstop', () => {
        if (opts.postLayout) opts.postLayout(cy);
        cy.fit(undefined, padding);
      });
      layout.run();
      hasLaidOut.current = true;
    }
  }, [nodes, edges]);

  // Click handlers: highlight neighbors, dim rest
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const onTapNode = (evt: EventObject) => {
      const node = evt.target;

      if (selectedRef.current) {
        if (node.hasClass('highlighted')) {
          cy.elements().removeClass('highlighted dimmed');
          const neighborhood = node.neighborhood().add(node);
          neighborhood.addClass('highlighted');
          cy.elements().not(neighborhood).addClass('dimmed');
          setSelected({ type: 'node', data: node.data() });
        } else {
          cy.elements().removeClass('highlighted dimmed');
          setSelected(null);
        }
        return;
      }

      const neighborhood = node.neighborhood().add(node);
      neighborhood.addClass('highlighted');
      cy.elements().not(neighborhood).addClass('dimmed');
      setSelected({ type: 'node', data: node.data() });
    };

    const onTapEdge = (evt: EventObject) => {
      const edge = evt.target;

      if (selectedRef.current) {
        if (edge.hasClass('highlighted')) {
          cy.elements().removeClass('highlighted dimmed');
          const connected = edge.connectedNodes().add(edge);
          connected.addClass('highlighted');
          cy.elements().not(connected).addClass('dimmed');
          setSelected({ type: 'edge', data: edge.data() });
        } else {
          cy.elements().removeClass('highlighted dimmed');
          setSelected(null);
        }
        return;
      }

      const connected = edge.connectedNodes().add(edge);
      connected.addClass('highlighted');
      cy.elements().not(connected).addClass('dimmed');
      setSelected({ type: 'edge', data: edge.data() });
    };

    const onTapBg = (evt: EventObject) => {
      if (evt.target !== cy) return;
      cy.elements().removeClass('highlighted dimmed');
      setSelected(null);
    };

    cy.on('tap', 'node', onTapNode);
    cy.on('tap', 'edge', onTapEdge);
    cy.on('tap', onTapBg);

    return () => {
      cy.off('tap', 'node', onTapNode);
      cy.off('tap', 'edge', onTapEdge);
      cy.off('tap', onTapBg);
    };
  }, []);

  // Resize when becoming visible
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !visible) return;
    const padding = optionsRef.current.layout.padding ?? 10;
    cy.resize();
    cy.fit(undefined, padding);
  }, [visible]);

  const fitToView = useCallback(() => {
    const padding = optionsRef.current.layout.padding ?? 10;
    cyRef.current?.fit(undefined, padding);
  }, []);

  const resetLayout = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const opts = optionsRef.current;
    const padding = opts.layout.padding ?? 10;
    cy.elements().removeClass('highlighted dimmed');
    setSelected(null);
    if (opts.preLayout) opts.preLayout(cy);
    const layout = cy.layout(opts.layout);
    layout.on('layoutstop', () => {
      if (opts.postLayout) opts.postLayout(cy);
      cy.fit(undefined, padding);
    });
    layout.run();
  }, []);

  return { selected, fitToView, resetLayout };
}
