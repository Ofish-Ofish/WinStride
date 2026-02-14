import { useEffect, useRef, useState, useCallback } from 'react';
import cytoscape, { type Core, type EventObject } from 'cytoscape';
import { graphStyles } from './graphStyles';
import { coseLayout } from './graphLayout';
import type { GraphNode, GraphEdge } from '../types';

export interface SelectedElement {
  type: 'node' | 'edge';
  data: Record<string, unknown>;
}

export function useCytoscape(
  containerRef: React.RefObject<HTMLDivElement | null>,
  nodes: GraphNode[],
  edges: GraphEdge[],
) {
  const cyRef = useRef<Core | null>(null);
  const [selected, setSelected] = useState<SelectedElement | null>(null);

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: graphStyles,
      layout: { name: 'grid' }, // Placeholder; real layout runs after data
      minZoom: 0.2,
      maxZoom: 5,
      wheelSensitivity: 3,
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [containerRef]);

  // Update elements when data changes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (nodes.length === 0) return;

    cy.batch(() => {
      cy.elements().remove();

      for (const node of nodes) {
        cy.add({
          group: 'nodes',
          data: {
            id: node.id,
            label: node.label,
            type: node.type,
            privileged: node.privileged,
            logonCount: node.logonCount,
          },
        });
      }

      for (const edge of edges) {
        cy.add({
          group: 'edges',
          data: {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            logonCount: edge.logonCount,
            logonType: edge.logonType,
            logonTypeLabel: edge.logonTypeLabel,
            lastSeen: edge.lastSeen,
          },
        });
      }
    });

    cy.layout(coseLayout).run();
  }, [nodes, edges]);

  // Click handlers: highlight neighbors, dim rest
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const onTapNode = (evt: EventObject) => {
      const node = evt.target;
      cy.elements().removeClass('highlighted dimmed');

      const neighborhood = node.neighborhood().add(node);
      neighborhood.addClass('highlighted');
      cy.elements().not(neighborhood).addClass('dimmed');

      setSelected({ type: 'node', data: node.data() });
    };

    const onTapEdge = (evt: EventObject) => {
      const edge = evt.target;
      cy.elements().removeClass('highlighted dimmed');

      const connected = edge.connectedNodes().add(edge);
      connected.addClass('highlighted');
      cy.elements().not(connected).addClass('dimmed');

      setSelected({ type: 'edge', data: edge.data() });
    };

    const onTapBg = () => {
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

  const fitToView = useCallback(() => {
    cyRef.current?.fit(undefined, 40);
  }, []);

  const resetLayout = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('highlighted dimmed');
    setSelected(null);
    cy.layout(coseLayout).run();
  }, []);

  return { selected, fitToView, resetLayout };
}
