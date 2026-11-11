import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Copy, Crown, Crosshair, Eye, Swords, Volume2, VolumeX } from "lucide-react";
import { startGame, type GameApi, type Hud } from "@/game/main";

function remember(name: string) {
  try {
    localStorage.setItem("ashen-hold-name", name);
  } catch {
    /* ignore */
  }
}

export function AshenHold() {
  const view = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const api = useRef<GameApi | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("Aldren");
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState("");
  const [joinErr, setJoinErr] = useState("");
  const [touch, setTouch] = useState(false);
  const [sens, setSens] = useState(1);
  const [muted, setMuted] = useState(false);
  const [best, setBest] = useState(0);
  const [charge, setCharge] = useState(false);
  const [copied, setCopied] = useState(false);
  const [how, setHow] = useState(false);
  const [draft, setDraft] = useState("");
  const [roostOpen, setRoostOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pinMap, setPinMap] = useState(true);
  const [dest, setDest] = useState("mill");
  const chatRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const apply = () => setTouch(mq.matches || window.innerWidth < 860);
    apply();
    mq.addEventListener("change", apply);
    window.addEventListener("resize", apply);
    try {
      const saved = localStorage.getItem("ashen-hold-name");
      if (saved) setName(saved);
      const s = Number(localStorage.getItem("ashen-hold-sens"));
      if (s >= 0.4 && s <= 2) setSens(s);
      setMuted(localStorage.getItem("ashen-hold-muted") === "1");
      setBest(Number(localStorage.getItem("ashen-hold-best") ?? 0));
    } catch {
      /* ignore */
    }
    return () => {
      mq.removeEventListener("change", apply);
      window.removeEventListener("resize", apply);
    };
  }, []);

  useEffect(() => {
    const viewEl = view.current;
    const overEl = overlay.current;
    const miniEl = mini.current;
    if (!viewEl || !overEl || !miniEl) return;
    const game = startGame({
      view: viewEl,
      overlay: overEl,
      mini: miniEl,
      onHud: setHud,
      onError: setError,
    });
    api.current = game;
    try {
      const s = Number(localStorage.getItem("ashen-hold-sens"));
      if (s >= 0.4 && s <= 2) game.setSens(s);
      if (localStorage.getItem("ashen-hold-muted") === "1") game.setMuted(true);
    } catch {
      /* ignore */
    }
    return () => {
      game.destroy();
      api.current = null;
    };
  }, []);

  const phase = hud?.phase ?? "menu";
  const playing = phase === "play";
  const showTouch = touch && playing && !hud?.paused;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing = Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA"));
      if (typing) {
        if (e.code === "Escape") {
          e.preventDefault();
          el?.blur();
        }
        return;
      }
      if (e.code === "Enter" && playing && !hud?.paused) {
        e.preventDefault();
        document.exitPointerLock();
        chatRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, hud?.paused]);

  function enterSolo() {
    remember(name);
    api.current?.beginSolo(name);
  }
  function host() {
    remember(name);
    api.current?.beginHost(name);
  }
  function join(e: FormEvent) {
    e.preventDefault();
    remember(name);
    const ok = api.current?.beginJoin(name, code);
    if (!ok) setJoinErr("A banner code is four letters.");
    else setJoinErr("");
  }

  async function copyCode() {
    if (!hud?.room) return;
    try {
      await navigator.clipboard.writeText(hud.room.toUpperCase());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-ink text-parchment">
      <canvas ref={view} className="absolute inset-0 h-full w-full touch-none" aria-label="Ashen Hold vale" />
      <canvas ref={overlay} className="pointer-events-none absolute inset-0 h-full w-full" />
      <canvas
        ref={mini}
        width={132}
        height={132}
        className={`pointer-events-auto absolute z-20 h-24 w-24 border border-brass md:h-32 md:w-32 ${
          playing ? (showTouch ? "right-3 bottom-64" : "right-3 bottom-3 md:right-4 md:bottom-4") : "hidden"
        }`}
        aria-label="Vale map"
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          api.current?.focusMini((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
        }}
      />

      {error ? (
        <div className="absolute inset-x-4 top-4 z-30 border border-blood bg-ink-2 p-4 text-sm">
          <p className="font-display text-blood-2">The rays failed</p>
          <p className="mt-2 text-parchment-dim">{error}</p>
        </div>
      ) : null}

      {!playing ? (
        <div className="pointer-events-none absolute inset-0 flex items-end md:items-center">
          <section className="pointer-events-auto m-3 w-full max-w-md border border-line bg-ink-2 md:m-10">
            <div className="h-1 bg-blood" />
            <div className="flex max-h-[78dvh] flex-col gap-4 overflow-auto p-4 md:p-6">
              <p className="text-xs tracking-widest text-brass uppercase">Vale of the free company</p>
              <h1 className="font-display text-4xl text-parchment md:text-5xl">Ashen Hold</h1>
              <p className="text-pretty text-parchment-dim">
                A free company on a small world-moon. Gravity keeps every knight, spear, and wolf standing on the globe.
                Ravens and a pigeon carry notes and sketched maps between the hold, the mill, the loom, the camp, and any captain still linked.
                Hold the keep, then command from the war table or fight in the flesh.
              </p>
              <label className="flex flex-col gap-1 text-sm text-mist">
                Captain
                <input
                  value={name}
                  maxLength={24}
                  onChange={(e) => setName(e.target.value)}
                  className="min-h-11 border border-line bg-ink px-3 text-parchment outline-none focus-visible:border-brass"
                  autoComplete="nickname"
                />
              </label>
              <button
                type="button"
                onClick={enterSolo}
                className="min-h-11 bg-blood px-4 py-3 text-left font-semibold text-parchment hover:bg-blood-2 focus-visible:outline-2 focus-visible:outline-brass"
              >
                Enter the Vale
                <span className="mt-1 block text-sm font-normal text-parchment-dim">Ride alone. This browser keeps the watch.</span>
              </button>
              <button
                type="button"
                onClick={host}
                className="min-h-11 border border-brass px-4 py-3 text-left font-semibold text-brass hover:bg-ink focus-visible:outline-2 focus-visible:outline-brass"
              >
                Host a realm
                <span className="mt-1 block text-sm font-normal text-mist">You are Warden. Share a banner code.</span>
              </button>
              {joinOpen ? (
                <form onSubmit={join} className="flex flex-col gap-2">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="Banner code"
                    maxLength={8}
                    className="min-h-11 border border-line bg-ink px-3 font-display tracking-widest text-parchment uppercase outline-none focus-visible:border-brass"
                    aria-label="Banner code"
                  />
                  <button type="submit" className="min-h-11 bg-moss px-4 font-semibold text-parchment">
                    Take the road
                  </button>
                  {joinErr ? <p className="text-sm text-blood-2">{joinErr}</p> : null}
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setJoinOpen(true)}
                  className="min-h-11 px-1 text-left text-sm text-mist underline-offset-4 hover:text-parchment hover:underline"
                >
                  Join by banner code
                </button>
              )}
              <button type="button" onClick={() => setHow((v) => !v)} className="text-left text-sm text-brass">
                {how ? "Hide how the realm lives" : "How the realm lives"}
              </button>
              {how ? (
                <p className="text-pretty text-sm text-mist">
                  Captains connect directly, browser to browser, over WebRTC. One of you is Warden: that tab runs the
                  bandits, the spears, and the payroll. A tiny herald only introduces you. Gameplay never waits on a
                  throne server. The vale is a globe, raytraced in the browser — primary rays, sun shadows, and water that
                  reflects along the curve. Voxels are small, so the curtain wall and the tree line read as masonry and
                  timber. Pause to set the ray resolution. Experience deepens your gifts; chat travels with the peer link.
                  If the Warden’s browser closes, the watch passes to the next captain still linked.
                </p>
              ) : null}
              <p className="text-xs text-mist tabular-nums">{best > 0 ? `Best tally ${best}` : "No tally yet"}</p>
            </div>
          </section>
        </div>
      ) : null}

      {playing && hud ? (
        <>
          <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3 md:p-4">
            <div className="pointer-events-auto max-w-[70%] border border-line bg-ink-2/95 px-3 py-2">
              <p className="text-sm text-parchment">{hud.banner}</p>
              <p className="mt-1 text-xs text-mist tabular-nums">
                Wave {hud.wave} · tally {hud.score}
                {hud.warden ? " · you hold the watch" : hud.waiting ? " · seeking warden" : " · linked"}
              </p>
              {hud.log[0] ? <p className="mt-1 text-xs text-parchment-dim italic">{hud.log[0]}</p> : null}
            </div>
            <div className="pointer-events-auto flex flex-col items-end gap-2">
              {hud.room ? (
                <button
                  type="button"
                  onClick={() => void copyCode()}
                  className="flex min-h-11 items-center gap-2 border border-brass bg-ink-2 px-3 text-brass"
                >
                  <Crown className="size-4" aria-hidden />
                  <span className="font-display tracking-widest">{hud.room.toUpperCase()}</span>
                  <Copy className="size-4" aria-hidden />
                  <span className="sr-only">{copied ? "Copied" : "Copy banner code"}</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => api.current?.togglePause()}
                className="min-h-11 border border-line bg-ink-2 px-3 text-sm text-parchment"
              >
                Pause
              </button>
              {playing ? (
                <button
                  type="button"
                  onClick={() => {
                    setRoostOpen((v) => !v);
                    document.exitPointerLock();
                    api.current?.readPost();
                  }}
                  className="min-h-11 border border-brass bg-ink-2 px-3 text-sm text-brass"
                >
                  {hud?.post.nearName ? `${hud.post.nearName} roost` : "Ravens"}
                  {hud?.post.unread ? ` · ${hud.post.unread}` : ""}
                </button>
              ) : null}
            </div>
          </header>

          {roostOpen && !hud.paused ? (
            <section className="absolute top-24 right-3 z-30 flex max-h-[70dvh] w-[min(22rem,calc(100%-1.5rem))] flex-col gap-3 overflow-auto border border-line bg-ink-2 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl">Raven roost</h2>
                  <p className="text-xs text-mist">
                    {hud.post.nearName ? `You stand at the ${hud.post.nearName}.` : "A bird will lift from your hand."}{" "}
                    {hud.post.flying} afield.
                  </p>
                </div>
                <button type="button" className="min-h-11 px-2 text-sm text-mist" onClick={() => setRoostOpen(false)}>
                  Close
                </button>
              </div>
              <label className="flex flex-col gap-1 text-sm text-mist">
                Carry this to
                <select
                  value={dest}
                  onChange={(e) => setDest(e.target.value)}
                  className="min-h-11 border border-line bg-ink px-2 text-parchment outline-none focus-visible:border-brass"
                >
                  {hud.post.towns.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                  {hud.peers
                    .filter((p) => p.state === "connected")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        Captain {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <textarea
                value={note}
                maxLength={160}
                onChange={(e) => setNote(e.target.value)}
                onFocus={() => document.exitPointerLock()}
                placeholder="A note for the roost"
                aria-label="Note for the raven"
                className="min-h-20 border border-line bg-ink px-2 py-2 text-sm text-parchment outline-none focus-visible:border-brass"
              />
              <label className="flex min-h-11 items-center gap-2 text-sm text-parchment">
                <input type="checkbox" checked={pinMap} onChange={(e) => setPinMap(e.target.checked)} className="accent-brass" />
                Pin a map of this ground
              </label>
              <button
                type="button"
                className="min-h-11 bg-blood font-semibold text-parchment"
                onClick={() => {
                  const ok = api.current?.looseRaven(dest, note, pinMap);
                  if (ok) setNote("");
                }}
              >
                Loose a raven
              </button>
              <LetterList title="Letters to you" letters={hud.post.inbox} />
              {hud.post.nearName ? <LetterList title={`${hud.post.nearName} board`} letters={hud.post.board} /> : null}
            </section>
          ) : null}

          <div className={`pointer-events-none absolute inset-x-0 flex items-end justify-between gap-3 p-3 md:p-4 ${showTouch ? "bottom-64" : "bottom-0"}`}>
            <div className="flex w-56 max-w-[70%] flex-col gap-2 md:w-64">
              {hud.chats.length || !hud.paused ? (
                <form
                  className="pointer-events-auto border border-line bg-ink-2/95 p-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const text = draft.trim();
                    if (!text) return;
                    api.current?.sendChat(text);
                    setDraft("");
                  }}
                >
                  <ul className="mb-1 max-h-20 space-y-0.5 overflow-auto" aria-live="polite">
                    {hud.chats.length ? (
                      hud.chats.map((c, i) => (
                        <li key={`${c.name}-${i}`} className="text-xs text-pretty text-parchment-dim">
                          <span className="text-brass">{c.name}</span> {c.text}
                        </li>
                      ))
                    ) : (
                      <li className="text-xs text-mist">Enter to speak</li>
                    )}
                  </ul>
                  <input
                    ref={chatRef}
                    value={draft}
                    maxLength={140}
                    onChange={(e) => setDraft(e.target.value)}
                    onFocus={() => document.exitPointerLock()}
                    placeholder="Speak"
                    aria-label="Speak to the company"
                    className="min-h-11 w-full border border-line bg-ink px-2 text-sm text-parchment outline-none focus-visible:border-brass"
                  />
                </form>
              ) : null}
              <div className="pointer-events-auto border border-line bg-ink-2 p-2">
              <div className="mb-1 flex justify-between text-xs text-mist">
                <span>Vitality</span>
                <span className="tabular-nums text-parchment">
                  {Math.ceil(hud.hp)}/{hud.maxHp}
                </span>
              </div>
              <div className="h-2 bg-ink">
                <div className="h-2 bg-blood" style={{ width: `${Math.max(0, (hud.hp / hud.maxHp) * 100)}%` }} />
              </div>
              <div className="mt-2 mb-1 flex justify-between text-xs text-mist">
                <span>Wind</span>
                <span className="tabular-nums">{Math.ceil(hud.stamina)}/{hud.sheet.staminaMax}</span>
              </div>
              <div className="h-1.5 bg-ink">
                <div className="h-1.5 bg-brass" style={{ width: `${Math.max(0, Math.min(100, (hud.stamina / hud.sheet.staminaMax) * 100))}%` }} />
              </div>
              <p className="mt-2 text-sm text-brass tabular-nums">{hud.gold} gold</p>
              <p className="text-xs text-parchment-dim">
                Rank {hud.sheet.level}
                {hud.sheet.unspent > 0 ? ` · ${hud.sheet.unspent} gift${hud.sheet.unspent === 1 ? "" : "s"}` : ""}
              </p>
              <p className="text-xs text-mist">
                {hud.mode === "rts" ? "War table" : hud.mode === "fps" ? "First person" : "Field"} · {hud.quality} · {hud.rays}px
              </p>
              {!touch && !hud.paused ? (
                <p className="mt-2 hidden text-xs text-pretty text-mist md:block">
                  WASD · mouse look · strike · F eyes · V table · Enter to speak · Ravens
                </p>
              ) : null}
              </div>
            </div>
          </div>

          {hud.mode === "rts" ? (
            <div className="pointer-events-auto absolute inset-x-0 bottom-36 flex justify-center px-3 md:bottom-40">
              <div className="flex max-w-full gap-2 overflow-auto border border-line bg-ink-2 p-2">
                <button type="button" onClick={() => api.current?.selectAll()} className="min-h-11 px-3 text-sm text-brass">
                  All spears
                </button>
                {hud.soldiers.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => api.current?.selectOne(s.id)}
                    className={`min-h-11 min-w-11 border px-2 text-xs ${s.sel ? "border-brass text-brass" : "border-line text-parchment"} ${s.down ? "opacity-40" : ""}`}
                  >
                    Spear {i + 1}
                    <span className="mt-1 block h-1 bg-ink">
                      <span className="block h-1 bg-moss" style={{ width: `${Math.max(0, (s.hp / s.max) * 100)}%` }} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {hud.nearHire ? (
            <button
              type="button"
              onClick={() => api.current?.interact()}
              className="pointer-events-auto absolute top-28 left-1/2 min-h-11 -translate-x-1/2 border border-brass bg-ink-2 px-4 text-sm text-brass"
            >
              Hire spearman · {hud.hire} gold
            </button>
          ) : null}

        </>
      ) : null}

      {playing && hud?.paused ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink/80 p-4">
          <section className="max-h-[86dvh] w-full max-w-md overflow-auto border border-line bg-ink-2">
            <div className="h-1 bg-blood" />
            <div className="flex flex-col gap-3 p-4 md:p-6">
              <h2 className="font-display text-2xl">Hold</h2>
              <p className="text-sm text-pretty text-mist">
                {hud.warden
                  ? "You are Warden. This browser is running the vale. Leave the tab and the watch tries to pass on."
                  : "Another captain’s browser is Warden. Your blows are carried to them across the peer link."}
              </p>
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-display text-lg">Rank {hud.sheet.level}</p>
                  <p className="text-xs text-mist tabular-nums">
                    {hud.sheet.xp}/{hud.sheet.next}
                    {hud.sheet.unspent > 0 ? ` · ${hud.sheet.unspent} gift${hud.sheet.unspent === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                <div className="h-1.5 bg-ink">
                  <div
                    className="h-1.5 bg-brass"
                    style={{ width: `${Math.min(100, (hud.sheet.xp / Math.max(1, hud.sheet.next)) * 100)}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["might", "Might"],
                      ["grace", "Grace"],
                      ["wit", "Wit"],
                      ["vigor", "Vigor"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      disabled={hud.sheet.unspent <= 0}
                      onClick={() => api.current?.spend(key)}
                      className="flex min-h-11 items-center justify-between border border-line px-2 text-sm text-parchment disabled:opacity-40"
                    >
                      {label}
                      <span className="tabular-nums text-brass">{hud.sheet[key]}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-mist tabular-nums">
                  Blade {hud.sheet.blade} · Bow {hud.sheet.bow} · Command {hud.sheet.command} · Lore {hud.sheet.lore}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-sm text-mist">Ray resolution</p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["Auto", null],
                      ["Coarse", 128],
                      ["Fair", 200],
                      ["Fine", 280],
                      ["Keen", 400],
                    ] as const
                  ).map(([label, n]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => api.current?.setRays(n)}
                      className={`min-h-11 px-3 text-sm ${hud.quality === label ? "border border-brass text-brass" : "border border-line text-parchment"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center justify-between gap-3 text-sm">
                Look sensitivity
                <input
                  type="range"
                  min={0.4}
                  max={2}
                  step={0.05}
                  value={sens}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setSens(v);
                    api.current?.setSens(v);
                    try {
                      localStorage.setItem("ashen-hold-sens", String(v));
                    } catch {
                      /* ignore */
                    }
                  }}
                  className="w-40 accent-brass"
                />
              </label>
              <button
                type="button"
                className="flex min-h-11 items-center gap-2 text-left text-sm text-parchment"
                onClick={() => {
                  const next = !muted;
                  setMuted(next);
                  api.current?.setMuted(next);
                  try {
                    localStorage.setItem("ashen-hold-muted", next ? "1" : "0");
                  } catch {
                    /* ignore */
                  }
                }}
              >
                {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                {muted ? "Sound is quiet" : "Sound is open"}
              </button>
              {hud.room ? (
                <p className="text-sm text-brass">
                  Banner <span className="font-display tracking-widest">{hud.room.toUpperCase()}</span>
                  {hud.herald ? "" : " · herald still knocking"}
                </p>
              ) : (
                <button
                  type="button"
                  className="min-h-11 border border-brass text-brass"
                  onClick={() => api.current?.openGates(name)}
                >
                  Open the gates — host from here
                </button>
              )}
              {!hud.warden ? (
                <button type="button" className="min-h-11 text-left text-sm text-mist" onClick={() => api.current?.assume()}>
                  Assume the watch (if the warden’s link is gone)
                </button>
              ) : null}
              {hud.peers.length ? (
                <ul className="text-sm text-mist">
                  {hud.peers.map((p) => (
                    <li key={p.id} className="flex justify-between gap-3">
                      <span>
                        {p.warden ? "Warden · " : ""}
                        {p.name}
                      </span>
                      <span className="tabular-nums">
                        {p.state === "connected" ? (p.rtt != null ? `${p.rtt} ms` : "direct") : p.state}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {hud.room ? (
                <button type="button" className="min-h-11 text-left text-sm text-blood-2" onClick={() => api.current?.leaveRealm()}>
                  Leave the link
                </button>
              ) : null}
              <button type="button" onClick={() => api.current?.resume()} className="min-h-11 bg-blood font-semibold text-parchment">
                Return to the field
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showTouch && hud ? (
        <>
          {hud.mode !== "rts" ? (
            <LookPad
              onLook={(dx, dy) => api.current?.addLook(dx, dy)}
            />
          ) : null}
          <div className="absolute bottom-28 left-3 z-10">
            <Stick onChange={(x, y) => api.current?.setVirtual(x, y)} />
          </div>
          <div className="absolute right-3 bottom-28 z-10 grid grid-cols-2 gap-2">
            <TouchBtn label="Strike" onPress={() => api.current?.attack()}>
              <Swords className="size-5" />
            </TouchBtn>
            <TouchBtn label="Bow" onPress={() => api.current?.bow()}>
              <Crosshair className="size-5" />
            </TouchBtn>
            <TouchBtn label="Eyes" onPress={() => api.current?.toggleFps()}>
              <Eye className="size-5" />
            </TouchBtn>
            <TouchBtn
              label={charge ? "Charging" : "Charge"}
              pressed={charge}
              onPress={() => {
                const next = !charge;
                setCharge(next);
                api.current?.setSprint(next);
              }}
            >
              <span className="text-xs font-semibold">Run</span>
            </TouchBtn>
            <TouchBtn label="Table" onPress={() => api.current?.toggleRts()}>
              <span className="text-xs font-semibold">Table</span>
            </TouchBtn>
            <TouchBtn label="Hire" onPress={() => api.current?.interact()}>
              <span className="text-xs font-semibold">Hire</span>
            </TouchBtn>
          </div>
        </>
      ) : null}
    </main>
  );
}

function LetterList({ title, letters }: { title: string; letters: Hud["post"]["inbox"] }) {
  if (!letters.length) {
    return (
      <div>
        <h3 className="text-xs tracking-widest text-brass uppercase">{title}</h3>
        <p className="mt-1 text-xs text-mist">Nothing has landed.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs tracking-widest text-brass uppercase">{title}</h3>
      {letters.map((l) => (
        <article key={l.id} className="border border-line bg-ink p-2">
          <p className="text-xs text-brass">
            {l.fromName} → {l.toName}
          </p>
          <p className="mt-1 text-sm text-pretty text-parchment">{l.text}</p>
          {l.where ? <p className="mt-1 text-xs text-mist">{l.where}</p> : null}
          {l.map.length >= 16 ? <MapSlip cells={l.map} /> : null}
        </article>
      ))}
    </div>
  );
}

function MapSlip({ cells }: { cells: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const colors = ["#140e0a", "#5a7344", "#6a655c", "#6a4a2c", "#c9b89a", "#8a6840", "#245868", "#9c2f2f", "#8e949c", "#345c38", "#8a6a44", "#c2ae78", "#d06a28", "#4e5c4c", "#c4a45a"];
    const n = 8;
    const cell = canvas.width / n;
    for (let i = 0; i < n * n; i++) {
      const id = Number.parseInt(cells[i] ?? "0", 16);
      ctx.fillStyle = colors[id] ?? colors[0];
      ctx.fillRect((i % n) * cell, Math.floor(i / n) * cell, cell + 0.5, cell + 0.5);
    }
    ctx.strokeStyle = "#e7d7b8";
    ctx.strokeRect(cell * 3.2, cell * 3.2, cell * 1.6, cell * 1.6);
  }, [cells]);
  return <canvas ref={ref} width={80} height={80} className="mt-2 h-20 w-20 border border-line" aria-label="Pinned map" />;
}

function TouchBtn({
  label,
  onPress,
  children,
  pressed,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPress();
      }}
      className={`flex size-14 items-center justify-center border bg-ink-2 text-parchment ${pressed ? "border-brass text-brass" : "border-line"}`}
    >
      {children}
    </button>
  );
}

function Stick({ onChange }: { onChange: (x: number, y: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  function fromEvent(e: ReactPointerEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let x = (e.clientX - cx) / (r.width / 2);
    let y = -(e.clientY - cy) / (r.height / 2);
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    if (m < 0.12) {
      x = 0;
      y = 0;
    }
    setKnob({ x, y });
    onChange(x, y);
  }
  return (
    <div
      ref={ref}
      className="relative size-28 touch-none rounded-full border border-brass bg-ink-2/80"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        e.stopPropagation();
        fromEvent(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) fromEvent(e);
      }}
      onPointerUp={(e) => {
        setKnob({ x: 0, y: 0 });
        onChange(0, 0);
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        setKnob({ x: 0, y: 0 });
        onChange(0, 0);
      }}
      role="slider"
      aria-label="Move"
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={knob.y}
    >
      <span
        className="absolute top-1/2 left-1/2 size-11 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brass"
        style={{ transform: `translate(calc(-50% + ${knob.x * 32}px), calc(-50% + ${-knob.y * 32}px))` }}
      />
    </div>
  );
}

function LookPad({ onLook }: { onLook: (dx: number, dy: number) => void }) {
  const last = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      className="absolute top-24 right-0 bottom-52 left-1/2 z-10 touch-none"
      aria-hidden
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        last.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (!last.current) return;
        onLook(e.clientX - last.current.x, e.clientY - last.current.y);
        last.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={() => {
        last.current = null;
      }}
      onPointerCancel={() => {
        last.current = null;
      }}
    />
  );
}
