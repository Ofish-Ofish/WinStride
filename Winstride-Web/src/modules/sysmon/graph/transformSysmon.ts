import type { WinEvent } from '../../security/shared/types';
import { parseProcessCreate, parseNetworkConnect, parseFileCreate } from '../shared/parseSysmonEvent';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ProcessNode {
  id: string;
  type: 'process' | 'network' | 'file';
  label: string;
  fullPath: string;
  commandLine: string;
  user: string;
  integrityLevel: string;
  parentId: string;
  hashes: string;
  // network-specific
  destinationIp: string;
  destinationPort: number;
  protocol: string;
  // file-specific
  targetFilename: string;
}

export interface ProcessEdge {
  id: string;
  source: string;
  target: string;
  type: 'spawned' | 'connected' | 'created';
}

export interface ProcessTreeData {
  nodes: ProcessNode[];
  edges: ProcessEdge[];
}

/* ------------------------------------------------------------------ */
/*  Transform                                                          */
/* ------------------------------------------------------------------ */

export function buildProcessTree(events: WinEvent[]): ProcessTreeData {
  const nodeMap = new Map<string, ProcessNode>();
  const edges: ProcessEdge[] = [];
  const edgeSet = new Set<string>();

  // Pass 1: Process events (Event 1)
  for (const event of events) {
    if (event.eventId !== 1) continue;
    const proc = parseProcessCreate(event);
    if (!proc || !proc.processGuid) continue;

    // Add/update process node
    if (!nodeMap.has(proc.processGuid)) {
      nodeMap.set(proc.processGuid, {
        id: proc.processGuid,
        type: 'process',
        label: proc.imageName,
        fullPath: proc.image,
        commandLine: proc.commandLine,
        user: proc.user,
        integrityLevel: proc.integrityLevel,
        parentId: proc.parentProcessGuid,
        hashes: proc.hashes,
        destinationIp: '',
        destinationPort: 0,
        protocol: '',
        targetFilename: '',
      });
    }

    // Ensure parent exists as a node (may be populated by another event or remain stub)
    if (proc.parentProcessGuid && !nodeMap.has(proc.parentProcessGuid)) {
      nodeMap.set(proc.parentProcessGuid, {
        id: proc.parentProcessGuid,
        type: 'process',
        label: proc.parentImageName,
        fullPath: proc.parentImage,
        commandLine: proc.parentCommandLine,
        user: '',
        integrityLevel: '',
        parentId: '',
        hashes: '',
        destinationIp: '',
        destinationPort: 0,
        protocol: '',
        targetFilename: '',
      });
    }

    // Parent → child edge
    if (proc.parentProcessGuid) {
      const edgeId = `spawned-${proc.parentProcessGuid}-${proc.processGuid}`;
      if (!edgeSet.has(edgeId)) {
        edgeSet.add(edgeId);
        edges.push({
          id: edgeId,
          source: proc.parentProcessGuid,
          target: proc.processGuid,
          type: 'spawned',
        });
      }
    }
  }

  // Pass 2: Network events (Event 3)
  for (const event of events) {
    if (event.eventId !== 3) continue;
    const net = parseNetworkConnect(event);
    if (!net || !net.processGuid) continue;

    const networkNodeId = `net-${net.destinationIp}:${net.destinationPort}`;

    if (!nodeMap.has(networkNodeId)) {
      nodeMap.set(networkNodeId, {
        id: networkNodeId,
        type: 'network',
        label: `${net.destinationIp}:${net.destinationPort}`,
        fullPath: '',
        commandLine: '',
        user: net.user,
        integrityLevel: '',
        parentId: '',
        hashes: '',
        destinationIp: net.destinationIp,
        destinationPort: net.destinationPort,
        protocol: net.protocol,
        targetFilename: '',
      });
    }

    // Process → network edge
    const edgeId = `connected-${net.processGuid}-${networkNodeId}`;
    if (!edgeSet.has(edgeId)) {
      edgeSet.add(edgeId);

      // Ensure process node exists
      if (!nodeMap.has(net.processGuid)) {
        nodeMap.set(net.processGuid, {
          id: net.processGuid,
          type: 'process',
          label: net.imageName,
          fullPath: net.image,
          commandLine: '',
          user: net.user,
          integrityLevel: '',
          parentId: '',
          hashes: '',
          destinationIp: '',
          destinationPort: 0,
          protocol: '',
          targetFilename: '',
        });
      }

      edges.push({
        id: edgeId,
        source: net.processGuid,
        target: networkNodeId,
        type: 'connected',
      });
    }
  }

  // Pass 3: File events (Event 11)
  for (const event of events) {
    if (event.eventId !== 11) continue;
    const file = parseFileCreate(event);
    if (!file || !file.processGuid) continue;

    const fileNodeId = `file-${file.targetFilename}`;

    if (!nodeMap.has(fileNodeId)) {
      nodeMap.set(fileNodeId, {
        id: fileNodeId,
        type: 'file',
        label: file.targetBasename,
        fullPath: '',
        commandLine: '',
        user: file.user,
        integrityLevel: '',
        parentId: '',
        hashes: '',
        destinationIp: '',
        destinationPort: 0,
        protocol: '',
        targetFilename: file.targetFilename,
      });
    }

    // Process → file edge
    const edgeId = `created-${file.processGuid}-${fileNodeId}`;
    if (!edgeSet.has(edgeId)) {
      edgeSet.add(edgeId);

      // Ensure process node exists
      if (!nodeMap.has(file.processGuid)) {
        nodeMap.set(file.processGuid, {
          id: file.processGuid,
          type: 'process',
          label: file.imageName,
          fullPath: file.image,
          commandLine: '',
          user: file.user,
          integrityLevel: '',
          parentId: '',
          hashes: '',
          destinationIp: '',
          destinationPort: 0,
          protocol: '',
          targetFilename: '',
        });
      }

      edges.push({
        id: edgeId,
        source: file.processGuid,
        target: fileNodeId,
        type: 'created',
      });
    }
  }

  return { nodes: [...nodeMap.values()], edges };
}
