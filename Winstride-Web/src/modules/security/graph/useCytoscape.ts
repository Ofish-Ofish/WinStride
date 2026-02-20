import { useEffect, useRef, useState, useCallback } from 'react';
import cytoscape, { type Core, type EventObject } from 'cytoscape';
import { graphStyles } from './graphStyles';
import { coseLayout } from './graphLayout';
import type { GraphNode, GraphEdge } from '../types';

export interface SelectedElement {
  type: 'node' | 'edge';
  data: Record<string, unknown>;
}

/* ── Hub-spoke position calculator ────────────────────────────────── */

/** Place machines in a grid at the center, then fan users around them. */
function computeHubSpokePositions(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  const machines = nodes.filter((n) => n.type === 'machine');
  const users = nodes.filter((n) => n.type !== 'machine');

  // Build adjacency: machineId → list of connected userIds
  const machineToUsers = new Map<string, string[]>();
  const userToMachines = new Map<string, string[]>();
  for (const m of machines) machineToUsers.set(m.id, []);
  for (const u of users) userToMachines.set(u.id, []);

  for (const edge of edges) {
    const src = edge.source;
    const tgt = edge.target;
    // edges go user→machine
    if (machineToUsers.has(tgt) && userToMachines.has(src)) {
      if (!machineToUsers.get(tgt)!.includes(src)) machineToUsers.get(tgt)!.push(src);
      if (!userToMachines.get(src)!.includes(tgt)) userToMachines.get(src)!.push(tgt);
    }
    // handle reverse direction too
    if (machineToUsers.has(src) && userToMachines.has(tgt)) {
      if (!machineToUsers.get(src)!.includes(tgt)) machineToUsers.get(src)!.push(tgt);
      if (!userToMachines.get(tgt)!.includes(src)) userToMachines.get(tgt)!.push(src);
    }
  }

  // Place machines in a circle at center (or single point if only one)
  const machineSpacing = 350;
  if (machines.length === 1) {
    positions.set(machines[0].id, { x: 0, y: 0 });
  } else {
    const radius = (machines.length * machineSpacing) / (2 * Math.PI);
    machines.forEach((m, i) => {
      const angle = (2 * Math.PI * i) / machines.length - Math.PI / 2;
      positions.set(m.id, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    });
  }

  // Place users in a circle around each machine they connect to.
  // If a user connects to multiple machines, average the positions.
  const spokeRadius = 250;
  const userPositionSums = new Map<string, { x: number; y: number; count: number }>();

  for (const [machineId, connectedUsers] of machineToUsers) {
    const machinePos = positions.get(machineId)!;
    const count = connectedUsers.length;
    if (count === 0) continue;

    connectedUsers.forEach((userId, i) => {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2;
      const ux = machinePos.x + Math.cos(angle) * spokeRadius;
      const uy = machinePos.y + Math.sin(angle) * spokeRadius;

      const existing = userPositionSums.get(userId);
      if (existing) {
        existing.x += ux;
        existing.y += uy;
        existing.count++;
      } else {
        userPositionSums.set(userId, { x: ux, y: uy, count: 1 });
      }
    });
  }

  for (const [userId, sum] of userPositionSums) {
    positions.set(userId, { x: sum.x / sum.count, y: sum.y / sum.count });
  }

  // Any orphan nodes without edges — place in a row below
  let orphanX = 0;
  for (const n of nodes) {
    if (!positions.has(n.id)) {
      positions.set(n.id, { x: orphanX, y: 600 });
      orphanX += 120;
    }
  }

  return positions;
}

/* ── Hook ─────────────────────────────────────────────────────────── */

export function useCytoscape(
  containerRef: React.RefObject<HTMLDivElement | null>,
  nodes: GraphNode[],
  edges: GraphEdge[],
  visible: boolean,
) {
  const cyRef = useRef<Core | null>(null);
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const selectedRef = useRef<SelectedElement | null>(null);

  // Keep ref in sync so event handlers always see the latest value
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

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

  // Track whether we've done the initial full layout
  const hasLaidOut = useRef(false);

  // Update elements when data changes — diff-based to preserve positions
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    if (nodes.length === 0) {
      cy.elements().remove();
      hasLaidOut.current = false;
      return;
    }

    const isFirstLayout = !hasLaidOut.current;
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
        const nodeData = {
            label: node.label,
            type: node.type,
            privileged: node.privileged,
            logonCount: node.logonCount,
            failedCount: node.failedCount,
            successCount: node.successCount,
            connectedCount: node.connectedCount,
            authPackages: node.authPackages,
            hadAdminSession: node.hadAdminSession,
            lastIp: node.lastIp,
            lastSeen: node.lastSeen,
        };
        if (existing.length > 0) {
          // Update data on existing node — position stays
          existing.data(nodeData);
        } else {
          // New node — place near a connected neighbor or at center
          let pos = { x: 0, y: 0 };
          if (!isFirstLayout) {
            // Find a connected edge to position near its other end
            const connEdge = edges.find(
              (e) => e.source === node.id || e.target === node.id,
            );
            if (connEdge) {
              const neighborId =
                connEdge.source === node.id ? connEdge.target : connEdge.source;
              const neighbor = cy.getElementById(neighborId);
              if (neighbor.length > 0) {
                const np = neighbor.position();
                // Offset randomly so it doesn't land exactly on top
                pos = {
                  x: np.x + (Math.random() - 0.5) * 200,
                  y: np.y + (Math.random() - 0.5) * 200,
                };
              }
            }
          }
          cy.add({
            group: 'nodes',
            data: {
              id: node.id,
              ...nodeData,
            },
            position: pos,
          });
        }
      }

      // Add or update edges
      for (const edge of edges) {
        const existing = cy.getElementById(edge.id);
        const isFailed = !!edge.failureStatus && edge.failureStatus !== '0x0';
        const edgeData = {
            logonCount: edge.logonCount,
            logonType: edge.logonType,
            logonTypeLabel: edge.logonTypeLabel,
            firstSeen: edge.firstSeen,
            lastSeen: edge.lastSeen,
            ipAddress: edge.ipAddress,
            ipPort: edge.ipPort,
            subjectUserName: edge.subjectUserName,
            subjectDomainName: edge.subjectDomainName,
            targetDomainName: edge.targetDomainName,
            authPackage: edge.authPackage,
            logonProcess: edge.logonProcess,
            workstationName: edge.workstationName,
            processName: edge.processName,
            keyLength: edge.keyLength,
            elevatedToken: edge.elevatedToken,
            failureStatus: edge.failureStatus,
            failureSubStatus: edge.failureSubStatus,
            isFailed,
        };
        if (existing.length > 0) {
          existing.data(edgeData);
        } else {
          cy.add({
            group: 'edges',
            data: {
              id: edge.id,
              source: edge.source,
              target: edge.target,
              ...edgeData,
            },
          });
        }
      }
    });

    // Only run full layout on first load
    if (isFirstLayout) {
      const layout = cy.layout(coseLayout);
      layout.on('layoutstop', () => {
        // Double all distances from center
        const center = { x: 0, y: 0 };
        const allNodes = cy.nodes();
        allNodes.forEach((n) => {
          center.x += n.position('x');
          center.y += n.position('y');
        });
        center.x /= allNodes.length;
        center.y /= allNodes.length;
        allNodes.forEach((n) => {
          n.position({
            x: center.x + (n.position('x') - center.x) * 2,
            y: center.y + (n.position('y') - center.y) * 2,
          });
        });
        cy.fit(undefined, coseLayout.padding);
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

      // If something is already selected…
      if (selectedRef.current) {
        // If the clicked node is highlighted (connected), select it
        if (node.hasClass('highlighted')) {
          cy.elements().removeClass('highlighted dimmed');
          const neighborhood = node.neighborhood().add(node);
          neighborhood.addClass('highlighted');
          cy.elements().not(neighborhood).addClass('dimmed');
          setSelected({ type: 'node', data: node.data() });
        } else {
          // Clicked a dimmed/non-connected node — just deselect
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

      // If something is already selected…
      if (selectedRef.current) {
        // If the clicked edge is highlighted (connected), select it
        if (edge.hasClass('highlighted')) {
          cy.elements().removeClass('highlighted dimmed');
          const connected = edge.connectedNodes().add(edge);
          connected.addClass('highlighted');
          cy.elements().not(connected).addClass('dimmed');
          setSelected({ type: 'edge', data: edge.data() });
        } else {
          // Clicked a dimmed/non-connected edge — just deselect
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
      if (evt.target !== cy) return; // Only fire on background clicks
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

  // Resize when becoming visible (container goes from display:none to visible)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !visible) return;
    cy.resize();
    cy.fit(undefined, coseLayout.padding);
  }, [visible]);

  const fitToView = useCallback(() => {
    cyRef.current?.fit(undefined, coseLayout.padding);
  }, []);

  const resetLayout = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('highlighted dimmed');
    setSelected(null);

    // Recompute hub-spoke positions from current graph data
    const currentNodes: GraphNode[] = cy.nodes().map((n) => n.data() as GraphNode);
    const currentEdges: GraphEdge[] = cy.edges().map((e) => e.data() as GraphEdge);
    const positions = computeHubSpokePositions(currentNodes, currentEdges);

    cy.nodes().forEach((node) => {
      const pos = positions.get(node.id());
      if (pos) node.position(pos);
    });

    const layout = cy.layout(coseLayout);
    layout.on('layoutstop', () => {
      const center = { x: 0, y: 0 };
      const allNodes = cy.nodes();
      allNodes.forEach((n) => {
        center.x += n.position('x');
        center.y += n.position('y');
      });
      center.x /= allNodes.length;
      center.y /= allNodes.length;
      allNodes.forEach((n) => {
        n.position({
          x: center.x + (n.position('x') - center.x) * 2,
          y: center.y + (n.position('y') - center.y) * 2,
        });
      });
      cy.fit(undefined, coseLayout.padding);
    });
    layout.run();
  }, []);

  return { selected, fitToView, resetLayout };
}
