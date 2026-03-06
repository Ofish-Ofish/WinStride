import type { WinProcess } from './types';

export interface ProcessTreeNode {
  process: WinProcess;
  children: ProcessTreeNode[];
  depth: number;
}

const SYSTEM_PROCESSES = new Set([
  'svchost.exe', 'WmiPrvSE.exe', 'SearchIndexer.exe', 'MsMpEng.exe',
  'csrss.exe', 'smss.exe', 'wininit.exe', 'services.exe', 'lsass.exe',
  'spoolsv.exe', 'dwm.exe', 'conhost.exe', 'RuntimeBroker.exe',
  'taskhostw.exe', 'sihost.exe', 'ctfmon.exe', 'fontdrvhost.exe',
  'WUDFHost.exe', 'dllhost.exe', 'msiexec.exe', 'TiWorker.exe',
  'TrustedInstaller.exe', 'SearchProtocolHost.exe', 'SearchFilterHost.exe',
  'backgroundTaskHost.exe', 'SystemSettingsBroker.exe', 'MusNotifyIcon.exe',
  'audiodg.exe', 'CompPkgSrv.exe', 'Registry', 'System',
]);

export function isSystemProcess(name: string): boolean {
  return SYSTEM_PROCESSES.has(name);
}

/**
 * Build a forest of process trees from a flat list.
 * Processes whose parentPid doesn't exist in the list become roots.
 */
export function buildProcessTree(processes: WinProcess[]): ProcessTreeNode[] {
  const byPid = new Map<number, WinProcess>();
  for (const p of processes) {
    // If multiple processes share a PID (shouldn't happen in a single snapshot),
    // keep the first one.
    if (!byPid.has(p.pid)) {
      byPid.set(p.pid, p);
    }
  }

  const childrenMap = new Map<number, WinProcess[]>();
  const roots: WinProcess[] = [];

  for (const p of processes) {
    if (p.parentPid == null || !byPid.has(p.parentPid)) {
      roots.push(p);
    } else {
      const siblings = childrenMap.get(p.parentPid);
      if (siblings) siblings.push(p);
      else childrenMap.set(p.parentPid, [p]);
    }
  }

  function buildNode(proc: WinProcess, depth: number): ProcessTreeNode {
    const kids = childrenMap.get(proc.pid) ?? [];
    kids.sort((a, b) => a.imageName.localeCompare(b.imageName));
    return {
      process: proc,
      children: kids.map((k) => buildNode(k, depth + 1)),
      depth,
    };
  }

  roots.sort((a, b) => a.imageName.localeCompare(b.imageName));
  return roots.map((r) => buildNode(r, 0));
}

/** Flatten tree into a list of visible rows (respecting expanded state). */
export function flattenTree(
  roots: ProcessTreeNode[],
  expandedPids: Set<number>,
  hideSystem: boolean,
  searchLower: string,
): ProcessTreeNode[] {
  const result: ProcessTreeNode[] = [];

  function matches(node: ProcessTreeNode): boolean {
    if (node.process.imageName.toLowerCase().includes(searchLower)) return true;
    if (String(node.process.pid).includes(searchLower)) return true;
    return node.children.some(matches);
  }

  function walk(node: ProcessTreeNode) {
    if (hideSystem && isSystemProcess(node.process.imageName) && node.children.every((c) => isSystemProcess(c.process.imageName))) {
      return;
    }
    if (searchLower && !matches(node)) return;

    result.push(node);
    if (expandedPids.has(node.process.pid) || searchLower) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  for (const root of roots) walk(root);
  return result;
}

export function formatMemory(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}
