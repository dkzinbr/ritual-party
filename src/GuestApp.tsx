import { useEffect, useRef, useState, type ReactNode } from "react";
import { clearToken, createGuest, joinGame, leaveGame, setToken, updateMe, uploadPhoto } from "./api";
import { useParty } from "./context";
import type { Me, MissionView, TeamId } from "./types";
import { TEAMS } from "./types";
import { btnGhost, btnPrimary, Countdown, Feedback, RitualRing, useAction } from "./ui";

export function GuestApp() {
  const { state, loading, error, offline, refresh } = useParty();
  const [reveal, setReveal] = useState<TeamId | null>(null);
  const shownReveal = useRef(false);

  useEffect(() => {
    const me = state?.me;
    if (me?.team && me.teamSeen && !shownReveal.current) {
      shownReveal.current = true;
      setReveal(me.team);
    }
  }, [state?.me]);

  if (loading && !state) {
    return (
      <Shell>
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-bone">
          <img src="/marca.png" alt="" className="h-28 w-auto" />
          <p className="kicker">Abrindo a noite</p>
        </div>
      </Shell>
    );
  }

  if (!state) {
    return (
      <Shell>
        <div className="space-y-4">
          <p className="text-bone">{error || "Não consegui abrir a festa."}</p>
          <button className={btnPrimary} onClick={() => void refresh()}>
            Tentar de novo
          </button>
        </div>
      </Shell>
    );
  }

  const me = state.me;
  const clockReady = Boolean(me?.joinedGame || me?.declinedGame);

  return (
    <Shell>
      {offline && (
        <p className="sheet mb-4 text-sm text-ember" role="status">
          Sem conexão com a festa. Tentando de novo…
        </p>
      )}
      <div className="mx-auto w-full max-w-lg lg:max-w-6xl lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start lg:gap-16">
        <header className="mb-8 text-center lg:sticky lg:top-10">
          <div className="mb-3 flex items-center justify-center gap-3">
            <img src="/marca.png" alt="" className="h-16 w-auto shrink-0 sm:h-20 lg:h-24" />
            <h1 className="hero-word text-7xl sm:text-8xl lg:text-9xl" data-text="22Evy">
              22Evy
            </h1>
          </div>
          {clockReady && (
            <>
              <div className="brush mx-auto my-5 w-full max-w-xs" />
              {state.party.phase === "before" || !me?.teamSeen ? (
                <Countdown startsAt={state.party.startsAt} serverNow={state.party.serverNow} />
              ) : (
                <div className="flex items-center justify-center gap-4">
                  <RitualRing ritual={state.score.ritual} vigilia={state.score.vigilia} total={state.score.total} />
                  <ScoreLines score={state.score} />
                </div>
              )}
            </>
          )}
          <a
            className="mt-5 inline-flex min-h-11 items-center text-sm font-medium text-bone underline decoration-bone/50 underline-offset-4"
            href={state.party.mapsUrl}
            target="_blank"
            rel="noreferrer"
          >
            {state.party.address}
          </a>
          <p className="text-xs tracking-wide text-bone/75">
            {state.party.whenLabel} · {state.party.timezoneLabel}
          </p>
          {state.party.phase === "live" && me?.teamSeen && state.winner && (
            <p className="sheet mx-auto mt-4 max-w-sm text-center font-display text-2xl">
              {state.winner === "ritual" ? "O ritual se completou." : "O ritual foi interrompido."} O prêmio é de{" "}
              {TEAMS[state.winner].short}.
            </p>
          )}
        </header>

        <main>
          {guestStep(me) === "name" && <AskName me={me} onDone={() => void refresh()} />}
          {guestStep(me) === "presence" && me && <AskPresence name={me.name} onDone={() => void refresh()} />}
          {guestStep(me) === "farewell" && me && <Farewell name={me.name} />}
          {guestStep(me) === "bringing" && me && (
            <Bringing meat={me.bringing} drink={me.drink} onDone={() => void refresh()} />
          )}
          {guestStep(me) === "game" && <GameAsk onDone={() => void refresh()} />}
          {guestStep(me) === "night" && me && <Night me={me} onDone={() => void refresh()} />}
        </main>
      </div>
      {reveal && <TeamReveal team={reveal} onClose={() => setReveal(null)} />}
      <footer className="mx-auto mt-10 flex w-full max-w-lg justify-end text-xs uppercase tracking-[0.16em] text-bone/70 lg:max-w-6xl">
        <a className="min-h-11 inline-flex items-center" href="/mestre">
          Área do mestre
        </a>
      </footer>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh">
      <div className="relative mx-auto w-full max-w-6xl px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 lg:py-12">
        {children}
      </div>
    </div>
  );
}

function ScoreLines({ score }: { score: { ritual: number; vigilia: number; total: number } }) {
  return (
    <div className="space-y-2 text-sm">
      <p>
        <span className="text-bone">Seita</span> {score.ritual}/{score.total}
      </p>
      <p>
        <span>Ordem</span> {score.vigilia}/{score.total}
      </p>
    </div>
  );
}

function guestStep(me: Me | null) {
  if (!me) return "name";
  if (me.status == null) return "presence";
  if (me.status === "not_going") return "farewell";
  if (!me.bringingReady) return "bringing";
  if (!me.joinedGame && !me.declinedGame) return "game";
  return "night";
}

function AskName({ me, onDone }: { me: Me | null; onDone: () => void }) {
  const [name, setName] = useState(me?.name ?? "");
  const [phone, setPhone] = useState(me?.phone ?? "");
  const action = useAction();

  return (
    <form
      className="sheet space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          const created = await createGuest(name, phone);
          setToken(created.token);
          onDone();
        });
      }}
    >
      <h2 className="font-display text-3xl">Entrar na festa</h2>
      <label className="block text-sm text-bone/70" htmlFor="nome">
        Como você quer aparecer
      </label>
      <input
        id="nome"
        className="field"
        autoComplete="name"
        maxLength={40}
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
      <label className="block text-sm text-bone/70" htmlFor="telefone">
        Celular com DDD
      </label>
      <input
        id="telefone"
        className="field"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="(11) 99999-9999"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        required
      />
      <p className="text-xs leading-relaxed text-bone/60">
        Com o mesmo número você entra de qualquer celular e as suas respostas continuam iguais.
      </p>
      <button className={btnPrimary} disabled={action.state === "pending"}>
        {action.state === "pending" ? "Entrando…" : "Continuar"}
      </button>
      <Feedback state={action.state} message={action.message} />
    </form>
  );
}

function AskPresence({ name, onDone }: { name: string; onDone: () => void }) {
  const yes = useAction();
  const no = useAction();
  const busy = yes.state === "pending" || no.state === "pending";

  return (
    <section className="sheet space-y-3">
      <h2 className="font-display text-3xl">Você vai conseguir ir, {name}?</h2>
      <button
        className={btnPrimary}
        disabled={busy}
        onClick={() =>
          void yes.run(async () => {
            await updateMe({ status: "going" });
            onDone();
          }, "Presença confirmada.")
        }
      >
        {yes.state === "pending" ? "Salvando…" : "Sim, vou"}
      </button>
      <button
        className={btnGhost}
        disabled={busy}
        onClick={() =>
          void no.run(async () => {
            await updateMe({ status: "not_going" });
            onDone();
          })
        }
      >
        {no.state === "pending" ? "Salvando…" : "Não vou"}
      </button>
      <Feedback state={yes.state === "idle" ? no.state : yes.state} message={yes.message || no.message} />
    </section>
  );
}

function Farewell({ name }: { name: string }) {
  return (
    <section className="sheet space-y-5 text-center">
      <h2 className="font-display text-3xl">{name}</h2>
      <p className="text-sm leading-relaxed text-bone/80">
        Que pena que não vai conseguir vir, obrigado pela atenção, tenho certeza que teremos outra oportunidade.
      </p>
      <p className="py-8 text-8xl leading-none" aria-hidden="true">
        😔
      </p>
      <button
        className="min-h-11 text-sm text-bone/50"
        onClick={() => {
          clearToken();
          window.location.reload();
        }}
      >
        Entrar com outro número neste celular
      </button>
    </section>
  );
}

function Bringing({
  meat,
  drink,
  onDone,
}: {
  meat: string;
  drink: string;
  onDone: () => void;
}) {
  const [bringing, setBringing] = useState(meat);
  const [alcool, setAlcool] = useState(drink);
  const action = useAction();

  return (
    <form
      className="sheet space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          await updateMe({ bringing, drink: alcool });
          onDone();
        }, "Itens salvos.");
      }}
    >
      <h2 className="font-display text-3xl">Você vai</h2>
      <p className="text-sm leading-relaxed text-bone/80">
        Ótimo, ficamos muito felizes com sua presença. A festa vai acontecer no dia 31 de outubro, dia das bruxas 🧙‍♀️.
        Vamos ter brincadeiras e um churrasco, e como todo ano cada pessoa traz 1 kg de carne e a bebida alcoólica que
        vai consumir. Obrigado de novo pela confirmação.
      </p>
      <label className="block space-y-2 text-sm text-bone/70">
        O que você traz para o churrasco
        <textarea
          className="field min-h-24 py-3"
          maxLength={280}
          placeholder="1 kg de carne"
          value={bringing}
          onChange={(event) => setBringing(event.target.value)}
        />
      </label>
      <label className="block space-y-2 text-sm text-bone/70">
        Qual bebida alcoólica você leva
        <textarea
          className="field min-h-24 py-3"
          maxLength={280}
          placeholder="A bebida alcoólica que você vai consumir"
          value={alcool}
          onChange={(event) => setAlcool(event.target.value)}
        />
      </label>
      <button className={btnPrimary} disabled={action.state === "pending"}>
        {action.state === "pending" ? "Salvando…" : "Continuar"}
      </button>
      <Feedback state={action.state} message={action.message} />
    </form>
  );
}

function GameAsk({ onDone }: { onDone: () => void }) {
  const join = useAction();
  const decline = useAction();
  const busy = join.state === "pending" || decline.state === "pending";

  return (
    <section className="sheet space-y-3">
      <h2 className="font-display text-3xl">Noite de ritual</h2>
      <p className="leading-relaxed text-bone/80">
        Relaxa, ninguém vai abrir um portal no quintal. É uma brincadeira: dois times, cinco marcas e um prêmio no fim.
      </p>
      <p className="leading-relaxed text-bone/80">
        A Seita tenta completar o ritual. A Ordem tenta impedir. O mestre junta quem confirmou e, quando liberar a
        brincadeira, sorteia os dois lados e mostra o seu time.
      </p>
      <p className="leading-relaxed text-bone/80">
        Quando a brincadeira começar, cada time recebe cinco marcas. Tira foto, o mestre aceita ou manda refazer. Quem
        fechar as cinco primeiro leva o prêmio. Quem ficar de fora continua no churrasco, sem culpa e sem marca.
      </p>
      <button
        className={btnPrimary}
        disabled={busy}
        onClick={() =>
          void join.run(async () => {
            await joinGame();
            onDone();
          }, "Participação confirmada.")
        }
      >
        {join.state === "pending" ? "Confirmando…" : "Eu participo"}
      </button>
      <button
        className={btnGhost}
        disabled={busy}
        onClick={() =>
          void decline.run(async () => {
            await updateMe({ declinedGame: true });
            onDone();
          }, "Você ficou de fora da Noite de ritual.")
        }
      >
        {decline.state === "pending" ? "Salvando…" : "Não participo"}
      </button>
      <Feedback state={join.state === "idle" ? decline.state : join.state} message={join.message || decline.message} />
    </section>
  );
}

function Night({
  me,
  onDone,
}: {
  me: Me;
  onDone: () => void;
}) {
  const { state } = useParty();
  const [mission, setMission] = useState<MissionView | null>(null);
  const action = useAction();
  const phase = state?.party.phase;

  return (
    <div className="space-y-4">
      {phase === "live" && me.teamSeen && state?.missions && (
        <section className="space-y-2">
          <h2 className="font-display text-3xl">Suas marcas</h2>
          {state.missions.map((item) => (
            <button
              key={item.id}
              className="sheet-row active:scale-[0.99]"
              onClick={() => setMission(item)}
            >
              <span>
                <span className="block font-medium">{item.title}</span>
                <span className="text-sm text-bone/60">{statusLabel(item.status)}</span>
              </span>
              <StatusDot status={item.status} />
            </button>
          ))}
        </section>
      )}

      {me.joinedGame && !me.teamSeen && (
        <section className="sheet space-y-3">
          <h2 className="font-display text-3xl">Você está dentro</h2>
          <p className="leading-relaxed text-bone/80">
            Participação confirmada. Quando o mestre liberar a brincadeira, o sorteio acontece e o seu time aparece.
          </p>
          <button
            className={btnGhost}
            disabled={action.state === "pending"}
            onClick={() => {
              if (!window.confirm("Sair tira você da lista do sorteio. Se voltar, espera a próxima liberação.")) return;
              void action.run(async () => {
                await leaveGame();
                onDone();
              }, "Você saiu da Noite de ritual.");
            }}
          >
            Sair da Noite de ritual
          </button>
          <Feedback state={action.state} message={action.message} />
        </section>
      )}

      {me.joinedGame && me.teamSeen && me.team && (
        <section className="sheet space-y-3">
          <p className="kicker">Seu time</p>
          {me.team === "vigilia" && <OrdemMark ink />}
          {me.team === "ritual" && <SeitaMark />}
          <h2 className="font-display text-4xl leading-none">{TEAMS[me.team].name}</h2>
          <p className="text-sm text-bone/70">{TEAMS[me.team].line}</p>
          {phase === "before" && (
            <p className="text-sm text-bone/70">As marcas abrem às 18h, ou quando o mestre liberar a brincadeira.</p>
          )}
          <button
            className={btnGhost}
            disabled={action.state === "pending"}
            onClick={() => {
              if (!window.confirm("Sair libera a sua vaga na Noite de ritual. Se voltar, espera o próximo sorteio.")) return;
              void action.run(async () => {
                await leaveGame();
                onDone();
              }, "Você saiu da Noite de ritual.");
            }}
          >
            Sair da Noite de ritual
          </button>
          <Feedback state={action.state} message={action.message} />
        </section>
      )}

      {me.status === "going" && me.declinedGame && !me.joinedGame && (
        <section className="sheet space-y-3">
          <h2 className="font-display text-3xl">Fora da Noite de ritual</h2>
          <button
            className={btnPrimary}
            disabled={action.state === "pending"}
            onClick={() =>
              void action.run(async () => {
                await joinGame();
                onDone();
              })
            }
          >
            {action.state === "pending" ? "Confirmando…" : "Eu participo"}
          </button>
          <Feedback state={action.state} message={action.message} />
        </section>
      )}

      <button
        className="min-h-11 text-sm text-bone/50"
        onClick={() => {
          clearToken();
          window.location.reload();
        }}
      >
        Entrar com outro número neste celular
      </button>

      {mission && (
        <MissionSheet
          mission={mission}
          onClose={() => setMission(null)}
          onSent={() => {
            setMission(null);
            onDone();
          }}
        />
      )}
    </div>
  );
}

function statusLabel(status: MissionView["status"]) {
  if (status === "accepted") return "Aceita";
  if (status === "pending") return "O mestre está olhando";
  if (status === "rejected") return "Devolvida";
  return "Aberta";
}

function StatusDot({ status }: { status: MissionView["status"] }) {
  const color =
    status === "accepted" ? "bg-[#120608]" : status === "pending" ? "bg-[#8d1d24]" : status === "rejected" ? "bg-[#c4483a]" : "bg-[#120608]/30";
  return <span className={`h-3 w-3 shrink-0 rounded-full ${color}`} aria-hidden="true" />;
}

function OrdemMark({ ink = false }: { ink?: boolean }) {
  return (
    <img
      src={ink ? "/ordem-ink.png" : "/ordem.png"}
      alt="Símbolo da Ordem"
      className={`mx-auto w-auto ${ink ? "h-40" : "h-56"}`}
    />
  );
}

function SeitaMark({ large = false }: { large?: boolean }) {
  return (
    <img
      src="/seita.png"
      alt="Símbolo da Seita"
      className={`mx-auto w-auto ${large ? "h-64" : "h-48"}`}
    />
  );
}

function TeamReveal({ team, onClose }: { team: TeamId; onClose: () => void }) {
  const info = TEAMS[team];
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/80 p-5">
      <div className="rise w-full max-w-md space-y-4 text-center">
        {team === "vigilia" ? <OrdemMark /> : <SeitaMark large />}
        <p className="kicker text-bone">Seu time</p>
        <h2 className="blood-title text-6xl">{info.name}</h2>
        <p className="text-sm leading-relaxed text-bone">{info.line}</p>
        <div className="brush mx-auto w-40" />
        <button
          className="flex min-h-12 w-full items-center justify-center bg-[#f7f1e8] px-5 text-[#120608] active:scale-[0.98]"
          onClick={onClose}
        >
          Estou nesse time
        </button>
      </div>
    </div>
  );
}

async function compress(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não consegui ler essa foto. Tira outra.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) throw new Error("Não consegui ler essa foto. Tira outra.");
  return blob;
}

function MissionSheet({
  mission,
  onClose,
  onSent,
}: {
  mission: MissionView;
  onClose: () => void;
  onSent: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [pct, setPct] = useState(0);
  const [phase, setPhase] = useState<"idle" | "sending" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const locked = mission.status === "accepted" || mission.status === "pending";

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    try {
      const next = await compress(file);
      if (preview) URL.revokeObjectURL(preview);
      setBlob(next);
      setPreview(URL.createObjectURL(next));
      setPhase("idle");
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Não consegui ler essa foto. Tira outra.");
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-[#2a0608]/80 sm:items-center" role="dialog" aria-modal="true">
      <div className="sheet max-h-[92dvh] w-full max-w-lg overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="kicker">{statusLabel(mission.status)}</p>
            <h2 className="text-4xl">{mission.title}</h2>
          </div>
          <button className="min-h-11 border border-[#120608]/30 px-3 text-xs uppercase tracking-[0.14em]" onClick={onClose}>
            Fechar
          </button>
        </div>
        <p className="mb-4 text-sm leading-relaxed">{mission.description}</p>
        {mission.status === "rejected" && mission.rejectReason && (
          <p className="mb-4 text-sm text-ember">{mission.rejectReason}</p>
        )}
        {mission.status === "accepted" && <p className="mb-4 font-medium">Marca cumprida.</p>}
        {mission.status === "pending" && <p className="mb-4">O mestre está olhando essa foto.</p>}
        {!locked && (
          <div className="space-y-3">
            {preview && <img src={preview} alt="Prévia da foto da missão" className="max-h-72 w-full bg-[#120608] object-contain" />}
            <label className={btnGhost}>
              Fotografar ou escolher
              <input
                className="sr-only"
                type="file"
                accept="image/*"
                onChange={(event) => void onFile(event.target.files?.[0])}
              />
            </label>
            <button
              className={btnPrimary}
              disabled={!blob || phase === "sending"}
              onClick={() => {
                if (!blob) return;
                setPhase("sending");
                setPct(0);
                setMessage(null);
                void uploadPhoto(mission.id, blob, setPct)
                  .then(() => onSent())
                  .catch((err: unknown) => {
                    setPhase("error");
                    setMessage(err instanceof Error ? err.message : "A foto não saiu. Tente de novo.");
                  });
              }}
            >
              {phase === "sending" ? `Enviando ${pct}%` : "Enviar foto"}
            </button>
            {phase === "sending" && (
              <div className="h-1.5 overflow-hidden bg-[#120608]/20" aria-hidden="true">
                <div className="h-full bg-[#120608]" style={{ width: `${pct}%` }} />
              </div>
            )}
            <Feedback state={phase === "error" ? "error" : "idle"} message={message} />
          </div>
        )}
      </div>
    </div>
  );
}
