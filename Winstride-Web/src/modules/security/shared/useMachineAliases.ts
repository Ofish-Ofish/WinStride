import { useState, useMemo, useCallback } from 'react';
import {
  type MachineAliasMap,
  type AutoAliasResult,
  loadMachineAliases,
  saveMachineAliases,
  computeAutoAliases,
} from './machineAliases';
import type { WinEvent } from './types';

/**
 * Shared hook for machine alias computation + user persistence + merging.
 * Replaces the ad-hoc useState/useMemo chain previously living in LogonGraph.
 */
export function useMachineAliases(events: WinEvent[] | undefined) {
  const [userAliases, setUserAliasesRaw] = useState<MachineAliasMap>(loadMachineAliases);

  const setUserAliases = useCallback((next: MachineAliasMap) => {
    setUserAliasesRaw(next);
    saveMachineAliases(next);
  }, []);

  const autoResult: AutoAliasResult = useMemo(
    () => (events && events.length > 0 ? computeAutoAliases(events) : { aliases: {}, detected: [] }),
    [events],
  );

  const mergedAliases: MachineAliasMap = useMemo(
    () => ({ ...autoResult.aliases, ...userAliases }),
    [autoResult.aliases, userAliases],
  );

  return { mergedAliases, autoResult, userAliases, setUserAliases };
}
