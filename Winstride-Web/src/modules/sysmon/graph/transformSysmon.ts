import type { WinEvent } from '../../security/shared/types';
import { parseProcessCreate, parseNetworkConnect, parseFileCreate } from '../shared/parseSysmonEvent';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AggregatedNode {
  id: string;
  type: 'process' | 'network' | 'file';
  label: string;           // image name for process, IP for network, directory for file
  count: number;           // number of instances
  // process-specific aggregated data
  users: string[];         // unique users
  integrityLevels: string[]; // unique integrity levels
  commandLines: string[];  // unique command lines (cap at 50)
  fullPaths: string[];     // unique full image paths
  // network-specific
  destinations: string[];  // unique "ip:port" strings
  protocols: string[];     // unique protocols
  // file-specific
  filePaths: string[];     // unique file paths
  // highest integrity level for styling
  maxIntegrity: 'Low' | 'Medium' | 'High' | 'System' | '';
  // event IDs that contributed to this aggregated node (for detection lookup)
  eventIds: number[];
}

export interface AggregatedEdge {
  id: string;
  source: string;
  target: string;
  type: 'spawned' | 'connected' | 'created';
  count: number;           // number of times this relationship occurred
  eventIds: number[];      // event IDs for detection lookup
}

export interface AggregatedTreeData {
  nodes: AggregatedNode[];
  edges: AggregatedEdge[];
}

/* ------------------------------------------------------------------ */
/*  System processes to hide by default                                */
/* ------------------------------------------------------------------ */

export const SYSTEM_PROCESSES = new Set([
  'svchost.exe', 'WmiPrvSE.exe', 'SearchIndexer.exe', 'MsMpEng.exe',
  'csrss.exe', 'smss.exe', 'wininit.exe', 'services.exe', 'lsass.exe',
  'spoolsv.exe', 'dwm.exe', 'conhost.exe', 'RuntimeBroker.exe',
  'taskhostw.exe', 'sihost.exe', 'ctfmon.exe', 'fontdrvhost.exe',
  'WUDFHost.exe', 'dllhost.exe', 'msiexec.exe', 'TiWorker.exe',
  'TrustedInstaller.exe', 'SearchProtocolHost.exe', 'SearchFilterHost.exe',
  'backgroundTaskHost.exe', 'SystemSettingsBroker.exe', 'MusNotifyIcon.exe',
  'audiodg.exe', 'CompPkgSrv.exe', 'Registry', 'System',
]);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const MAX_ARRAY = 50;

const INTEGRITY_RANK: Record<string, number> = {
  Low: 0,
  Medium: 1,
  High: 2,
  System: 3,
};

const INTEGRITY_LABELS = ['Low', 'Medium', 'High', 'System'] as const;

function addUnique(arr: string[], value: string): void {
  if (value && arr.length < MAX_ARRAY && !arr.includes(value)) {
    arr.push(value);
  }
}

function higherIntegrity(
  current: AggregatedNode['maxIntegrity'],
  candidate: string,
): AggregatedNode['maxIntegrity'] {
  const cur = INTEGRITY_RANK[current] ?? -1;
  const can = INTEGRITY_RANK[candidate] ?? -1;
  if (can > cur) return INTEGRITY_LABELS[can] as AggregatedNode['maxIntegrity'];
  return current;
}

function makeNode(id: string, type: AggregatedNode['type'], label: string): AggregatedNode {
  return {
    id,
    type,
    label,
    count: 0,
    users: [],
    integrityLevels: [],
    commandLines: [],
    fullPaths: [],
    destinations: [],
    protocols: [],
    filePaths: [],
    maxIntegrity: '',
    eventIds: [],
  };
}

function isSystemProcess(name: string): boolean {
  return SYSTEM_PROCESSES.has(name);
}

/* ------------------------------------------------------------------ */
/*  Main transform                                                     */
/* ------------------------------------------------------------------ */

export function buildAggregatedTree(
  events: WinEvent[],
  hideSystem: boolean,
): AggregatedTreeData {
  const nodeMap = new Map<string, AggregatedNode>();
  const edgeMap = new Map<string, AggregatedEdge>();

  // ── Pass 1: Process events (Event 1) ──────────────────────────────
  for (const event of events) {
    if (event.eventId !== 1) continue;
    const proc = parseProcessCreate(event);
    if (!proc || !proc.imageName) continue;

    const childKey = proc.imageName.toLowerCase();
    const parentKey = proc.parentImageName?.toLowerCase() ?? '';

    if (hideSystem && isSystemProcess(proc.imageName) && isSystemProcess(proc.parentImageName)) {
      continue;
    }

    // Upsert child process node
    let childNode = nodeMap.get(childKey);
    if (!childNode) {
      childNode = makeNode(childKey, 'process', proc.imageName);
      nodeMap.set(childKey, childNode);
    }
    childNode.count++;
    childNode.eventIds.push(event.id);
    addUnique(childNode.users, proc.user);
    addUnique(childNode.integrityLevels, proc.integrityLevel);
    addUnique(childNode.commandLines, proc.commandLine);
    addUnique(childNode.fullPaths, proc.image);
    childNode.maxIntegrity = higherIntegrity(childNode.maxIntegrity, proc.integrityLevel);

    // Upsert parent process node (if we know the parent)
    if (parentKey) {
      let parentNode = nodeMap.get(parentKey);
      if (!parentNode) {
        parentNode = makeNode(parentKey, 'process', proc.parentImageName);
        nodeMap.set(parentKey, parentNode);
      }
      addUnique(parentNode.fullPaths, proc.parentImage);
      addUnique(parentNode.commandLines, proc.parentCommandLine);

      // Upsert spawned edge
      const edgeId = `spawned-${parentKey}-${childKey}`;
      let edge = edgeMap.get(edgeId);
      if (!edge) {
        edge = { id: edgeId, source: parentKey, target: childKey, type: 'spawned', count: 0, eventIds: [] };
        edgeMap.set(edgeId, edge);
      }
      edge.count++;
      edge.eventIds.push(event.id);
    }
  }

  // ── Pass 2: Network events (Event 3) ─────────────────────────────
  for (const event of events) {
    if (event.eventId !== 3) continue;
    const net = parseNetworkConnect(event);
    if (!net || !net.destinationIp) continue;

    if (hideSystem && isSystemProcess(net.imageName)) continue;

    const processKey = net.imageName.toLowerCase();
    const networkKey = `net-${net.destinationIp}`;

    // Upsert process node (source of the connection)
    let procNode = nodeMap.get(processKey);
    if (!procNode) {
      procNode = makeNode(processKey, 'process', net.imageName);
      nodeMap.set(processKey, procNode);
    }
    addUnique(procNode.users, net.user);
    addUnique(procNode.fullPaths, net.image);

    // Upsert network node
    let netNode = nodeMap.get(networkKey);
    if (!netNode) {
      netNode = makeNode(networkKey, 'network', net.destinationIp);
      nodeMap.set(networkKey, netNode);
    }
    netNode.count++;
    netNode.eventIds.push(event.id);
    addUnique(netNode.destinations, `${net.destinationIp}:${net.destinationPort}`);
    addUnique(netNode.protocols, net.protocol);

    // Upsert connected edge
    const edgeId = `connected-${processKey}-${networkKey}`;
    let edge = edgeMap.get(edgeId);
    if (!edge) {
      edge = { id: edgeId, source: processKey, target: networkKey, type: 'connected', count: 0, eventIds: [] };
      edgeMap.set(edgeId, edge);
    }
    edge.count++;
    edge.eventIds.push(event.id);
  }

  // ── Pass 3: File events (Event 11) ────────────────────────────────
  for (const event of events) {
    if (event.eventId !== 11) continue;
    const file = parseFileCreate(event);
    if (!file || !file.targetFilename) continue;

    if (hideSystem && isSystemProcess(file.imageName)) continue;

    const processKey = file.imageName.toLowerCase();

    // Extract directory: everything before last backslash
    const lastSlash = file.targetFilename.lastIndexOf('\\');
    const directory = lastSlash > 0 ? file.targetFilename.substring(0, lastSlash) : file.targetFilename;
    const fileKey = `file-${directory}`;

    // Upsert process node (source of the file creation)
    let procNode = nodeMap.get(processKey);
    if (!procNode) {
      procNode = makeNode(processKey, 'process', file.imageName);
      nodeMap.set(processKey, procNode);
    }
    addUnique(procNode.users, file.user);
    addUnique(procNode.fullPaths, file.image);

    // Upsert file node
    let fileNode = nodeMap.get(fileKey);
    if (!fileNode) {
      fileNode = makeNode(fileKey, 'file', directory);
      nodeMap.set(fileKey, fileNode);
    }
    fileNode.count++;
    fileNode.eventIds.push(event.id);
    addUnique(fileNode.filePaths, file.targetFilename);

    // Upsert created edge
    const edgeId = `created-${processKey}-${fileKey}`;
    let edge = edgeMap.get(edgeId);
    if (!edge) {
      edge = { id: edgeId, source: processKey, target: fileKey, type: 'created', count: 0, eventIds: [] };
      edgeMap.set(edgeId, edge);
    }
    edge.count++;
    edge.eventIds.push(event.id);
  }

  return {
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
  };
}
