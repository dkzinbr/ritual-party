import { useEffect, useRef, useState } from "react";

export function useAction() {
  const [state, setState] = useState<"idle" | "pending" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const lock = useRef(false);

  useEffect(() => {
    if (state !== "ok") return;
    const id = window.setTimeout(() => {
      setState("idle");
      setMessage(null);
    }, 2400);
    return () => window.clearTimeout(id);
  }, [state]);

  async function run(fn: () => Promise<void>, okMessage?: string) {
    if (lock.current) return;
    lock.current = true;
    setState("pending");
    setMessage(null);
    try {
      await fn();
      setState("ok");
      setMessage(okMessage ?? null);
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Não deu certo. Tente de novo.");
    } finally {
      lock.current = false;
    }
  }

  return { state, message, run };
}

export function Feedback({ state, message }: { state: string; message: string | null }) {
  if (!message) return null;
  const tone = state === "error" ? "text-ember" : "text-gold";
  return (
    <p className={`text-sm leading-snug ${tone}`} role="status">
      {message}
    </p>
  );
}

const button =
  "flex min-h-12 w-full items-center justify-center px-5 text-base transition active:scale-[0.98] disabled:cursor-wait disabled:opacity-60";

export const btnPrimary = `${button} bg-[#120608] text-[#f7f1e8]`;
export const btnGhost = `${button} border border-[#120608]/35 bg-transparent text-[#120608]`;
export const btnDanger = `${button} bg-[#6e1218] text-[#f7f1e8]`;

export function Sigil({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 108 132" className={className} aria-hidden="true">
      <path
        d="M30 18 H78 M4 62 H104 M54 2 V128"
        stroke="currentColor"
        strokeWidth="15"
        strokeLinejoin="miter"
        fill="none"
      />
    </svg>
  );
}

export function Countdown({ startsAt, serverNow }: { startsAt: string; serverNow: string }) {
  const offset = useRef(new Date(serverNow).getTime() - Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    offset.current = new Date(serverNow).getTime() - Date.now();
  }, [serverNow]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remain = new Date(startsAt).getTime() - (now + offset.current);
  if (remain <= 0) {
    return <p className="blood-title text-5xl">A noite começou</p>;
  }

  const total = Math.floor(remain / 1000);
  const parts = [
    ["dias", Math.floor(total / 86400)],
    ["horas", Math.floor((total % 86400) / 3600)],
    ["min", Math.floor((total % 3600) / 60)],
    ["seg", total % 60],
  ] as const;

  return (
    <div className="grid grid-cols-4 gap-2" aria-label="Tempo até a festa">
      {parts.map(([label, value]) => (
        <div key={label} className="text-center">
          <div className="blood-title text-3xl sm:text-5xl">{String(value).padStart(2, "0")}</div>
          <div className="kicker mt-1 text-[10px] text-bone/80">{label}</div>
        </div>
      ))}
    </div>
  );
}

export function RitualRing({
  ritual,
  vigilia,
  total,
}: {
  ritual: number;
  vigilia: number;
  total: number;
}) {
  const radius = 42;
  const circ = 2 * Math.PI * radius;
  const arc = (value: number) => `${(Math.min(value, total) / total) * circ * 0.48} ${circ}`;
  return (
    <svg viewBox="0 0 120 120" className="h-28 w-28" aria-hidden="true">
      <circle cx="60" cy="60" r={radius} stroke="#f7f1e8" strokeWidth="8" fill="none" opacity="0.28" />
      <circle
        cx="60"
        cy="60"
        r={radius}
        stroke="#e23b3b"
        strokeWidth="8"
        fill="none"
        strokeLinecap="butt"
        strokeDasharray={arc(ritual)}
        transform="rotate(-90 60 60)"
        className="ring-live"
      />
      <circle
        cx="60"
        cy="60"
        r={radius}
        stroke="#f7f1e8"
        strokeWidth="8"
        fill="none"
        strokeLinecap="butt"
        strokeDasharray={arc(vigilia)}
        transform="rotate(90 60 60)"
        className="ring-live"
      />
    </svg>
  );
}
