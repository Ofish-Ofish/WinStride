import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface PollPauseState {
  paused: boolean;
  togglePause: () => void;
}

const PollPauseContext = createContext<PollPauseState>({ paused: false, togglePause: () => {} });

export const usePollPause = () => useContext(PollPauseContext);

export function PollPauseProvider({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(false);
  const togglePause = useCallback(() => setPaused((p) => !p), []);
  return <PollPauseContext.Provider value={{ paused, togglePause }}>{children}</PollPauseContext.Provider>;
}
