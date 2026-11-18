import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  clearHostToken,
  downloadBackup,
  drawTeams,
  getHostToken,
  hostLogin,
  hostOverview,
  removeGuest,
  restoreBackup,
  reviewPhoto,
  setHostToken,
  setPhase,
} from "./api";
import type { HostOverview, HostSubmission } from "./types";
import { TEAMS } from "./types";
import { btnDanger, btnGhost, btnPrimary, Feedback, useAction } from "./ui";

type Tab = "fotos" | "times" | "convidados" | "noite";

export function HostApp() {
  const [overview, setOverview] = useState<HostOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(Boolean(getHostToken()));

  const load = useCallback(async () => {
    try {
      setOverview(await hostOverview());
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não deu certo.";
      if (message.toLowerCase().includes("pin") || message.toLowerCase().includes("sessão")) {
        clearHostToken();
        setAuthed(false);
      }
      setError(message);
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    void load();
    let source: EventSource | null = null;
    try {
      source = new EventSource("/api/events");
      source.onmessage = () => void load();
    } catch {
      source = null;
    }
    const poll = window.setInterval(() => void load(), 8000);
    return () => {
      source?.close();
      window.clearInterval(poll);
    };
  }, [authed, load]);

  if (!authed) return <PinGate onReady={() => setAuthed(true)} />;

  return (
    <div className="relative min-h-dvh">
      <div className="relative mx-auto min-h-dvh w-full max-w-6xl px-4 pt-6 pb-24">
        <header className="mb-6 flex items-end justify-between gap-3">
          <div>
            <p className="kicker text-bone/80">Mestre</p>
            <h1 className="blood-title text-6xl">22Evy</h1>
          </div>
          <a className="inline-flex min-h-11 items-center text-sm uppercase tracking-[0.14em] text-bone" href="/">
            Voltar
          </a>
        </header>
        {error && <p className="mb-3 text-sm text-ember">{error}</p>}
        {overview && <TeamsUnlock overview={overview} onChange={() => void load()} />}
        {overview && <BackupBar onChange={() => void load()} />}
        {overview && <HostBody overview={overview} onChange={() => void load()} />}
      </div>
    </div>
  );
}

function PinGate({ onReady }: { onReady: () => void }) {
  const [pin, setPin] = useState("");
  const action = useAction();
  return (
    <div className="relative min-h-dvh">
      <form
        className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-3 px-4"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(async () => {
            const result = await hostLogin(pin);
            setHostToken(result.token);
            onReady();
          });
        }}
      >
        <p className="kicker text-center text-bone">Mestre</p>
        <h1 className="blood-title text-center text-7xl">22Evy</h1>
        <div className="sheet space-y-3">
          <label className="block text-sm" htmlFor="pin">
            PIN
          </label>
          <input
            id="pin"
            className="field"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
          />
          <button className={btnPrimary} disabled={action.state === "pending"}>
            {action.state === "pending" ? "Entrando…" : "Entrar"}
          </button>
          <Feedback state={action.state} message={action.message} />
        </div>
        <a className="min-h-11 text-center text-sm uppercase tracking-[0.14em] text-bone/80" href="/">
          Voltar para a festa
        </a>
      </form>
    </div>
  );
}

function TeamsUnlock({ overview, onChange }: { overview: HostOverview; onChange: () => void }) {
  const action = useAction();
  const waiting = overview.guests.filter((guest) => guest.joinedGame && !guest.team).length;
  const players = overview.guests.filter((guest) => guest.joinedGame).length;
  const live = overview.phase === "live";
  const done = live && overview.teamsUnlocked && waiting === 0;
  const canRun = players > 0 && (!live || !overview.teamsUnlocked || waiting > 0);

  return (
    <section className="sheet mb-4 space-y-3">
      <p className="font-display text-3xl">
        {done ? "A brincadeira está liberada." : waiting ? "Tem gente esperando o sorteio." : "A brincadeira ainda está fechada."}
      </p>
      <p className="text-sm text-bone/70">
        {done
          ? "Os times já aparecem para quem entrou. As marcas estão abertas."
          : "Um clique só: sorteia Seita e Ordem, mostra o time de cada pessoa e abre as marcas."}
      </p>
      <button
        className={btnPrimary}
        disabled={action.state === "pending" || !canRun}
        onClick={() =>
          void action.run(async () => {
            await drawTeams();
            onChange();
          }, "A Noite de ritual começou. Os times já aparecem para o pessoal.")
        }
      >
        {done ? "Brincadeira liberada" : "Liberar a brincadeira"}
      </button>
      <Feedback state={action.state} message={action.message} />
    </section>
  );
}

function BackupBar({ onChange }: { onChange: () => void }) {
  const action = useAction();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <section className="sheet mb-4 space-y-3">
      <p className="font-display text-3xl">Backup</p>
      <p className="text-sm text-bone/70">
        Lista, times e fotos ficam no banco da festa. O JSON de backup ainda baixa tudo neste aparelho.
        Se algo falhar, sobe o arquivo de novo.
      </p>
      <button
        className={btnPrimary}
        disabled={action.state === "pending"}
        onClick={() =>
          void action.run(async () => {
            await downloadBackup();
          }, "Backup salvo neste aparelho.")
        }
      >
        Baixar backup
      </button>
      <button className={btnGhost} disabled={action.state === "pending"} onClick={() => fileRef.current?.click()}>
        Restaurar backup
      </button>
      <input
        ref={fileRef}
        className="hidden"
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          if (!window.confirm("Isso substitui a lista atual da festa pelo arquivo. Continua?")) return;
          void action.run(async () => {
            const text = await file.text();
            let payload: unknown;
            try {
              payload = JSON.parse(text);
            } catch {
              throw new Error("Esse arquivo não é um backup da festa.");
            }
            await restoreBackup(payload);
            onChange();
          }, "Backup restaurado.");
        }}
      />
      <Feedback state={action.state} message={action.message} />
    </section>
  );
}

function HostBody({ overview, onChange }: { overview: HostOverview; onChange: () => void }) {
  const [tab, setTab] = useState<Tab>("fotos");
  const [open, setOpen] = useState<HostSubmission | null>(null);
  const pending = overview.submissions.filter((item) => item.status === "pending").length;

  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-2 text-center text-sm">
        <Stat label="Confirmados" value={String(overview.counts.going)} />
        <Stat label="Seita" value={`${overview.score.ritual}/${overview.score.total}`} />
        <Stat label="Ordem" value={`${overview.score.vigilia}/${overview.score.total}`} />
      </div>
      {tab === "fotos" && (
        <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
          {overview.submissions.length === 0 && <p className="text-sm text-bone/60">Nenhuma foto ainda.</p>}
          {overview.submissions.map((item) => (
            <li key={item.id}>
              <button
                className="sheet-row"
                onClick={() => setOpen(item)}
              >
                <img src={item.photoUrl} alt="" className="h-16 w-16 object-cover" />
                <span>
                  <span className="block font-medium">{item.missionTitle}</span>
                  <span className="text-sm text-bone/65">
                    {item.guestName} · {item.team ? TEAMS[item.team].short : ""} · {labelStatus(item.status)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {tab === "times" && <TeamsLists overview={overview} />}
      {tab === "convidados" && <GuestList overview={overview} onChange={onChange} />}
      {tab === "noite" && <NightPanel overview={overview} onChange={onChange} />}
      {open && (
        <Review
          item={open}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null);
            onChange();
          }}
        />
      )}
      <nav className="fixed inset-x-0 bottom-0 z-10 bg-[#120608] px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
          <TabButton active={tab === "fotos"} onClick={() => setTab("fotos")}>
            Fotos{pending ? ` ${pending}` : ""}
          </TabButton>
          <TabButton active={tab === "times"} onClick={() => setTab("times")}>
            Times
          </TabButton>
          <TabButton active={tab === "convidados"} onClick={() => setTab("convidados")}>
            Lista
          </TabButton>
          <TabButton active={tab === "noite"} onClick={() => setTab("noite")}>
            Noite
          </TabButton>
        </div>
      </nav>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-1 py-2 text-center">
      <div className="blood-title text-4xl">{value}</div>
      <div className="kicker mt-1 text-[10px] text-bone/80">{label}</div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      className={`nav-tab min-h-12 text-base ${active ? "text-[#f7f1e8]" : "text-[#f7f1e8]/45"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TeamsLists({ overview }: { overview: HostOverview }) {
  const players = overview.guests.filter((guest) => guest.joinedGame);
  const skipped = overview.guests.filter((guest) => guest.declinedGame);

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="font-display text-3xl">Na brincadeira</h2>
        {players.length === 0 && <p className="text-sm text-bone/60">Ninguém confirmou participação ainda.</p>}
        <ul className="space-y-2">
          {players.map((guest) => (
            <li key={guest.id} className="sheet-row">
              <span className="font-medium">{guest.name}</span>
              <span className="text-sm text-bone/70">{guest.team ? TEAMS[guest.team].name : "Não sorteado"}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="font-display text-3xl">Fora da brincadeira</h2>
        {skipped.length === 0 && <p className="text-sm text-bone/60">Ninguém ficou de fora ainda.</p>}
        <ul className="space-y-2">
          {skipped.map((guest) => (
            <li key={guest.id} className="sheet">
              <p className="font-medium">{guest.name}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function GuestList({ overview, onChange }: { overview: HostOverview; onChange: () => void }) {
  const action = useAction();
  return (
    <ul className="space-y-2">
      {overview.guests.length === 0 && <p className="text-sm text-bone/60">Ninguém entrou ainda.</p>}
      {overview.guests.map((guest) => (
        <li key={guest.id} className="sheet">
          <p className="font-medium">{guest.name}</p>
          <p className="text-sm text-bone/65">{guest.phone || "Sem telefone"}</p>
          <p className="text-sm text-bone/65">
            {guest.status === "going" ? "Vai" : guest.status === "not_going" ? "Não vai" : "Sem resposta"} ·{" "}
            {guest.team ? TEAMS[guest.team].short : "Não sorteado"}
          </p>
          <p className="text-sm text-bone/80">Churrasco: {guest.bringing || "Não descreveu."}</p>
          <p className="text-sm text-bone/80">Bebida: {guest.drink || "Não descreveu."}</p>
          <button
            className="mt-2 min-h-11 text-sm text-ember"
            disabled={action.state === "pending"}
            onClick={() => {
              if (!window.confirm(`Tirar ${guest.name} da festa?`)) return;
              void action.run(async () => {
                await removeGuest(guest.id);
                onChange();
              });
            }}
          >
            Tirar da lista
          </button>
        </li>
      ))}
      <Feedback state={action.state} message={action.message} />
    </ul>
  );
}

function NightPanel({ overview, onChange }: { overview: HostOverview; onChange: () => void }) {
  const action = useAction();
  const live = overview.phase === "live";
  return (
    <section className="sheet space-y-3">
      <p className="text-sm text-bone/70">
        {overview.party.whenLabel}. {overview.party.address}.
      </p>
      <p className="font-display text-3xl">{live ? "A brincadeira está liberada." : "A brincadeira ainda está fechada."}</p>
      <p className="text-sm text-bone/65">
        Seita {people(overview.counts.ritual)} · Ordem {people(overview.counts.vigilia)}
      </p>
      {overview.winner && (
        <p className="text-gold">O prêmio é de {TEAMS[overview.winner].short.toLowerCase()}.</p>
      )}
      <button
        className={btnGhost}
        disabled={action.state === "pending"}
        onClick={() =>
          void action.run(async () => {
            await setPhase("auto");
            onChange();
          }, "A noite segue o relógio da festa.")
        }
      >
        Seguir o relógio da festa
      </button>
      <Feedback state={action.state} message={action.message} />
    </section>
  );
}

function Review({ item, onClose, onDone }: { item: HostSubmission; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(item.rejectReason || "");
  const [returning, setReturning] = useState(false);
  const action = useAction();

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-[#2a0608]/80 sm:items-center" role="dialog" aria-modal="true">
      <div className="sheet max-h-[94dvh] w-full max-w-lg overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-bone/60">
              {item.guestName} · {item.team ? TEAMS[item.team].short : ""}
            </p>
            <h2 className="font-display text-4xl leading-none">{item.missionTitle}</h2>
          </div>
          <button className="min-h-11 border border-[#120608]/30 px-3 text-xs uppercase tracking-[0.14em]" onClick={onClose}>
            Fechar
          </button>
        </div>
        <img src={item.photoUrl} alt={`Foto de ${item.missionTitle}`} className="mb-4 max-h-[50dvh] w-full bg-[#120608] object-contain" />
        <a className={`${btnGhost} mb-4`} href={`${item.photoUrl}?download=1`} download>
          Salvar esta foto
        </a>
        <div className="space-y-3">
          <button
            className={btnPrimary}
            disabled={action.state === "pending"}
            onClick={() =>
              void action.run(async () => {
                await reviewPhoto(item.id, "accepted");
                onDone();
              }, "Foto aceita.")
            }
          >
            {action.state === "pending" && !returning ? "Aceitando…" : "Aceitar"}
          </button>
          {!returning ? (
            <button className={btnDanger} onClick={() => setReturning(true)}>
              Devolver
            </button>
          ) : (
            <>
              <label className="block text-sm text-bone/70">
                Motivo
                <textarea
                  className="field mt-2 min-h-20 py-3"
                  maxLength={140}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Não dá para ver a marca"
                />
              </label>
              <button
                className={btnDanger}
                disabled={action.state === "pending"}
                onClick={() =>
                  void action.run(async () => {
                    await reviewPhoto(item.id, "rejected", reason);
                    onDone();
                  }, "Foto devolvida.")
                }
              >
                {action.state === "pending" ? "Devolvendo…" : "Devolver a foto"}
              </button>
            </>
          )}
          <Feedback state={action.state} message={action.message} />
        </div>
      </div>
    </div>
  );
}

function people(count: number) {
  return `${count} ${count === 1 ? "pessoa" : "pessoas"}`;
}

function labelStatus(status: HostSubmission["status"]) {
  if (status === "accepted") return "aceita";
  if (status === "rejected") return "devolvida";
  return "esperando";
}
