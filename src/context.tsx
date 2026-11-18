import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getState } from "./api";
import type { PartyState } from "./types";

type PartyContextValue = {
  state: PartyState | null;
  loading: boolean;
  error: string | null;
  offline: boolean;
  refresh: () => Promise<void>;
};

const PartyContext = createContext<PartyContextValue | null>(null);

export function PartyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PartyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const queued = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const refresh = useCallback(async () => {
    try {
      const next = await getState();
      setState(next);
      setError(null);
      setOffline(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não deu certo. Tente de novo.";
      if (stateRef.current) setOffline(true);
      else setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSoon = useCallback(() => {
    if (queued.current) return;
    queued.current = true;
    window.setTimeout(() => {
      queued.current = false;
      void refresh();
    }, 250);
  }, [refresh]);

  useEffect(() => {
    void refresh();
    let source: EventSource | null = null;
    try {
      source = new EventSource("/api/events");
      source.onmessage = () => refreshSoon();
    } catch {
      source = null;
    }
    const poll = window.setInterval(() => void refresh(), 8000);
    return () => {
      source?.close();
      window.clearInterval(poll);
    };
  }, [refresh, refreshSoon]);

  return (
    <PartyContext.Provider value={{ state, loading, error, offline, refresh }}>
      {children}
    </PartyContext.Provider>
  );
}

export function useParty() {
  const value = useContext(PartyContext);
  if (!value) throw new Error("useParty fora do provider");
  return value;
}
