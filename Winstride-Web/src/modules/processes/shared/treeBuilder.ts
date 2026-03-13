import type { WinProcess } from './types';
import { isMicrosoftVerifiedStatus, isNonVerifiedStatus } from './verification';

export interface ProcessTreeNode {
  process: WinProcess;
  children: ProcessTreeNode[];
  depth: number;
}

const KNOWN_SYSTEM_PROCESS_NAMES = new Set([
  'svchost.exe', 'wmiprvse.exe', 'searchindexer.exe', 'msmpeng.exe',
  'csrss.exe', 'smss.exe', 'wininit.exe', 'services.exe', 'lsass.exe',
  'spoolsv.exe', 'dwm.exe', 'conhost.exe', 'runtimebroker.exe',
  'taskhostw.exe', 'sihost.exe', 'ctfmon.exe', 'fontdrvhost.exe',
  'wudfhost.exe', 'dllhost.exe', 'msiexec.exe', 'tiworker.exe',
  'trustedinstaller.exe', 'searchprotocolhost.exe', 'searchfilterhost.exe',
  'backgroundtaskhost.exe', 'systemsettingsbroker.exe', 'musnotifyicon.exe',
  'audiodg.exe', 'comppkgsrv.exe', 'registry', 'system',
]);

const TRUSTED_SYSTEM_PROCESS_PATHS = new Map<string, readonly string[]>([
  ['audiodg.exe', ['\\windows\\system32\\audiodg.exe']],
  ['backgroundtaskhost.exe', ['\\windows\\system32\\backgroundtaskhost.exe']],
  ['comppkgsrv.exe', ['\\windows\\system32\\comppkgsrv.exe']],
  ['conhost.exe', ['\\windows\\system32\\conhost.exe']],
  ['csrss.exe', ['\\windows\\system32\\csrss.exe']],
  ['ctfmon.exe', ['\\windows\\system32\\ctfmon.exe']],
  ['dllhost.exe', ['\\windows\\system32\\dllhost.exe', '\\windows\\syswow64\\dllhost.exe']],
  ['dwm.exe', ['\\windows\\system32\\dwm.exe']],
  ['fontdrvhost.exe', ['\\windows\\system32\\fontdrvhost.exe']],
  ['lsass.exe', ['\\windows\\system32\\lsass.exe']],
  ['msiexec.exe', ['\\windows\\system32\\msiexec.exe', '\\windows\\syswow64\\msiexec.exe']],
  ['runtimebroker.exe', ['\\windows\\system32\\runtimebroker.exe']],
  ['searchfilterhost.exe', ['\\windows\\system32\\searchfilterhost.exe']],
  ['searchindexer.exe', ['\\windows\\system32\\searchindexer.exe']],
  ['searchprotocolhost.exe', ['\\windows\\system32\\searchprotocolhost.exe']],
  ['services.exe', ['\\windows\\system32\\services.exe']],
  ['sihost.exe', ['\\windows\\system32\\sihost.exe']],
  ['smss.exe', ['\\windows\\system32\\smss.exe']],
  ['spoolsv.exe', ['\\windows\\system32\\spoolsv.exe']],
  ['svchost.exe', ['\\windows\\system32\\svchost.exe']],
  ['systemsettingsbroker.exe', ['\\windows\\immersivecontrolpanel\\systemsettingsbroker.exe']],
  ['trustedinstaller.exe', ['\\windows\\servicing\\trustedinstaller.exe']],
  ['wininit.exe', ['\\windows\\system32\\wininit.exe']],
  ['wmiprvse.exe', ['\\windows\\system32\\wbem\\wmiprvse.exe']],
  ['wudfhost.exe', ['\\windows\\system32\\wudfhost.exe']],
]);

export function isSystemProcess(name: string): boolean {
  return KNOWN_SYSTEM_PROCESS_NAMES.has(name.toLowerCase());
}

function normalizeExecutablePath(path: string | null | undefined): string {
  if (!path?.trim()) return '';

  let normalized = path.trim().replace(/\//g, '\\');
  normalized = normalized.replace(/^\\\\\?\\/, '');

  if (/^[a-z]:\\/i.test(normalized)) {
    normalized = normalized.slice(2);
  }

  return normalized.toLowerCase();
}

export function isTrustedSystemProcess(process: WinProcess): boolean {
  const imageName = process.imageName.toLowerCase();
  const expectedPaths = TRUSTED_SYSTEM_PROCESS_PATHS.get(imageName);
  if (!expectedPaths) return false;
  if (!isMicrosoftVerifiedStatus(process.verificationStatus)) return false;

  return expectedPaths.includes(normalizeExecutablePath(process.path));
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
  focusNonVerified: boolean,
): ProcessTreeNode[] {
  const result: ProcessTreeNode[] = [];

  function matchesSearch(node: ProcessTreeNode): boolean {
    if (node.process.imageName.toLowerCase().includes(searchLower)) return true;
    if (String(node.process.pid).includes(searchLower)) return true;
    return node.children.some(matchesSearch);
  }

  function matchesVerification(node: ProcessTreeNode): boolean {
    if (!focusNonVerified) return true;
    if (isNonVerifiedStatus(node.process.verificationStatus)) return true;
    return node.children.some(matchesVerification);
  }

  function isTrustedSystemSubtree(node: ProcessTreeNode): boolean {
    return isTrustedSystemProcess(node.process) && node.children.every(isTrustedSystemSubtree);
  }

  function walk(node: ProcessTreeNode) {
    if (hideSystem && isTrustedSystemSubtree(node)) return;
    if (searchLower && !matchesSearch(node)) return;
    if (!matchesVerification(node)) return;

    result.push(node);
    if (expandedPids.has(node.process.pid) || searchLower || focusNonVerified) {
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
