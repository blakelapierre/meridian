import { approach, clamp, dampAngle, dot3, forwardYaw, rightYaw, tangentFrame, vnorm, yawOfDir, type V3 } from "./math";
import {
  bodyClear,
  CENTER,
  generateWorld,
  radialOf,
  SEA,
  snapFeet,
  upOf,
  voxelAt,
  waterAtPoint,
  type World,
} from "./world";

export type Kind = "knight" | "soldier" | "bandit" | "wolf" | "villager";

export type Ent = {
  id: string;
  kind: Kind;
  owner: string;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  vx: number;
  vz: number;
  state: "idle" | "follow" | "move" | "attack" | "flee" | "down";
  tx: number;
  ty: number;
  tz: number;
  targetId: string;
  cd: number;
  flash: number;
  radius: number;
  height: number;
  homeX: number;
  homeY: number;
  homeZ: number;
  slot: number;
  down: number;
  selected: boolean;
  stuck: number;
  netYaw: number;
  fall: number;
};

export type Floater = { x: number; y: number; z: number; text: string; life: number; kind: "hurt" | "gold" };

export type Letter = {
  id: string;
  fromName: string;
  to: string;
  toName: string;
  text: string;
  map: string;
  where: string;
};

export type PostView = {
  nearId: string | null;
  nearName: string | null;
  flying: number;
  unread: number;
  towns: { id: string; name: string }[];
  inbox: Letter[];
  board: Letter[];
};

type TownId = "hold" | "mill" | "loom" | "camp";

type Bird = {
  id: string;
  species: "raven" | "pigeon";
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  hx: number;
  hy: number;
  hz: number;
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
  t: number;
  dur: number;
  letter: string;
  roost: TownId;
  flap: number;
};

const RUMORS: [TownId, TownId, string][] = [
  ["hold", "mill", "The gate still stands. Send word if the road is watched."],
  ["mill", "hold", "The wheel turned all night. Fires were seen past the camp."],
  ["loom", "camp", "Cloaks are cut. The palisade may have them for gold."],
  ["camp", "hold", "Five fires on the ridge. They watch the curtain wall."],
  ["mill", "loom", "Grain is thin. Weave slowly until the next cart."],
  ["hold", "camp", "A company still holds the yard. Do not treat with the ridge."],
];

type SnapEnt = [
  string,
  number,
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  string,
];

export type Snap = {
  k: "snap";
  warden: string;
  epoch: number;
  seq: number;
  wave: number;
  score: number;
  gold: [string, number][];
  events: { x: number; y: number; z: number; text: string; kind: "hurt" | "gold" }[];
  ents: SnapEnt[];
  birds?: {
    id: string;
    species: string;
    x: number;
    y: number;
    z: number;
    hx: number;
    hy: number;
    hz: number;
    letter: string;
    roost: string;
    flap: number;
  }[];
  mail?: Letter[];
};

const KIND_N: Record<Kind, number> = { knight: 0, soldier: 1, bandit: 2, wolf: 3, villager: 4 };
const N_KIND: Kind[] = ["knight", "soldier", "bandit", "wolf", "villager"];
const STATE_N = { idle: 0, follow: 1, move: 2, attack: 3, flee: 4, down: 5 };
const N_STATE: Ent["state"][] = ["idle", "follow", "move", "attack", "flee", "down"];

let seqId = 1;
function nid(prefix: string): string {
  seqId += 1;
  return `${prefix}${seqId.toString(36)}`;
}

export function createSim(selfId: string, selfName: string) {
  const world: World = generateWorld();
  const ents: Ent[] = [];
  const gold: Record<string, number> = {};
  const floaters: Floater[] = [];
  const events: Floater[] = [];
  const log: string[] = [];
  let wave = 1;
  let waveT = 36;
  let score = 0;
  let playing = false;
  let isWarden = true;
  let wardenId = selfId;
  let epoch = 1;
  let seq = 0;
  let lastSeq = 0;
  let gotSnap = true;
  let waiting = false;
  let wardenGone = 0;
  let hitMark = 0;
  let hurt = 0;
  let time = 0;
  let lookYaw = world.spawnYaw;
  let lookPitch = 0.04;
  let spaceWas = false;
  let stamina = 100;
  let stepAcc = 0;
  let mode: "field" | "fps" | "rts" = "field";
  let rts: V3 = { ...world.spawn };
  let rtsDist = 36;
  let rtsYaw = world.spawnYaw;
  const peersAlive = new Set<string>();
  const sheet = loadSheet();
  let levelPing = false;
  let mailPing = false;
  let bladeUse = 0;
  let bowUse = 0;
  let commandUse = 0;
  const birds: Bird[] = [];
  const letters: Letter[] = [];
  const readIds = new Set<string>();
  let rumorT = 18;
  let rumorI = 0;

  function pushLog(line: string) {
    log.unshift(line);
    if (log.length > 5) log.pop();
  }

  function addFloater(x: number, y: number, z: number, text: string, kind: Floater["kind"], lift = 2.6) {
    const u = upOf(x, y, z);
    const f: Floater = { x: x + u.x * lift, y: y + u.y * lift, z: z + u.z * lift, text, life: 0.9, kind };
    floaters.push(f);
    if (floaters.length > 24) floaters.shift();
    if (isWarden) events.push(f);
  }

  function make(
    partial: Pick<Ent, "id" | "kind" | "owner" | "x" | "z"> & { name?: string; hp?: number; slot?: number; y?: number },
  ): Ent {
    const spec = {
      knight: { hp: 100, radius: 1.05, height: 5.6 },
      soldier: { hp: 70, radius: 0.95, height: 5.2 },
      bandit: { hp: 40, radius: 0.95, height: 5.1 },
      wolf: { hp: 28, radius: 0.9, height: 2.5 },
      villager: { hp: 30, radius: 0.85, height: 4.8 },
    }[partial.kind];
    const stood = snapFeet(world, partial.x, partial.y ?? partial.x, partial.z) ?? {
      x: partial.x,
      y: partial.y ?? 48,
      z: partial.z,
    };
    return {
      id: partial.id,
      kind: partial.kind,
      owner: partial.owner,
      name: partial.name ?? partial.kind,
      x: stood.x,
      y: stood.y,
      z: stood.z,
      yaw: world.spawnYaw,
      hp: partial.hp ?? spec.hp,
      maxHp: spec.hp,
      vx: 0,
      vz: 0,
      state: partial.kind === "soldier" ? "follow" : "idle",
      tx: stood.x,
      ty: stood.y,
      tz: stood.z,
      targetId: "",
      cd: 0,
      flash: 0,
      radius: spec.radius,
      height: spec.height,
      homeX: stood.x,
      homeY: stood.y,
      homeZ: stood.z,
      slot: partial.slot ?? 0,
      down: 0,
      selected: false,
      stuck: 0,
      netYaw: world.spawnYaw,
      fall: 0,
    };
  }

  function byId(id: string): Ent | undefined {
    return ents.find((e) => e.id === id);
  }

  function player(): Ent {
    const p = byId(selfId);
    if (!p) throw new Error("missing captain");
    return p;
  }

  function posOf(e: Ent): V3 {
    return { x: e.x, y: e.y, z: e.z };
  }

  function dist3(a: V3, b: V3): number {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  }

  function planarDelta(up: V3, x: number, z: number): V3 {
    const { east, north } = tangentFrame(up);
    return {
      x: east.x * x + north.x * z,
      y: east.y * x + north.y * z,
      z: east.z * x + north.z * z,
    };
  }

  function toPlanar(up: V3, v: V3): { x: number; z: number } {
    const { east, north } = tangentFrame(up);
    return { x: dot3(v, east), z: dot3(v, north) };
  }

  function shift(origin: V3, px: number, pz: number): V3 {
    const up = upOf(origin.x, origin.y, origin.z);
    const w = planarDelta(up, px, pz);
    return snapFeet(world, origin.x + w.x, origin.y + w.y, origin.z + w.z) ?? origin;
  }

  function commitMove(e: Ent, dx: number, dz: number): boolean {
    if (dx === 0 && dz === 0) return false;
    const up = upOf(e.x, e.y, e.z);
    const w = planarDelta(up, dx, dz);
    const nx = e.x + w.x;
    const ny = e.y + w.y;
    const nz = e.z + w.z;
    const landed = snapFeet(world, nx, ny, nz);
    const r0 = radialOf(posOf(e));
    const rg = landed ? radialOf(landed) : r0;
    const airborne = e.fall < -0.4 || r0 > rg + 0.55;
    if (airborne) {
      if (!bodyClear(world, { x: nx, y: ny, z: nz })) return false;
      e.x = nx;
      e.y = ny;
      e.z = nz;
      return true;
    }
    if (!landed || !bodyClear(world, landed)) return false;
    const r1 = radialOf(landed);
    if (r1 > r0 + 1.55) return false;
    if (r1 < r0 - 1.15) {
      e.x = nx;
      e.y = ny;
      e.z = nz;
      return true;
    }
    e.x = landed.x;
    e.y = landed.y;
    e.z = landed.z;
    e.fall = 0;
    return true;
  }

  function tryMove(e: Ent, dx: number, dz: number) {
    if (commitMove(e, dx, dz)) return;
    if (dx !== 0 && commitMove(e, dx, 0)) return;
    if (dz !== 0) commitMove(e, 0, dz);
  }

  function gravitate(e: Ent, dt: number) {
    const g = snapFeet(world, e.x, e.y, e.z);
    if (!g) return;
    const up = upOf(e.x, e.y, e.z);
    if (e.fall < 0) {
      const hx = e.x + up.x * (e.height + 0.25);
      const hy = e.y + up.y * (e.height + 0.25);
      const hz = e.z + up.z * (e.height + 0.25);
      const id = voxelAt(world, hx, hy, hz);
      if (id === 2 || id === 3 || id === 4 || id === 5 || id === 8 || id === 13) e.fall = 0;
    }
    const r0 = radialOf(posOf(e));
    const rg = radialOf(g);
    const gap = r0 - rg;
    e.fall = Math.min(48, e.fall + 38 * dt);
    if (gap <= 0.22 && e.fall >= 0) {
      if (bodyClear(world, g)) {
        e.x = g.x;
        e.y = g.y;
        e.z = g.z;
      }
      e.fall = 0;
      return;
    }
    const drop = e.fall * dt;
    if (e.fall > 0 && drop >= gap) {
      if (bodyClear(world, g)) {
        e.x = g.x;
        e.y = g.y;
        e.z = g.z;
      }
      e.fall = 0;
      return;
    }
    const nx = e.x - up.x * drop;
    const ny = e.y - up.y * drop;
    const nz = e.z - up.z * drop;
    if (!bodyClear(world, { x: nx, y: ny, z: nz })) {
      e.fall = Math.max(0, e.fall);
      return;
    }
    e.x = nx;
    e.y = ny;
    e.z = nz;
  }

  function hop(e: Ent) {
    if (e.state === "down" || e.fall < -0.8) return;
    const g = snapFeet(world, e.x, e.y, e.z);
    if (!g) return;
    if (radialOf(posOf(e)) > radialOf(g) + 0.45) return;
    e.fall = -16.5;
  }

  function living(e: Ent): boolean {
    return e.hp > 0 && e.state !== "down";
  }

  function canHarm(att: Ent, vic: Ent): boolean {
    if (!living(att) || !living(vic) || att.id === vic.id) return false;
    if (att.kind === "knight" || att.kind === "soldier") return vic.kind === "bandit" || vic.kind === "wolf";
    if (att.kind === "bandit" || att.kind === "wolf") return vic.kind !== "bandit" && vic.kind !== "wolf";
    return false;
  }

  function nearestFoe(e: Ent, range: number): Ent | null {
    let best: Ent | null = null;
    let bestD = range;
    for (const o of ents) {
      if (!canHarm(e, o)) continue;
      const d = dist3(posOf(o), posOf(e));
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  function hurtEnt(vic: Ent, amount: number, src: Ent | null, credit = true) {
    if (!living(vic)) return;
    vic.hp = Math.max(0, vic.hp - amount);
    vic.flash = 1;
    addFloater(vic.x, vic.y, vic.z, String(amount), "hurt", vic.height + 0.6);
    if (src && src.id === selfId) hitMark = 1;
    if (vic.id === selfId) hurt = 1;
    if (vic.hp > 0) return;
    vic.state = "down";
    vic.vx = 0;
    vic.vz = 0;
    if (vic.kind === "knight") {
      vic.down = 5;
      if (vic.id === selfId) pushLog("You fall. The keep will call you back.");
    } else if (vic.kind === "soldier") {
      vic.down = 8;
    } else if (vic.kind === "villager") {
      vic.down = 16;
    } else {
      vic.down = 0.05;
    }
    if (credit && src && (src.kind === "knight" || src.kind === "soldier")) {
      if (vic.kind === "bandit" || vic.kind === "wolf") {
        score += 1;
        const owner = src.kind === "knight" ? src.id : src.owner;
        const gain = vic.kind === "bandit" ? 8 : 4;
        gold[owner] = (gold[owner] ?? 0) + gain;
        addFloater(vic.x, vic.y, vic.z, `+${gain}`, "gold", 1.6);
        if (src.id === selfId || src.owner === selfId) {
          grantXp(vic.kind === "bandit" ? 14 : 8);
          if (src.kind === "soldier") train("command");
        }
        try {
          const best = Number(localStorage.getItem("ashen-hold-best") ?? 0);
          if (score > best) localStorage.setItem("ashen-hold-best", String(score));
        } catch {
          /* private mode */
        }
      }
    }
  }

  function strike(att: Ent, yaw: number, range: number, arc: number, dmg: number) {
    if (att.cd > 0 || !living(att)) return false;
    att.cd = att.kind === "knight" ? 0.42 : 0.85;
    att.yaw = yaw;
    const up = upOf(att.x, att.y, att.z);
    const f = forwardYaw(yaw);
    let hit = false;
    for (const o of ents) {
      if (!canHarm(att, o)) continue;
      if (dist3(posOf(att), posOf(o)) > range) continue;
      const rel = toPlanar(up, { x: o.x - att.x, y: o.y - att.y, z: o.z - att.z });
      const dist = Math.hypot(rel.x, rel.z);
      if (dist < 0.001) continue;
      const facing = (rel.x * f.x + rel.z * f.z) / dist;
      if (facing < arc) continue;
      hurtEnt(o, Math.round(dmg), att);
      hit = true;
    }
    if (hit && att.id === selfId) {
      grantXp(3);
      train("blade");
    }
    return hit;
  }

  function loose(att: Ent, dir: V3) {
    if (att.cd > 0 || !living(att)) return false;
    att.cd = 0.78;
    const up = upOf(att.x, att.y, att.z);
    const planar = toPlanar(up, dir);
    const flat = Math.hypot(planar.x, planar.z) || 1;
    att.yaw = yawOfDir(planar.x / flat, planar.z / flat);
    const eye = {
      x: att.x + up.x * att.height * 0.72,
      y: att.y + up.y * att.height * 0.72,
      z: att.z + up.z * att.height * 0.72,
    };
    let best: Ent | null = null;
    let bestT = 48;
    for (const o of ents) {
      if (!canHarm(att, o)) continue;
      const chest = {
        x: o.x + upOf(o.x, o.y, o.z).x * o.height * 0.5,
        y: o.y + upOf(o.x, o.y, o.z).y * o.height * 0.5,
        z: o.z + upOf(o.x, o.y, o.z).z * o.height * 0.5,
      };
      const cx = chest.x - eye.x;
      const cy = chest.y - eye.y;
      const cz = chest.z - eye.z;
      const t = cx * dir.x + cy * dir.y + cz * dir.z;
      if (t < 0.6 || t > bestT) continue;
      const px = eye.x + dir.x * t;
      const py = eye.y + dir.y * t;
      const pz = eye.z + dir.z * t;
      const perp = Math.hypot(chest.x - px, chest.y - py, chest.z - pz);
      if (perp < o.radius + 0.55) {
        best = o;
        bestT = t;
      }
    }
    let wall = 48;
    const dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const dx = dir.x / dl;
    const dy = dir.y / dl;
    const dz = dir.z / dl;
    for (let t = 0.6; t < bestT; t += 0.55) {
      const id = voxelAt(world, eye.x + dx * t, eye.y + dy * t, eye.z + dz * t);
      if (id !== 0 && id !== 9 && id !== 7 && id !== 12) {
        wall = t;
        break;
      }
    }
    const dmg = att.id === selfId ? 12 + sheet.bow * 1.35 + sheet.grace * 0.45 : 14;
    if (best && bestT < wall) {
      hurtEnt(best, Math.round(dmg), att);
      if (att.id === selfId) {
        grantXp(4);
        train("bow");
      }
    }
    return Boolean(best && bestT < wall);
  }

  function moveToward(e: Ent, x: number, y: number, z: number, speed: number, dt: number) {
    const up = upOf(e.x, e.y, e.z);
    const rel = { x: x - e.x, y: y - e.y, z: z - e.z };
    const along = dot3(rel, up);
    const tangent = { x: rel.x - up.x * along, y: rel.y - up.y * along, z: rel.z - up.z * along };
    const l = Math.hypot(tangent.x, tangent.y, tangent.z);
    if (l < 0.85) {
      e.vx = 0;
      e.vz = 0;
      return l;
    }
    const planar = toPlanar(up, tangent);
    const face = yawOfDir(planar.x, planar.z);
    e.yaw = dampAngle(e.yaw, face, 5.5 * dt);
    const f = forwardYaw(e.yaw);
    const slow = waterAtPoint(world, posOf(e)) ? 0.55 : 1;
    const sp = speed * slow;
    const before = posOf(e);
    tryMove(e, f.x * sp * dt, f.z * sp * dt);
    const moved = { x: e.x - before.x, y: e.y - before.y, z: e.z - before.z };
    const p = toPlanar(up, moved);
    e.vx = p.x / dt;
    e.vz = p.z / dt;
    if (Math.hypot(e.x - before.x, e.y - before.y, e.z - before.z) < 0.01) {
      e.stuck += dt;
      if (e.stuck > 0.45) {
        e.yaw += 1.1;
        e.stuck = 0;
      }
    } else e.stuck = 0;
    return l;
  }

  function bootstrap() {
    ents.length = 0;
    gold[selfId] = 0;
    const spawn = world.spawn;
    ents.push(make({ id: selfId, kind: "knight", owner: selfId, name: selfName, x: spawn.x, y: spawn.y, z: spawn.z }));
    const slots: [number, number][] = [
      [-3.2, 1.1],
      [3.2, 1.1],
    ];
    slots.forEach((s, i) => {
      const spot = shift(spawn, s[0], s[1]);
      const soldier = make({
        id: `${selfId}s${i}`,
        kind: "soldier",
        owner: selfId,
        name: "Spear",
        x: spot.x,
        y: spot.y,
        z: spot.z,
        slot: i,
      });
      ents.push(soldier);
    });
    const folk: [string, string, V3][] = [
      ["vsteward", "Steward", world.steward],
      ["v1", "Miller", world.miller],
      ["v2", "Weaver", world.weaver],
    ];
    for (const [id, name, p] of folk) {
      ents.push(make({ id, kind: "villager", owner: "folk", name, x: p.x, y: p.y, z: p.z }));
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spot = shift(world.camp, Math.cos(a) * 4.5, Math.sin(a) * 3.4);
      ents.push(
        make({
          id: `b${i}`,
          kind: "bandit",
          owner: "bandit",
          name: "Bandit",
          x: spot.x,
          y: spot.y,
          z: spot.z,
        }),
      );
    }
    ents.push(make({ id: "w0", kind: "wolf", owner: "wild", name: "Wolf", x: world.wolfA.x, y: world.wolfA.y, z: world.wolfA.z }));
    ents.push(make({ id: "w1", kind: "wolf", owner: "wild", name: "Wolf", x: world.wolfB.x, y: world.wolfB.y, z: world.wolfB.z }));
    player().yaw = world.spawnYaw;
    lookYaw = world.spawnYaw;
    applyDerived(true);
    seedBirds();
  }

  function ensurePeer(id: string, name: string) {
    if (byId(id)) return;
    const n = ents.filter((e) => e.kind === "knight").length;
    const ang = n * 1.3;
    const spot = shift(world.spawn, Math.cos(ang) * 4.2, Math.sin(ang) * 4.2);
    const knight = make({
      id,
      kind: "knight",
      owner: id,
      name,
      x: spot.x,
      y: spot.y,
      z: spot.z,
    });
    gold[id] = 0;
    ents.push(knight);
    for (let i = 0; i < 2; i++) {
      const side = shift(knight, i === 0 ? -2.8 : 2.8, 1.4);
      ents.push(
        make({
          id: `${id}s${i}`,
          kind: "soldier",
          owner: id,
          name: "Spear",
          x: side.x,
          y: side.y,
          z: side.z,
          slot: i,
        }),
      );
    }
    if (ents.filter((e) => e.kind === "knight").length > 4) {
      /* room stays small; extra captains still exist but waves stay capped */
    }
    pushLog(`${name} rides into the vale.`);
  }

  function dropPeer(id: string) {
    if (id === selfId) return;
    const name = byId(id)?.name ?? "A captain";
    for (let i = ents.length - 1; i >= 0; i--) {
      const e = ents[i];
      if (e.id === id || (e.owner === id && e.kind === "soldier")) ents.splice(i, 1);
    }
    delete gold[id];
    pushLog(`${name}'s browser closed.`);
  }

  function stepPlayer(dt: number, axes: { x: number; y: number; sprint: boolean; jump: boolean }) {
    const e = player();
    if (!playing || waiting) {
      e.vx = 0;
      e.vz = 0;
      return;
    }
    if (e.state === "down") {
      e.vx = 0;
      e.vz = 0;
      return;
    }
    if (mode === "rts") {
      const pan = 22 * dt;
      const up = upOf(rts.x, rts.y, rts.z);
      const w = planarDelta(up, axes.x * pan, -axes.y * pan);
      const next = snapFeet(world, rts.x + w.x, rts.y + w.y, rts.z + w.z);
      if (next) rts = next;
      e.vx *= 0.8;
      e.vz *= 0.8;
      return;
    }
    if (axes.jump) hop(player());
    const f = forwardYaw(lookYaw);
    const r = rightYaw(lookYaw);
    let wx = f.x * axes.y + r.x * axes.x;
    let wz = f.z * axes.y + r.z * axes.x;
    const wish = Math.hypot(wx, wz);
    if (wish > 1) {
      wx /= wish;
      wz /= wish;
    }
    const mag = Math.min(1, wish);
    const sprinting = axes.sprint && stamina > 1 && mag > 0.45 && axes.y > 0.15;
    let max = (sprinting ? 15.5 : 9.4) * (1 + sheet.grace * 0.03);
    if (waterAtPoint(world, posOf(e))) max *= 0.55;
    const dirx = mag > 0.01 ? wx / Math.max(mag, 0.001) : 0;
    const dirz = mag > 0.01 ? wz / Math.max(mag, 0.001) : 0;
    const tvx = dirx * max * mag;
    const tvz = dirz * max * mag;
    e.vx = approach(e.vx, tvx, 28 * dt);
    e.vz = approach(e.vz, tvz, 28 * dt);
    tryMove(e, e.vx * dt, e.vz * dt);
    if (sprinting) stamina = Math.max(0, stamina - (22 - sheet.vigor * 0.6) * dt);
    else stamina = Math.min(staminaMax(), stamina + (14 + sheet.vigor * 0.8) * dt);
    if (mag > 0.2) {
      const face = yawOfDir(dirx, dirz);
      if (mode === "fps") e.yaw = lookYaw;
      else e.yaw = dampAngle(e.yaw, face, 12 * dt);
    } else if (mode === "fps") e.yaw = lookYaw;
    const sp = Math.hypot(e.vx, e.vz);
    if (sp > 1.2) {
      stepAcc += dt * sp;
      if (stepAcc > 2.1) stepAcc = 0;
    }
  }

  function stepAi(dt: number) {
    if (!isWarden) return;
    for (const e of ents) {
      if (e.kind === "knight") {
        if (e.id !== selfId) {
          tryMove(e, e.vx * dt, e.vz * dt);
          e.vx *= 0.92;
          e.vz *= 0.92;
        }
        continue;
      }
      if (!living(e)) continue;
      if (e.kind === "soldier") {
        const owner = byId(e.owner);
        const foe = playing ? nearestFoe(e, e.state === "attack" ? 28 : 16) : null;
        if (e.state === "attack" && e.targetId) {
          const t = byId(e.targetId);
          if (!t || !living(t)) e.state = "follow";
          else {
            const d = moveToward(e, t.x, t.y, t.z, 8.5, dt);
            if (d < 4.2) strike(e, yawBetween(e, t), 5.2, 0.2, 12 + sheet.command * 0.4);
          }
        } else if (foe && e.state !== "move") {
          e.state = "attack";
          e.targetId = foe.id;
        } else if (e.state === "move") {
          const d = moveToward(e, e.tx, e.ty, e.tz, 8.5, dt);
          if (d < 1.4) e.state = "follow";
          if (foe && dist3(posOf(foe), posOf(e)) < 16) {
            e.state = "attack";
            e.targetId = foe.id;
          }
        } else if (owner && living(owner)) {
          const back = forwardYaw(owner.yaw + Math.PI);
          const side = rightYaw(owner.yaw);
          const sign = e.slot % 2 === 0 ? -1 : 1;
          const spot = shift(posOf(owner), back.x * 4.2 + side.x * sign * 2.8, back.z * 4.2 + side.z * sign * 2.8);
          moveToward(e, spot.x, spot.y, spot.z, 9.2, dt);
        }
        continue;
      }
      if (e.kind === "villager") {
        const threat = ents.find(
          (o) => living(o) && (o.kind === "bandit" || o.kind === "wolf") && dist3(posOf(o), posOf(e)) < 16,
        );
        if (threat) {
          const up = upOf(e.x, e.y, e.z);
          const away = toPlanar(up, { x: e.x - threat.x, y: e.y - threat.y, z: e.z - threat.z });
          const spot = shift(posOf(e), away.x, away.z);
          moveToward(e, spot.x, spot.y, spot.z, 7.2, dt);
        } else if (dist3(posOf(e), { x: e.tx, y: e.ty, z: e.tz }) < 1.2 || Math.random() < dt * 0.15) {
          const wander = shift({ x: e.homeX, y: e.homeY, z: e.homeZ }, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
          e.tx = wander.x;
          e.ty = wander.y;
          e.tz = wander.z;
          moveToward(e, e.tx, e.ty, e.tz, 3.2, dt);
        } else moveToward(e, e.tx, e.ty, e.tz, 3.2, dt);
        continue;
      }
      const homeR = e.kind === "wolf" ? 22 : 34;
      const speed = e.kind === "wolf" ? 10 : 7.2;
      const foe = playing ? nearestFoe(e, 24) : null;
      const homeD = dist3(posOf(e), { x: e.homeX, y: e.homeY, z: e.homeZ });
      if (foe && homeD < homeR + 12) {
        const d = moveToward(e, foe.x, foe.y, foe.z, speed, dt);
        const reach = e.kind === "wolf" ? 3.1 : 3.8;
        if (d < reach) strike(e, yawBetween(e, foe), reach + 0.4, 0.15, e.kind === "wolf" ? 8 : 10);
      } else {
        if (dist3(posOf(e), { x: e.tx, y: e.ty, z: e.tz }) < 1.6) {
          const a = Math.random() * Math.PI * 2;
          const rad = e.kind === "wolf" ? 10 : 8;
          const spot = shift({ x: e.homeX, y: e.homeY, z: e.homeZ }, Math.cos(a) * rad, Math.sin(a) * rad);
          e.tx = spot.x;
          e.ty = spot.y;
          e.tz = spot.z;
        }
        moveToward(e, e.tx, e.ty, e.tz, speed * 0.55, dt);
      }
    }
  }

  function yawBetween(a: Ent, b: Ent): number {
    const up = upOf(a.x, a.y, a.z);
    const p = toPlanar(up, { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z });
    return yawOfDir(p.x, p.z);
  }

  function separate() {
    for (let i = 0; i < ents.length; i++) {
      for (let j = i + 1; j < ents.length; j++) {
        const a = ents[i];
        const b = ents[j];
        if (!living(a) || !living(b)) continue;
        const up = upOf(a.x, a.y, a.z);
        const rel = toPlanar(up, { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z });
        const d = Math.hypot(rel.x, rel.z);
        const need = a.radius + b.radius;
        if (d > 0.001 && d < need) {
          const push = (need - d) * 0.5;
          const nx = rel.x / d;
          const nz = rel.z / d;
          tryMove(a, -nx * push, -nz * push);
          tryMove(b, nx * push, nz * push);
        }
      }
    }
  }

  function stepDown(dt: number) {
    if (!isWarden) return;
    for (let i = ents.length - 1; i >= 0; i--) {
      const e = ents[i];
      if (e.state !== "down") continue;
      e.down -= dt;
      if (e.down > 0) continue;
      if (e.kind === "knight") {
        e.hp = e.maxHp;
        e.state = "idle";
        const spot = shift(world.spawn, e.id === selfId ? 0 : ((e.id.charCodeAt(1) % 5) - 2) * 1.6, 0);
        e.x = spot.x;
        e.y = spot.y;
        e.z = spot.z;
        e.yaw = world.spawnYaw;
        e.fall = 0;
        if (e.id === selfId) {
          lookYaw = world.spawnYaw;
          pushLog("You rise in the courtyard.");
        }
      } else if (e.kind === "soldier") {
        const o = byId(e.owner);
        const base = o ? posOf(o) : world.spawn;
        const spot = shift(base, e.slot % 2 === 0 ? -2.4 : 2.4, 1.6);
        e.hp = e.maxHp;
        e.state = "follow";
        e.x = spot.x;
        e.y = spot.y;
        e.z = spot.z;
      } else if (e.kind === "villager") {
        e.hp = e.maxHp;
        e.state = "idle";
        e.x = e.homeX;
        e.y = e.homeY;
        e.z = e.homeZ;
      } else {
        ents.splice(i, 1);
      }
    }
  }

  function stepWaves(dt: number) {
    if (!isWarden || !playing) return;
    waveT -= dt;
    if (waveT > 0) return;
    wave += 1;
    waveT = 40;
    const alive = ents.filter((e) => e.kind === "bandit" && living(e)).length;
    const n = Math.min(8 - alive, 2 + wave);
    grantXp(16);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const spot = shift(world.camp, Math.cos(a) * 6, Math.sin(a) * 4.5);
      ents.push(
        make({
          id: nid("b"),
          kind: "bandit",
          owner: "bandit",
          name: "Bandit",
          x: spot.x,
          y: spot.y,
          z: spot.z,
        }),
      );
    }
    pushLog(`Wave ${wave} crests the far road.`);
  }

  function decay(dt: number) {
    for (const e of ents) {
      e.flash = Math.max(0, e.flash - dt * 3.2);
      if (isWarden || e.id === selfId) e.cd = Math.max(0, e.cd - dt);
    }
    hitMark = Math.max(0, hitMark - dt * 2.4);
    hurt = Math.max(0, hurt - dt * 0.8);
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.life -= dt;
      const u = upOf(f.x, f.y, f.z);
      f.x += u.x * dt * 1.1;
      f.y += u.y * dt * 1.1;
      f.z += u.z * dt * 1.1;
      if (f.life <= 0) floaters.splice(i, 1);
    }
  }

  function smoothRemote(dt: number) {
    if (isWarden) return;
    for (const e of ents) {
      if (e.id === selfId) continue;
      const k = 1 - Math.exp(-dt * 9);
      e.x += (e.tx - e.x) * k;
      e.y += (e.ty - e.y) * k;
      e.z += (e.tz - e.z) * k;
      e.yaw = dampAngle(e.yaw, e.netYaw, 8 * dt);
    }
  }

  bootstrap();
  pushLog("The vale is quiet — for now.");

  function axesFrom(held: (code: string) => boolean, vx: number, vy: number, sprintHeld: boolean) {
    let x = vx;
    let y = vy;
    if (held("KeyA") || held("ArrowLeft")) x -= 1;
    if (held("KeyD") || held("ArrowRight")) x += 1;
    if (held("KeyW") || held("ArrowUp")) y += 1;
    if (held("KeyS") || held("ArrowDown")) y -= 1;
    const spaceDown = held("Space");
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    // rightYaw points screen-left, so flip strafe: A and stick-left go screen-left.
    x = -x;
    const sprint = (held("ShiftLeft") || held("ShiftRight") || sprintHeld) && y > 0;
    const jump = spaceDown && !spaceWas;
    spaceWas = spaceDown;
    return { x, y, sprint, jump };
  }

  function soldiersOf(id: string): Ent[] {
    return ents.filter((e) => e.kind === "soldier" && e.owner === id);
  }

  function order(ids: string[], op: "move" | "attack", x: number, y: number, z: number, target?: string) {
    if (!isWarden) return;
    for (const id of ids) {
      const e = byId(id);
      if (!e || e.kind !== "soldier") continue;
      if (op === "attack" && target) {
        e.state = "attack";
        e.targetId = target;
      } else {
        e.state = "move";
        e.tx = x;
        e.ty = y;
        e.tz = z;
        e.targetId = "";
      }
    }
  }

  function hirePrice(): number {
    return Math.max(12, 25 - sheet.command * 2);
  }

  function resolveHire(id: string): boolean {
    if (!isWarden) return false;
    const e = byId(id);
    if (!e || !living(e)) return false;
    if (dist3(posOf(e), world.steward) > 8) return false;
    const have = soldiersOf(id).filter(living).length;
    if (have >= 4) {
      if (id === selfId) pushLog("Four spears already answer you.");
      return false;
    }
    const price = hirePrice();
    if ((gold[id] ?? 0) < price) {
      if (id === selfId) pushLog(`The steward wants ${price} gold.`);
      return false;
    }
    gold[id] -= price;
    const slot = have;
    const spot = shift(posOf(e), 2.6, 1.2);
    ents.push(
      make({
        id: nid(`${id}s`),
        kind: "soldier",
        owner: id,
        name: "Spear",
        x: spot.x,
        y: spot.y,
        z: spot.z,
        slot,
      }),
    );
    if (id === selfId) {
      pushLog("A spearman joins your company.");
      grantXp(8);
      train("command");
    }
    return true;
  }

  function toSnap(): Snap {
    seq += 1;
    const ev = events.splice(0, events.length).map((f) => ({
      x: f.x,
      y: f.y,
      z: f.z,
      text: f.text,
      kind: f.kind,
    }));
    return {
      k: "snap",
      warden: selfId,
      epoch,
      seq,
      wave,
      score,
      gold: Object.entries(gold),
      events: ev,
      ents: ents.map(
        (e) =>
          [
            e.id,
            KIND_N[e.kind],
            e.owner,
            round(e.x),
            round(e.y),
            round(e.z),
            round(e.yaw),
            Math.round(e.hp),
            e.maxHp,
            STATE_N[e.state],
            round(e.tx),
            round(e.ty),
            round(e.tz),
            e.targetId,
          ] as SnapEnt,
      ),
      birds: birds.map((b) => ({
        id: b.id,
        species: b.species,
        x: round(b.x),
        y: round(b.y),
        z: round(b.z),
        hx: round(b.hx),
        hy: round(b.hy),
        hz: round(b.hz),
        letter: b.letter,
        roost: b.roost,
        flap: round(b.flap),
      })),
      mail: mailPayload(),
    };
  }

  function applySnap(msg: Snap) {
    if (isWarden && wardenId === selfId) {
      if (msg.epoch === epoch && msg.warden < selfId) {
        isWarden = false;
        wardenId = msg.warden;
      } else return;
    }
    const wardenLive = peersAlive.has(wardenId);
    if (wardenLive && msg.warden !== wardenId && msg.epoch <= epoch) return;
    if (msg.epoch < epoch) return;
    if (msg.epoch === epoch && msg.warden === wardenId && msg.seq <= lastSeq) return;
    epoch = msg.epoch;
    lastSeq = msg.seq;
    wardenId = msg.warden;
    if (msg.warden !== selfId) isWarden = false;
    gotSnap = true;
    waiting = false;
    wave = msg.wave;
    score = msg.score;
    for (const [id, g] of msg.gold) gold[id] = g;
    for (const ev of msg.events) {
      floaters.push({ x: ev.x, y: ev.y, z: ev.z, text: ev.text, life: 0.9, kind: ev.kind });
    }
    const seen = new Set<string>();
    for (const row of msg.ents) {
      const [id, kindN, owner, x, y, z, yaw, hp, maxHp, stateN, tx, ty, tz, targetId] = row;
      seen.add(id);
      let e = byId(id);
      const kind = N_KIND[kindN] ?? "bandit";
      if (!e) {
        e = make({ id, kind, owner, x, y, z, hp });
        e.maxHp = maxHp;
        ents.push(e);
      }
      const wasDown = e.state === "down" || e.hp <= 0;
      if (id === selfId) {
        e.hp = hp;
        e.maxHp = maxHp;
        if (hp <= 0) e.state = "down";
        else if (wasDown) {
          e.state = "idle";
          e.x = x;
          e.y = y;
          e.z = z;
          e.yaw = yaw;
          lookYaw = yaw;
        }
        continue;
      }
      e.kind = kind;
      e.owner = owner;
      e.tx = x;
      e.ty = y;
      e.tz = z;
      e.netYaw = yaw;
      e.hp = hp;
      e.maxHp = maxHp;
      e.state = N_STATE[stateN] ?? "idle";
      e.targetId = targetId;
      void tx;
      void ty;
      void tz;
      if (dist3(posOf(e), { x: 0, y: 0, z: 0 }) < 0.1) {
        e.x = x;
        e.y = y;
        e.z = z;
      }
    }
    for (let i = ents.length - 1; i >= 0; i--) {
      const e = ents[i];
      if (e.id !== selfId && !seen.has(e.id)) ents.splice(i, 1);
    }
    if (msg.birds) {
      const seenB = new Set<string>();
      for (const row of msg.birds) {
        seenB.add(row.id);
        let b = birds.find((x) => x.id === row.id);
        if (!b) {
          b = {
            id: row.id,
            species: row.species === "pigeon" ? "pigeon" : "raven",
            x: row.x,
            y: row.y,
            z: row.z,
            tx: row.x,
            ty: row.y,
            tz: row.z,
            hx: row.hx,
            hy: row.hy,
            hz: row.hz,
            ox: row.x,
            oy: row.y,
            oz: row.z,
            dx: row.x,
            dy: row.y,
            dz: row.z,
            t: row.letter ? 0 : -1,
            dur: 1,
            letter: row.letter,
            roost: row.roost === "mill" || row.roost === "loom" || row.roost === "camp" ? row.roost : "hold",
            flap: row.flap,
          };
          birds.push(b);
        }
        b.tx = row.x;
        b.ty = row.y;
        b.tz = row.z;
        b.hx = row.hx;
        b.hy = row.hy;
        b.hz = row.hz;
        b.letter = row.letter;
        b.roost = row.roost === "mill" || row.roost === "loom" || row.roost === "camp" ? row.roost : "hold";
        b.flap = row.flap;
        b.species = row.species === "pigeon" ? "pigeon" : "raven";
      }
      for (let i = birds.length - 1; i >= 0; i--) if (!seenB.has(birds[i].id)) birds.splice(i, 1);
    }
    if (msg.mail) {
      letters.length = 0;
      for (const l of msg.mail) {
        if (!l || typeof l.id !== "string" || typeof l.text !== "string") continue;
        letters.push({
          id: l.id,
          fromName: String(l.fromName ?? "Captain").slice(0, 24),
          to: String(l.to ?? "hold").slice(0, 24),
          toName: String(l.toName ?? "Hold").slice(0, 24),
          text: String(l.text).slice(0, 160),
          map: String(l.map ?? "").replace(/[^0-9a-f]/g, "").slice(0, 64),
          where: String(l.where ?? "").slice(0, 80),
        });
      }
    }
  }

  function towns(): { id: TownId; name: string; at: V3 }[] {
    return [
      { id: "hold", name: "Hold", at: world.steward },
      { id: "mill", name: "Mill", at: world.miller },
      { id: "loom", name: "Loom", at: world.weaver },
      { id: "camp", name: "Camp", at: world.camp },
    ];
  }

  function townById(id: string) {
    return towns().find((t) => t.id === id) ?? null;
  }

  function nearestTown(p: V3) {
    let best = towns()[0];
    let d = Infinity;
    for (const t of towns()) {
      const n = dist3(p, t.at);
      if (n < d) {
        d = n;
        best = t;
      }
    }
    return best;
  }

  function dirFrom(p: V3): V3 {
    return vnorm({ x: p.x - CENTER, y: p.y - CENTER, z: p.z - CENTER });
  }

  function slerpDir(a: V3, b: V3, t: number): V3 {
    const d = clamp(dot3(a, b), -1, 1);
    const omega = Math.acos(d);
    if (omega < 0.001) return a;
    const s = Math.sin(omega);
    const k0 = Math.sin((1 - t) * omega) / s;
    const k1 = Math.sin(t * omega) / s;
    return vnorm({ x: a.x * k0 + b.x * k1, y: a.y * k0 + b.y * k1, z: a.z * k0 + b.z * k1 });
  }

  function radialPoint(dir: V3, lift: number): V3 {
    const r = SEA + lift;
    return { x: CENTER + dir.x * r, y: CENTER + dir.y * r, z: CENTER + dir.z * r };
  }

  function seedBirds() {
    if (birds.length) return;
    const roosts: [TownId, Bird["species"]][] = [
      ["hold", "raven"],
      ["mill", "raven"],
      ["camp", "pigeon"],
    ];
    roosts.forEach(([roost, species], i) => {
      const at = townById(roost)?.at ?? world.spawn;
      birds.push({
        id: `raven${i}`,
        species,
        x: at.x,
        y: at.y,
        z: at.z,
        tx: at.x,
        ty: at.y,
        tz: at.z,
        hx: 0,
        hy: 0,
        hz: 0,
        ox: at.x,
        oy: at.y,
        oz: at.z,
        dx: at.x,
        dy: at.y,
        dz: at.z,
        t: -1,
        dur: 1,
        letter: "",
        roost,
        flap: i * 1.7,
      });
    });
  }

  function roostMotion(b: Bird) {
    const town = townById(b.roost) ?? towns()[0];
    const up = upOf(town.at.x, town.at.y, town.at.z);
    const { east, north } = tangentFrame(up);
    const phase = b.id.charCodeAt(b.id.length - 1);
    const a = time * 0.85 + phase;
    const r = 3.6;
    const lift = 6.4 + Math.sin(time * 2.2 + phase) * 0.45;
    const nx = town.at.x + (east.x * Math.cos(a) + north.x * Math.sin(a)) * r + up.x * lift;
    const ny = town.at.y + (east.y * Math.cos(a) + north.y * Math.sin(a)) * r + up.y * lift;
    const nz = town.at.z + (east.z * Math.cos(a) + north.z * Math.sin(a)) * r + up.z * lift;
    b.hx = nx - b.x;
    b.hy = ny - b.y;
    b.hz = nz - b.z;
    b.x = nx;
    b.y = ny;
    b.z = nz;
    b.tx = nx;
    b.ty = ny;
    b.tz = nz;
  }

  function deliver(b: Bird) {
    const letter = letters.find((l) => l.id === b.letter);
    b.t = -1;
    b.letter = "";
    if (!letter) {
      b.roost = nearestTown({ x: b.x, y: b.y, z: b.z }).id;
      return;
    }
    const town = townById(letter.to);
    b.roost = town ? town.id : nearestTown({ x: b.dx, y: b.dy, z: b.dz }).id;
    if (letter.to === selfId) {
      mailPing = true;
      pushLog(`A raven finds you. ${letter.fromName} writes.`);
    } else if (town) pushLog(`A raven settles at the ${letter.toName}.`);
    else pushLog(`A raven finds ${letter.toName}.`);
  }

  function trimLetters() {
    const flying = new Set(birds.map((b) => b.letter).filter(Boolean));
    const air = letters.filter((l) => flying.has(l.id));
    const landed = letters.filter((l) => !flying.has(l.id)).slice(-8);
    letters.length = 0;
    letters.push(...landed, ...air);
  }

  function mailPayload(): Letter[] {
    const flying = new Set(birds.map((b) => b.letter).filter(Boolean));
    const air = letters.filter((l) => flying.has(l.id));
    const landed = letters.filter((l) => !flying.has(l.id)).slice(-6);
    return [...air, ...landed];
  }

  function resolveDest(to: string): { id: string; name: string; at: V3 } | null {
    const town = townById(to);
    if (town) return town;
    const e = byId(to);
    if (e && e.kind === "knight" && e.hp > 0) return { id: e.id, name: e.name || "Captain", at: posOf(e) };
    return null;
  }

  function launchPost(opts: {
    fromId: string;
    fromName: string;
    to: string;
    text: string;
    map: string;
    where: string;
    origin: V3;
  }): boolean {
    const text = opts.text.replace(/\s+/g, " ").trim().slice(0, 160);
    const map = opts.map.replace(/[^0-9a-f]/g, "").slice(0, 64);
    if (!text && map.length < 16) {
      if (opts.fromId === selfId) pushLog("A raven will not fly empty.");
      return false;
    }
    const bird = birds.find((b) => b.t < 0);
    if (!bird) {
      if (opts.fromId === selfId) pushLog("Every raven is already afield.");
      return false;
    }
    const dest = resolveDest(opts.to);
    if (!dest) {
      if (opts.fromId === selfId) pushLog("That roost is unknown.");
      return false;
    }
    if (dist3(opts.origin, dest.at) < 6 && townById(opts.to)) {
      if (opts.fromId === selfId) pushLog("You are already at that roost.");
      return false;
    }
    const id = nid("lt");
    letters.push({
      id,
      fromName: opts.fromName.slice(0, 24) || "Captain",
      to: dest.id,
      toName: dest.name,
      text: text || "A map, and no words.",
      map,
      where: opts.where.slice(0, 80),
    });
    bird.ox = opts.origin.x;
    bird.oy = opts.origin.y;
    bird.oz = opts.origin.z;
    bird.dx = dest.at.x;
    bird.dy = dest.at.y;
    bird.dz = dest.at.z;
    const ang = Math.acos(clamp(dot3(dirFrom(opts.origin), dirFrom(dest.at)), -1, 1));
    bird.dur = clamp(7 + ang * 9, 7, 20);
    bird.t = 0;
    bird.letter = id;
    trimLetters();
    if (opts.fromId === selfId) {
      sheet.lore = Math.min(20, sheet.lore + 1);
      saveSheet(sheet);
      pushLog(`A raven lifts for ${dest.name}.`);
    }
    return true;
  }

  function looseRumor() {
    if (!playing || waiting) return;
    if (birds.filter((b) => b.t >= 0).length >= 2) return;
    const [from, to, text] = RUMORS[rumorI % RUMORS.length];
    rumorI += 1;
    const src = townById(from);
    if (!src) return;
    launchPost({
      fromId: "town",
      fromName: src.name,
      to,
      text,
      map: "",
      where: "",
      origin: src.at,
    });
  }

  function stepBirds(dt: number) {
    if (playing && !waiting) {
      rumorT -= dt;
      if (rumorT <= 0) {
        rumorT = 26;
        looseRumor();
      }
    }
    for (const b of birds) {
      b.flap += dt * (b.t >= 0 ? 16 : 7);
      if (b.t < 0) {
        roostMotion(b);
        continue;
      }
      b.t += dt;
      const u = Math.min(1, b.t / b.dur);
      const a = dirFrom({ x: b.ox, y: b.oy, z: b.oz });
      const c = dirFrom({ x: b.dx, y: b.dy, z: b.dz });
      const dir = slerpDir(a, c, u);
      const lift = 7 + Math.sin(u * Math.PI) * 10;
      const pos = radialPoint(dir, lift);
      b.hx = pos.x - b.x;
      b.hy = pos.y - b.y;
      b.hz = pos.z - b.z;
      b.x = pos.x;
      b.y = pos.y;
      b.z = pos.z;
      b.tx = pos.x;
      b.ty = pos.y;
      b.tz = pos.z;
      if (u >= 1) deliver(b);
    }
  }

  function smoothBirds(dt: number) {
    const k = 1 - Math.exp(-dt * 8);
    for (const b of birds) {
      b.x += (b.tx - b.x) * k;
      b.y += (b.ty - b.y) * k;
      b.z += (b.tz - b.z) * k;
      b.flap += dt * 12;
    }
  }

  function sketchMap(): { map: string; where: string } {
    const p = player();
    const up = upOf(p.x, p.y, p.z);
    const { east, north } = tangentFrame(up);
    const span = 28;
    const cells = 8;
    let map = "";
    for (let iz = 0; iz < cells; iz++) {
      for (let ix = 0; ix < cells; ix++) {
        const ex = ((ix + 0.5) / cells - 0.5) * span;
        const nz = (0.5 - (iz + 0.5) / cells) * span;
        const x = p.x + east.x * ex + north.x * nz;
        const y = p.y + east.y * ex + north.y * nz;
        const z = p.z + east.z * ex + north.z * nz;
        const u = upOf(x, y, z);
        let id = 0;
        for (let s = 0; s < 12; s++) {
          const h = 4 - s * 0.8;
          const vid = voxelAt(world, x + u.x * h, y + u.y * h, z + u.z * h);
          if (vid !== 0 && vid !== 9 && vid !== 7 && vid !== 12) {
            id = vid;
            break;
          }
        }
        map += (id & 15).toString(16);
      }
    }
    const near = nearestTown(posOf(p));
    const d = Math.round(dist3(posOf(p), near.at));
    return { map, where: `${d} paces from the ${near.name}` };
  }

  function postView(): PostView {
    const list = towns();
    let near: { id: TownId; name: string } | null = null;
    if (playing && !waiting) {
      const p = posOf(player());
      let best = 11;
      for (const t of list) {
        const d = dist3(p, t.at);
        if (d < best) {
          best = d;
          near = { id: t.id, name: t.name };
        }
      }
    }
    const flying = new Set(birds.map((b) => b.letter).filter(Boolean));
    const landed = (to: string) => letters.filter((l) => l.to === to && !flying.has(l.id));
    const inbox = landed(selfId).slice(-6);
    const board = near ? landed(near.id).slice(-4) : [];
    const unread =
      inbox.filter((l) => !readIds.has(l.id)).length + board.filter((l) => !readIds.has(l.id)).length;
    return {
      nearId: near?.id ?? null,
      nearName: near?.name ?? null,
      flying: birds.filter((b) => b.t >= 0 || b.letter).length,
      unread,
      towns: list.map((t) => ({ id: t.id, name: t.name })),
      inbox,
      board,
    };
  }

  function staminaMax(): number {
    return 100 + sheet.vigor * 6;
  }

  function applyDerived(fill: boolean) {
    const p = byId(selfId);
    if (!p) return;
    const prev = p.maxHp;
    p.maxHp = 100 + sheet.might * 8 + Math.max(0, sheet.level - 1) * 4;
    if (fill) p.hp = p.maxHp;
    else if (p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + Math.max(0, p.maxHp - prev));
    stamina = Math.min(staminaMax(), stamina);
  }

  function grantXp(amount: number) {
    const gain = Math.max(1, Math.round(amount * (1 + sheet.wit * 0.05)));
    sheet.xp += gain;
    let ranked = false;
    while (sheet.xp >= xpNeed(sheet.level)) {
      sheet.xp -= xpNeed(sheet.level);
      sheet.level += 1;
      sheet.unspent += 1;
      ranked = true;
    }
    if (ranked) {
      levelPing = true;
      applyDerived(false);
      pushLog(`Rank ${sheet.level}. A gift waits in the pause ledger.`);
    }
    saveSheet(sheet);
  }

  function train(skill: "blade" | "bow" | "command") {
    if (skill === "blade") bladeUse += 1;
    else if (skill === "bow") bowUse += 1;
    else commandUse += 1;
    const uses = skill === "blade" ? bladeUse : skill === "bow" ? bowUse : commandUse;
    if (uses % 6 !== 0) return;
    if (sheet[skill] >= 20) return;
    sheet[skill] += 1;
    sheet.lore = Math.min(20, sheet.lore + (uses % 12 === 0 ? 1 : 0));
    pushLog(`${skill[0].toUpperCase()}${skill.slice(1)} deepens (${sheet[skill]}).`);
    saveSheet(sheet);
  }

  function peerAlive(id: string): boolean {
    return id === selfId || peersAlive.has(id);
  }

  return {
    world,
    ents,
    floaters,
    log,
    selfId,
    get time() {
      return time;
    },
    get playing() {
      return playing;
    },
    get waiting() {
      return waiting;
    },
    get isWarden() {
      return isWarden;
    },
    get wardenId() {
      return wardenId;
    },
    get wave() {
      return wave;
    },
    get score() {
      return score;
    },
    get hitMark() {
      return hitMark;
    },
    get hurt() {
      return hurt;
    },
    get stamina() {
      return stamina;
    },
    get lookYaw() {
      return lookYaw;
    },
    get lookPitch() {
      return lookPitch;
    },
    get mode() {
      return mode;
    },
    set mode(v: "field" | "fps" | "rts") {
      mode = v;
    },
    rtsFocus() {
      return rts;
    },
    get rtsDist() {
      return rtsDist;
    },
    set rtsDist(v: number) {
      rtsDist = clamp(v, 18, 70);
    },
    get rtsYaw() {
      return rtsYaw;
    },
    set rtsYaw(v: number) {
      rtsYaw = v;
    },
    get goldSelf() {
      return gold[selfId] ?? 0;
    },
    get stepCue() {
      const c = stepAcc;
      return c;
    },
    consumeStep() {
      if (stepAcc > 2.1) return false;
      return false;
    },
    player,
    byId,
    pushLog,
    setPeers(ids: string[]) {
      peersAlive.clear();
      for (const id of ids) peersAlive.add(id);
    },
    beginPlay() {
      playing = true;
      waiting = false;
    },
    beginWait() {
      playing = true;
      waiting = true;
      isWarden = false;
      gotSnap = false;
      for (let i = ents.length - 1; i >= 0; i--) if (ents[i].id !== selfId) ents.splice(i, 1);
    },
    setName(name: string) {
      const p = byId(selfId);
      if (p) p.name = name;
    },
    applyLook(dx: number, dy: number) {
      if (!playing || waiting || mode === "rts") {
        if (mode === "rts") rtsYaw += dx * 0.0022;
        return;
      }
      const p = player();
      if (p.state === "down") return;
      lookYaw += dx * 0.00215;
      lookPitch = clamp(lookPitch - dy * 0.00215, -0.55, 0.72);
      if (mode === "fps") p.yaw = lookYaw;
    },
    step(dt: number, held: (code: string) => boolean, vx: number, vy: number, sprintHeld: boolean) {
      time += dt;
      const axes = axesFrom(held, vx, vy, sprintHeld);
      if (playing && !waiting) stepPlayer(dt, axes);
      if (isWarden) {
        stepAi(dt);
        separate();
        stepDown(dt);
        stepWaves(dt);
        for (const e of ents) gravitate(e, dt);
        stepBirds(dt);
      } else {
        smoothRemote(dt);
        gravitate(player(), dt);
        smoothBirds(dt);
      }
      decay(dt);
    },
    trySwing(dirYaw: number) {
      const e = player();
      if (!playing || waiting || e.state === "down") return false;
      if (!isWarden) return e.cd <= 0;
      return strike(e, dirYaw, 5.4, 0.28, 16 + sheet.blade * 1.45 + sheet.might * 0.8);
    },
    tryBow(dir: { x: number; y: number; z: number }) {
      const e = player();
      if (!playing || waiting || e.state === "down") return false;
      if (!isWarden) return e.cd <= 0;
      return loose(e, dir);
    },
    markSwingCd() {
      const e = player();
      if (e.cd <= 0) e.cd = 0.42;
    },
    markBowCd() {
      const e = player();
      if (e.cd <= 0) e.cd = 0.78;
    },
    cdReady(kind: "swing" | "bow") {
      const e = player();
      return e.cd <= 0 && e.state !== "down";
    },
    jump() {
      if (!playing || waiting || mode === "rts") return;
      hop(player());
    },
    pose() {
      const e = player();
      return { k: "pose" as const, id: selfId, x: e.x, y: e.y, z: e.z, yaw: e.yaw, vx: e.vx, vz: e.vz };
    },
    applyPose(id: string, x: number, y: number, z: number, yaw: number, vx: number, vz: number) {
      if (!isWarden) return;
      const e = byId(id);
      if (!e || e.kind !== "knight") return;
      const d = dist3(posOf(e), { x, y, z });
      if (d > 30 && e.hp > 0) return;
      e.x = x;
      e.y = y;
      e.z = z;
      e.yaw = yaw;
      e.vx = vx;
      e.vz = vz;
    },
    applyOrder(owner: string, ids: string[], op: "move" | "attack", x: number, y: number, z: number, target?: string) {
      const own = new Set(soldiersOf(owner).map((s) => s.id));
      order(
        ids.filter((id) => own.has(id)),
        op,
        x,
        y,
        z,
        target,
      );
    },
    orderLocal(ids: string[], op: "move" | "attack", x: number, y: number, z: number, target?: string) {
      order(ids, op, x, y, z, target);
    },
    tryHire() {
      return resolveHire(selfId);
    },
    hireFor(id: string) {
      return resolveHire(id);
    },
    resolveAct(
      id: string,
      what: "swing" | "bow",
      x: number,
      y: number,
      z: number,
      yaw: number,
      dir: { x: number; y: number; z: number },
    ) {
      if (!isWarden) return;
      const e = byId(id);
      if (!e || e.kind !== "knight" || !living(e)) return;
      e.x = x;
      e.y = y;
      e.z = z;
      e.yaw = yaw;
      if (what === "swing") strike(e, yaw, 5.4, 0.28, 16);
      else loose(e, dir);
    },
    ensurePeer,
    dropPeer,
    toSnap,
    applySnap,
    peerAlive,
    noteWarden(dt: number, missing: boolean): "seize" | null {
      if (!playing || isWarden) {
        wardenGone = 0;
        return null;
      }
      if (!gotSnap) {
        wardenGone = 0;
        return null;
      }
      if (missing) wardenGone += dt;
      else wardenGone = 0;
      if (wardenGone < 1.1) return null;
      const ids = [selfId, ...peersAlive].sort();
      if (ids[0] !== selfId) return null;
      epoch += 1;
      seq = 0;
      lastSeq = 0;
      isWarden = true;
      wardenId = selfId;
      wardenGone = 0;
      pushLog("The warden's browser closed. The realm passes to you.");
      return "seize";
    },
    assumeWatch() {
      if (isWarden) return false;
      epoch += 1;
      seq = 0;
      isWarden = true;
      wardenId = selfId;
      waiting = false;
      if (ents.filter((e) => e.kind !== "knight" || e.id === selfId).length < 4) {
        const keep = player();
        ents.length = 0;
        ents.push(keep);
        bootstrap();
        const again = player();
        again.x = keep.x;
        again.y = keep.y;
        again.z = keep.z;
      }
      pushLog("You take the watch. This browser now runs the vale.");
      return true;
    },
    select(ids: string[], add: boolean) {
      const own = new Set(soldiersOf(selfId).map((s) => s.id));
      if (!add) for (const e of ents) e.selected = false;
      for (const id of ids) {
        const e = byId(id);
        if (e && own.has(e.id) && living(e)) e.selected = true;
      }
    },
    selectedIds() {
      return ents.filter((e) => e.selected && e.owner === selfId && e.kind === "soldier").map((e) => e.id);
    },
    nearHire() {
      const e = player();
      return playing && !waiting && living(e) && dist3(posOf(e), world.steward) < 8;
    },
    focusRts(p: V3) {
      rts = snapFeet(world, p.x, p.y, p.z) ?? p;
    },
    soldiers() {
      return soldiersOf(selfId).map((s) => ({
        id: s.id,
        hp: s.hp,
        max: s.maxHp,
        sel: s.selected,
        down: s.state === "down" || s.hp <= 0,
      }));
    },
    sheetView() {
      return { ...sheet, next: xpNeed(sheet.level), staminaMax: staminaMax() };
    },
    spend(attr: "might" | "grace" | "wit" | "vigor") {
      if (sheet.unspent <= 0) return false;
      sheet[attr] += 1;
      sheet.unspent -= 1;
      applyDerived(false);
      saveSheet(sheet);
      return true;
    },
    takeLevelPing() {
      const v = levelPing;
      levelPing = false;
      return v;
    },
    takeMailPing() {
      const v = mailPing;
      mailPing = false;
      return v;
    },
    sketchMap,
    postView,
    launchPost,
    readPost() {
      const view = postView();
      for (const l of view.inbox) readIds.add(l.id);
      for (const l of view.board) readIds.add(l.id);
    },
    birdDraw() {
      return birds.map((b) => ({
        x: b.x,
        y: b.y,
        z: b.z,
        hx: b.hx,
        hy: b.hy,
        hz: b.hz,
        carry: b.letter ? 1 : 0,
        flap: b.flap,
        species: b.species,
        t: b.t,
        dur: b.dur,
      }));
    },
    hirePrice,
    banner() {
      if (waiting) return "Seeking the warden…";
      const p = byId(selfId);
      if (p?.state === "down") return "Fallen — the courtyard calls you back";
      const bandits = ents.filter((e) => e.kind === "bandit" && living(e)).length;
      if (!playing) return "The company waits in the courtyard";
      if (bandits === 0) return "The palisade is quiet";
      return `Wave ${wave} · ${bandits} bandits on the road`;
    },
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export type Attr = "might" | "grace" | "wit" | "vigor";

export type Sheet = {
  level: number;
  xp: number;
  unspent: number;
  might: number;
  grace: number;
  wit: number;
  vigor: number;
  blade: number;
  bow: number;
  command: number;
  lore: number;
};

function xpNeed(level: number): number {
  return 28 + level * 22;
}

function freshSheet(): Sheet {
  return { level: 1, xp: 0, unspent: 0, might: 8, grace: 8, wit: 8, vigor: 8, blade: 1, bow: 1, command: 1, lore: 1 };
}

function loadSheet(): Sheet {
  try {
    const raw = localStorage.getItem("ashen-hold-sheet");
    if (!raw) return freshSheet();
    const parsed = JSON.parse(raw) as Partial<Sheet>;
    const base = freshSheet();
    for (const key of Object.keys(base) as (keyof Sheet)[]) {
      const n = Number(parsed[key]);
      if (Number.isFinite(n)) base[key] = Math.max(0, Math.min(40, Math.round(n)));
    }
    base.level = Math.max(1, base.level);
    return base;
  } catch {
    return freshSheet();
  }
}

function saveSheet(sheet: Sheet) {
  try {
    localStorage.setItem("ashen-hold-sheet", JSON.stringify(sheet));
  } catch {
    /* private mode */
  }
}

