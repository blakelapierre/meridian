# MERIDIAN
## Game specification

Player-facing rules and the numbers an implementation has to hit. Fantasy is in [concept.md](concept.md). Packets, quorum, and the op log are in [implementation-webrtc.md](implementation-webrtc.md).

Nothing here is implemented. This document is the contract for the first client.

On conflict: the concept wins on fantasy, this document wins on rules and numbers, the WebRTC spec wins on bytes. If a rule below needs a new op body, it is named here and belongs in that op log. It does not get a side channel.

Normative words: **MUST** / **MUST NOT** / **SHOULD** / **MAY**.

---

## 1. What the player can do

If a verb is not in this list, it is not in the game. New verbs are a spec change.

| Verb | Clock | Notes |
|---|---|---|
| Look, move, jump, crouch, sprint | Hands | Always |
| Fire, reload, swap, melee, throw utility | Hands | Weapon rules differ by jurisdiction |
| Plant, defuse | Hands | Live strike only |
| Buy a loadout | Strike | Scrip only |
| Dig, fill, smooth | Hands | Wilderness, and not inside a frozen site |
| Place, rotate, and salvage a piece | Hands | What you carry, or a connected logistics graph |
| Bandage, splint, eat, drag | Hands | Wilderness body |
| Bind and recall a hearth | Hands | Wilderness only |
| Pick up, drop, transfer | Hands | |
| Sit a war table, order, queue | Dominion | Command specialization required to spend team stocks |
| Swear, tithe, break allegiance | Dominion | |
| Open or pay a deed | Dominion | |
| Drive | Hands | Not in the first slice |

You never change character to do these. You change tools, or you sit down.

---

## 2. Jurisdictions

Every volume of crust is in exactly one jurisdiction at a time.

**Wilderness.** The default. Your real body, real kit, real loss. Friendly fire is on. Fall damage is on. The hearth works.

**Strike.** A contract over a closed volume for a timer. Your wilderness body and inventory are stashed, not serialized to other peers (WebRTC spec, strike scope). You play a strike body with strike rules. Leaving the volume for **5 seconds** after a warning drops you out of the contract and restores the stashed body where you stand. Dying inside does not.

A live strike **freezes crust edits and new construction** inside its volume. Shots and charges still damage **strike props** (doors, the core, deployable cover listed on the site). They do not rewrite the SDF. When the strike ends, prop damage is reverted. The planet underneath is not a round.

**Deed.** A wilderness sub-volume with an owner and a permission mask. It does not turn off death. It only gates who may edit, open, and harvest.

---

## 3. World constants

| Constant | Value |
|---|---|
| Planet | Cairn, radius 320 km |
| Gravity | 9.81 m/s² toward planet center |
| Day length | 72 real minutes |
| Dawn and dusk | 6 real minutes each, inside that day |
| Sim tick | 30 Hz |
| Economy tick | 2 Hz (every 15 sim ticks) |
| Sun | Deterministic from the cell epoch tick. Not replicated as a boolean |

Slice exception, called out again in §18: the first island does not need a horizon mask. Flux uses sky exposure only. The full game occludes the sun with the SDF.

---

## 4. The body

### 4.1 Capsule

| | Standing | Crouched |
|---|---|---|
| Capsule height | 1.80 m | 1.20 m |
| Radius | 0.35 m | 0.35 m |
| Eye height | 1.65 m | 1.10 m |
| Step height | 0.40 m | 0.40 m |

Cannot stand up if the ceiling refuses the standing capsule.

### 4.2 Movement feel

This is a stop-and-shoot body, not a slide. The test that matters: from a full sprint, holding the opposite strafe, horizontal speed **MUST** fall below **0.8 m/s** in **140–180 ms**. Tuning the control `acceleration` is legal. Missing that window is not. Replacing the integrator to make the window easier is not legal either: motion is the N-body step in [engine.md](engine.md).

| | Value |
|---|---|
| Walk wish speed | 4.4 m/s |
| Sprint wish speed | 6.6 m/s |
| Crouch wish speed | 2.2 m/s |
| Air wish speed | walk, and no faster |
| Ground accel | 50 m/s² |
| Air accel | 12 m/s² |
| Jump apex | 1.15 m above takeoff on flat ground |
| Accurate speed | horizontal speed < 0.8 m/s |
| Max walkable slope | 50° |
| Slide | above 55°, control reduced to air accel |

Sprint is a hold, not a toggle. It is refused while crouched, while over-encumbered (§8), and while stamina is 0.

Radial gravity is always on, including in a strike. On the first island the direction is close to a constant, but the code **MUST** use the planet center anyway.

### 4.3 Stamina

| | Value |
|---|---|
| Pool | 100 |
| Sprint drain | 14 / s |
| Regen | 20 / s after 0.6 s of not sprinting and not jumping |
| Jump cost | 12 |

At 0, wish speed clamps to walk until the pool reaches 20.

### 4.4 Two bodies, one person

**Strike body.** Used only inside a contract.

- Health 100.
- No blood, limbs, hunger, or fall damage.
- Armor is a loadout piece, not a wound.

**Wilderness body.** Stashed on strike entry, restored on exit or abandon.

| Track | Range | At 0 |
|---|---|---|
| Integrity | 0–100 | Dead |
| Blood | 0–100 | Downed, then dead |
| Pain | 0–100 | Sway and slower hands; never a stun lock by itself |
| Each leg, each arm | 0–100 | See below |

- A leg under 50 limps: wish speed × 0.6. Both legs under 50: × 0.35, no sprint.
- An arm under 50: weapon spread × 1.5, terraform rate × 0.6. Both arms under 50: cannot fire two-handed guns; pistol and mallet still work.
- Blood loss while bleeding: 4 blood/s. Bandage stops bleeding. Blood under 30 forces downed.
- Downed lasts 20 s. A fellowship member within 2 m can drag at crouch speed and bandage. If the timer ends or integrity hits 0, death.
- Fall damage, wilderness only: 0 at a fall under 4 m, then 8 integrity and a chance to injure a leg per extra meter. The chance is `clamp((meters - 4) / 10, 0, 1)` and **MUST** use the proposal’s seeded counter, not `Math.random`.
- Pain decays at 5/s while not taking damage. Integrity does not regen. Blood regens only from food or surgery.

Strike damage never writes these tracks. A bonded item can still come back damaged (§6.6).

### 4.5 Death

| | Strike | Wilderness |
|---|---|---|
| What drops | Nothing real. Strike weapons despawn | Carried stacks become a corpse entity. Worn armor stays on the corpse |
| Where you return | Your insertion, after 4 s | Your bound hearth, or the last public landing you touched if you have no hearth |
| Timer | Round continues | 8 s downed-corpse cam, then the recall channel plays by itself |
| Penalty | Scrip and the round | Wounds cleared to a bruised baseline: integrity 40, blood 50, limbs 70, pain 40. Skills are not lost |

Corpses last 10 real minutes, then their stacks spill into a crate that lasts until the next dawn. Fellowship members may loot you immediately. Anyone else waits 60 s. That wait is the only courtesy the sim enforces.

---

## 5. Hands, weapons, hits

### 5.1 Slots

Strike loadout slots: primary, secondary, melee, armor, four utility.

Wilderness worn slots: primary, secondary, tool, armor, back. The backpack is the grid in §8. A strike does not look at the grid.

Empty hands still have the mallet.

### 5.2 Starter catalog

Chest damage is the baseline. Head applies `head ×`. Other hitboxes: stomach × 1.0, arm × 0.85, leg × 0.75, then armor.

Hitscan applies out to `range`. Past that, the same shot is a projectile with `vel` and radial gravity. Spread is the standing, accurate, first-shot cone in milliradians.

| Id | Name | Role | Chest | Head × | RPM | Mag | Reserve | Reload | Spread | Range | Vel | Scrip |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `clinch` | Clinch | Sidearm | 22 | 3.0 | 400 | 12 | 48 | 1.8 s | 4 | 30 m | 600 | 300 |
| `line` | Line | Rifle | 28 | 4.0 | 600 | 25 | 75 | 2.4 s | 1.2 | 80 m | 900 | 2700 |
| `rasp` | Rasp | SMG | 17 | 2.6 | 800 | 30 | 90 | 2.1 s | 6 | 22 m | 500 | 1500 |
| `buck` | Buck | Shotgun | 14 × 8 pellets | 2.0 | 70 | 6 | 24 | 0.85 s per shell, or 3.2 s all | 28 | 14 m | 450 | 2000 |
| `spire` | Spire | Marksman | 72 | 2.5 | 70 | 8 | 24 | 2.6 s | 0.4 | 40 m hitscan, drop after | 1100 | 3100 |
| `mallet` | Mallet | Melee | 55 | 1.8 | swing 0.75 s | — | — | — | — | 2.2 m | — | 0 |

Recoil is data, not a screenshot: each weapon has an array of `{pitch, yaw}` kicks indexed by shot-since-reset. The pattern resets when the weapon has not fired for **300 ms**. Line’s first three kicks are mostly vertical; later kicks walk sideways. The array lives on the weapon record (§17). Implementation **MUST** use that array, not a random spray, so witnesses and the shooter share the pattern. The seeded random is only the spread cone inside the current milliradian radius.

Moving faster than accurate speed multiplies spread by **2.5**. In the air, rifles and the spire multiply spread by **4**. The clinch stays at **1.5**. The buck ignores air for pellets and is simply wide.

### 5.3 Armor

Strike armor is bought. Wilderness armor is crafted and uses the same curves at its quality.

| Id | Scrip | Effect | Move |
|---|---|---|---|
| `vest` | 650 | Chest and stomach damage × 0.70 | — |
| `plate` | 1000 | Chest and stomach × 0.55 | wish speed × 0.92 |
| `helm` | 350 | Head damage × 0.60 | — |

Armor does not stack. Legs and arms are never plated in this catalog.

### 5.4 Penetration

Materials have a resistance per **10 cm** of thickness. A shot continues while its penetrating power stays positive, losing resistance per layer. Power starts at the weapon’s `pen`.

| Material | Resistance / 10 cm | Notes |
|---|---|---|
| Flesh | 15 | One extra body for the spire is the point |
| Wood, thin cover | 20 | |
| Dirt, sand | 25 | |
| Stone, concrete | 80 | Rifle stops |
| Metal plate | 120 | Stops the catalog except a point-blank spire through a thin sheet |

| Weapon | pen |
|---|---|
| clinch, rasp, buck, mallet | 10 |
| line | 40 |
| spire | 70 |

Buck pellets do not penetrate. Mallet does not penetrate. A failed penetration may ricochet only if the impact angle to the normal is **> 70°** and the material is stone or metal: one new ray, power × 0.4, no second bounce. Witnesses run this same function.

### 5.5 Utility

| Id | Scrip | Effect |
|---|---|---|
| `smoke` | 300 | 18 s cloud, radius 6 m. Blocks vision traces. Does not block bullets |
| `flash` | 200 | A cone, 8 m, 2 s full white if you are looking at it, falling to 0 at the edge or if you face away |
| `firepot` | 400 | 6 m patch, 8 s, 12 damage/s to a strike body, integrity 8/s and a bleed in wilderness. Lights the SDF but does not dig |
| `charge` | 400 | 3 s plant on a door or one strike prop. Wilderness: opens one structure piece the support rules then re-check |
| `kit` | 400 | Defuse in 5 s instead of 10 |
| `bandage` | 0 in a strike | 3 s channel, +40 strike health, interrupted by damage. Not wilderness medicine |

Throw: arc under radial gravity, fuse as listed on the record, default arming 0.4 s so it cannot explode in the hand.

### 5.6 Fire, confirm, predict

A trigger edge sends a `ShotProposal` (WebRTC spec §6.4), not a lossy input. The shooter shows the tracer and the recoil immediately. If the cert misses, the target’s predicted blood comes back. Do not wait on the cert to cycle the weapon.

Melee is a short sphere sweep at 2.2 m, same vote, same cert path.

Reloading, swapping, and aim are inputs.

### 5.7 Friendly fire

| Jurisdiction | Default |
|---|---|
| Strike contract `atoll-skirmish` | Off. Shots and firepots do not damage teammates or their plants |
| Any other new contract | Must say explicitly. The engine default is **on** |
| Wilderness | On, including fellowship |

---

## 6. Strikes

A strike is a contract, not a server. The atoll’s contract id is `atoll-skirmish`.

### 6.1 Shape

- Two sides, **North** and **South**, up to **5** players each. The site refuses a sixth.
- One core. No hostage mode.
- A side wins by planting and the core resolving, by defusing, or by eliminating the other side.
- Round clock **1:45**, of which the first **15 s** are the buy. Damage is live during the buy. Staying in the insertion is a choice, not a freeze.
- First to **7** round wins, or the higher score when the contract’s outer timer ends (default **25 real minutes**). Tie at the outer timer is a tie.
- Between rounds, **6 s** of buy-locked movement inside the insertion while the site props reset. Crust does not reset because crust did not change.

### 6.2 Buy and scrip

Scrip exists only inside that `strike_id`. It is not metal.

| Event | Scrip |
|---|---|
| Start of contract, each player | 800 |
| Round win, each survivor and dead teammate | +3250 |
| Loss bonus | 1400, +500 per consecutive loss, cap 3400 |
| Kill | +300 to the killer |
| Assist (damaged that target this round) | +150 |
| Plant | +300 |
| Defuse | +300 |
| Cap | 9000 |

The buy menu is available during the 15 s and during the 6 s interval, and only then. Unspent scrip persists across rounds of the same contract. It is destroyed when the contract ends.

Prices are the catalog column. Selling a strike weapon returns **half**, rounded down, and only during a buy window.

### 6.3 Plant and defuse

- Plant takes **3.5 s** on the core volume, interruptible, audible to 30 m.
- A planted core resolves after **35 s**.
- Defuse is **10 s**, or **5 s** with a kit, interruptible.
- The planter’s side must still have a player alive or the core stays planted. Death of the planter does not pull the plant.

### 6.4 Eliminated side

When the last living player on a side is dead or has abandoned, the other side wins the round. A planted core still has to be defused; elimination does not clear a plant. If the planting side is eliminated and the core is down, the defending side still has to defuse before the 35 s.

### 6.5 Abandon and late join

Abandon is the 5 s exit, or disconnect longer than **20 s**. Their strike body drops and they do not reinsert that round. Scrip stays on the contract roster so a rejoin next round can buy.

A peer may join only at a round boundary, and only onto a side with a free slot.

### 6.6 Bond

During buy, a player **MAY** bond one wilderness item they own. It appears in the strike with its quality. If their side loses the contract (not a single round: the whole first-to-7), the item returns with quality reduced by **15**, minimum 1. If they abandon while it is bonded, it drops as a wilderness object at the insertion and is lootable. Winning or tying returns it unchanged.

### 6.7 What a strike is not

No wilderness inventory in the buy menu. No hearth recall. No terraform. No war-table spend of team metal. Fellowship markers still work for people in the same contract.

---

## 7. Crust

### 7.1 Tool

The wilderness tool is the **bit**. Modes, cycled with a key: dig, fill, smooth. Holding the trigger channels.

| | Value |
|---|---|
| Rate | 0.20 m³/s at mining 0, up to 0.40 m³/s at mining 140 |
| Reach | 4 m |
| Minimum feature | 0.5 m SDF resolution near the body |
| Heat line | 400 m below the local surface datum of the cell. Deeper samples deal 5 integrity/s and the edit is refused |

Each channel that changes the SDF emits one `TerrainEdit` at least every **0.5 s**, not every tick. `before_hash` is the chunk hash the WebRTC spec already requires. The integer voxel, the budget, the spoil item, and the hash bytes are [crust.md](crust.md). That file wins over the decimal rates in this section.

Fill takes dirt from a carried spoil stack. Dig creates spoil. Spoil mass counts toward encumbrance. Smooth does not create spoil; it moves height inside the brush and refuses if the move would exceed 0.5 m.

### 7.2 Stability and water

Loose material steeper than **55°** slumps one cell on the next economy tick until it is not. Stone does not slump.

Water is a height and a pressure on the coarse crust grid, stepped at the economy tick, not at 30 Hz. It flows to a lower open neighbor, fills caves, and drowns a body whose eye is under it: wilderness blood loss 8/s, strike body unaffected (sites are built dry and frozen).

A live strike volume rejects `TerrainEdit` and `Place`.

### 7.3 Deeds and edits

Inside someone else’s deed, dig, fill, smooth, and place fail unless your key is in the permission mask. Salvage of your own pieces still requires the mask. The deed holder can always edit.

---

## 8. Items, carry, craft

### 8.1 Grid

Wilderness backpack: **8** slots. Stacks up to the item’s `stack`. Worn slots are outside the 8.

| Encumbrance | Carried mass | Effect |
|---|---|---|
| Light | ≤ 25 kg | None |
| Laden | ≤ 40 kg | Sprint drain × 1.5 |
| Overloaded | > 40 kg | No sprint, wish speed × 0.75 |

Bodies and worn gear have mass. The first-slice kit (bit, mallet, a stone, 30 metal) **MUST** fit under 25 kg.

### 8.2 Quality

Crafted items store `quality` 1–100.

- Weapons: damage × `0.85 + 0.30 * (quality / 100)`.
- Tools: the mining and building rates scale the same way.
- Strike-bought weapons are treated as quality **50** and do not roll.

### 8.3 First recipes

Crafting is a channel at a station, or at the hands for the trivial ones. It emits `Craft`. Skill is smithing unless noted.

| Recipe | Station | Inputs | Time | Skill |
|---|---|---|---|---|
| Spoil from dig | — | the edit | — | mining |
| Stone block | hands | 4 spoil | 4 s | building |
| Hearth stone | any footing you placed | 20 metal, 8 stone | 20 s | building |
| Bandage | hands | 2 fiber | 2 s | surgery |
| Ration | hands | 1 grain or 1 ration crate | 1 s | — |
| Line rifle, wilderness | bench | 12 metal, 4 wood, smithing ≥ 20 | 30 s | smithing |

Fiber, grain, wood, and benches exist as records so the schema is real. The atoll slice stocks the crates in §18 instead of requiring a farm.

### 8.4 Medicine and food

| Item | Channel | Result |
|---|---|---|
| Bandage | 3 s | Stops bleeding. +10 blood. Interrupted by damage |
| Splint | 6 s | Target limb to 80 over 30 s, if it was under 80 |
| Ration | 4 s eat | +20 blood over 20 s. Pain −10 |

No hunger death in the first slice. The tracks exist: a body has `rations` as an optional need later. Do not design a starve loop now.

---

## 9. Structures

Pieces snap to a **0.5 m** grid and to sockets on neighboring pieces. The hammer places, rotates in 90° yaw, and salvages.

| Piece | Metal | Work | Role |
|---|---|---|---|
| Footing | 4 | 8 | The only piece that anchors to solid SDF |
| Post | 2 | 6 | Carries vertical load |
| Beam | 3 | 6 | Horizontal, max span 4 m between supports |
| Wall | 6 | 12 | Blocks movement and vision |
| Floor | 5 | 10 | Walkable |
| Door | 4 | 8 | Openable if the mask or a fellowship key allows |
| Hearth stone | 20 + the craft | — | One active bind per pubkey |
| Solar fin | 8 | 10 | Flux, §11 |
| Crate | 2 | 4 | 12-slot public or locked container |

**Work** is seconds of a person’s hammer, or fabber time (§11). A person does 1 work/s at fabrication 0, 2 work/s at 140.

### 9.1 Support

This is not finite-element analysis. A piece is **grounded** if a breadth-first search through face-adjacent pieces reaches a footing on solid SDF in **8** steps or fewer. Beams add their span rule on top.

Ungrounded pieces take **20 integrity/s** of structure health (structures have 100) and collapse at 0 into spoil equal to half their metal, rounded down, as a crate. Collapse is a certified op, not a local cosmetic. Debris poses after that may differ per client (WebRTC spec, ephemeral).

Charges and weapons damage structure integrity only when the ruleset says the piece is allowed to break. Strike props break inside a strike and reset. Wilderness pieces break in the wilderness and stay broken.

### 9.2 Decay

Wilderness pieces lose **1 integrity per cairn-day** of unpaid upkeep if they sit on a lapsed deed, and **0** while the deed is paid. Pieces with no deed, the “camp,” lose **1 per cairn-day** always. A person with a hammer can spend 2 metal to restore 25 integrity.

---

## 10. Land

A deed is a volume, an owner key, a mask, and prepaid upkeep.

| | Value |
|---|---|
| Minimum volume | a 8 m box |
| First-slice maximum | a 32 m box |
| Upkeep | 1 metal per cairn-day per 1000 m³, rounded up to at least 1 |
| Lapse | The claim ends. Pieces remain as salvage. Crates become public |

Mask bits: `build`, `open`, `harvest`, `invite`. The owner is implicit on all four. `invite` lets that key edit the mask, not transfer ownership. Ownership transfer is an op.

There is no safe zone. A deed does not stop bullets.

---

## 11. Industry

Two stocks: **metal** and **flux**. Both are integers. Fractions do not exist on the wire.

### 11.1 Making them

| Source | Rate | Condition |
|---|---|---|
| Solar fin | 10 flux/min × max(0, dot(normal, sun)) | Slice: no horizon mask. Full game: SDF occlusion |
| Wind post | 4 flux/min average | Deferred past the slice. Record exists |
| Geothermal tap | 25 flux/min | Only on a rift sample. Deferred |
| Vein extractor | 2 metal/min | Vein holds a finite integer, default rich vein 20,000 |
| Cracker | 1 metal per 40 flux | A pressure valve, never the goal |
| Reclaim | 70% of the piece’s metal, over its work time | The rest is gone |

Extractors and fins do nothing if the deed or the camp piece is unpowered, except the solar fin, which **is** power. Flux does not flow off a logistics component.

### 11.2 Logistics

A **link** is a road, pipe, or cable piece chain between two endpoints, certified with `LogisticsLink`.

- Inside a connected component, factories and fabbers may spend the component’s shared stocks (streaming).
- Outside it, metal and flux move only as items in inventories, crates, and vehicles.
- A person carrying 30 metal is the slice’s entire haul model.

### 11.3 Fabber and the person’s hammer

Same pieces, same costs. A fabber is a unit that spends 1 work/s from the connected stocks and cannot enter a 1 m door. It is helpless in smoke because it has no hands to use a mallet. Not in the atoll slice; the hammer is.

Factory queues are `FactoryQueue` ops. They require power and metal at the site and a connected graph. Deferred past the slice except that the op name is reserved.

### 11.4 Units, later

Specified so the queue has a type, not built in the slice:

| Unit | Metal | Flux | Role |
|---|---|---|---|
| Hauler | 40 | 10 | Carries 200 metal at 8 m/s. The crawler |
| Fabber | 60 | 20 | Builds and reclaims |
| Lamp | 5 | 1 | A sensor mast, 80 m vision trace |

No aircraft, no boats, no commander unit that dies to end the war.

---

## 12. Command

**Hands build** places what you personally pay. No skill check beyond the hammer.

**War table** is a seated pose at a placed table piece. While seated:

- Wish speed is 0. You are the capsule at the chair. Destroying the table or your body stands you up there.
- You may spend **team** metal and flux on the connected graph, and you may queue fabbers, only if Command is one of your three specializations.
- You issue orders: `move`, `attack`, `build`, `reclaim`, `guard`. An order is a certified ping plus a type. People are not possessed. Machines on the graph obey.
- Camera lifts to a plan view of cells you are subscribed to. Subscriptions follow the WebRTC interest rules. You do not receive soldier snaps from a cell you cannot sense.
- Pan on the WASD of the table, zoom with the wheel. This is not a vehicle: A pans left, it does not yaw the planet.

Command skill raises the table’s sensor radius: 200 m at 0, which is useless for the spec because you cannot sit without the specialization, and **+20 m per 10 skill** once specialized. Specializing Command at skill 0 is legal and weak.

A company with no one at the table still functions. It hauls.

---

## 13. Skills

Any skill may be used at 0. Use raises it. You do not buy training.

| | Value |
|---|---|
| Trained cap | 100 |
| Specialized cap | 140 |
| Specialization slots | 3 |
| Gain on a successful use | `1 / (1 + skill / 20)`, × 1.5 if that skill is specialized |
| Unspecialize | A 72-minute channel that breaks if you move. The skill remains at its current value, capped back to 100 if it was over |

Success is defined per skill: a certified hit for marksmanship, a certified edit for mining, a finished craft, a round played for command, and so on. Misses do not grind marksmanship. The quorum only applies gain that rides on a cert, so a client cannot locally increment itself.

| Skill | What the number does |
|---|---|
| Marksmanship | Spread × `1 - 0.25 * skill/140`. Recoil recovery 300 ms → 180 ms across the same span |
| Close combat | Mallet damage × `1 + 0.35 * skill/140` |
| Breach | Plant, defuse, and charge times × `1 - 0.25 * skill/140` |
| Fieldcraft | Sprint drain × `1 - 0.30 * skill/140`. Fall damage × the same factor |
| Run | Sprint speed × `1 + 0.35 * skill/140`. Walking speed is unchanged |
| Agility | Sprint speed × `1 + 0.5 * skill/140` (cap **1.5×**), jump height × `1 + 0.4 * skill/140` (cap **1.4×**), keyboard turn (A/D) × `1 + 0.5 * skill/140` (cap **1.5×**). Caps are reached only at 140 (specialized); at 100 it is about 1.36× / 1.29× / 1.36×. Stacks with Run and Jump. Mouse and touch look are not scaled. Gained by sprinting and jumping (one use per second at most). `src/sim/agility.js` |
| Surgery | Bandage and splint times × `1 - 0.40 * skill/140` |
| Building | Structure piece integrity starts at `80 + skill/140*40`. Place work time down by the same fraction as surgery |
| Mining | Terraform rate, §7 |
| Smithing | Crafted weapon quality roll ceiling. The roll is `20 + skill * 80/140`, seeded, then clamped to 100 |
| Fabrication | Personal work rate, §9 |
| Survey | Vein and mast radius × `1 + skill/140` |
| Mapping | Sensed-map radius is `16 + skill/140*64` meters. Looking paints a persistent geography image; later findings update it. Nearby players exchange that image by friendliness and by mapping, mining, building, and appraisal. The chart zooms and pans on its own. Unsensed people stay off the map |
| Command | Table radius, §12. Specialization required to sit as commander |
| Logistics | Carry mass limits +50% at 140. Link upkeep −25% at 140 |
| Signals | Aggregate subscribe range. Does not reveal unsensed bodies |
| Husbandry | Deferred. Food animals and Litho lures |
| Hearing | Parent of Wildlife, Footsteps, Mechanics, Weather, Rare sounds and Localization. Raises how far and how clearly sounds carry and how much masking they survive; trained by exposure to sounds heard. `src/sim/hearing.js` |
| Localization | Narrows the angular jitter on a heard sound. At Skilled with a noticed sound, a blip shows on the chart |
| Awareness | Senses movement behind you as an unlit presence cue. Trained near others' tracks and dig spots |
| Dark adaptation | Sub-skill of Eyesight. Lifts the night image; trained by spending time in the dark |

Visual sound cues grow with skill: none → shimmer → pulse → chart blip. They can be turned off in the Abilities log (`meridian.cues`). Crossing a tier (Novice 10, Practiced 25, Skilled 50, Expert 80) shows a notice and adds a row to the Abilities log (last 50, kept in localStorage `meridian.abilities`). Hover a skill for its tooltip; text lives in `src/app/skill-text.js`.

Allegiance does not add damage, spread, or integrity. Civic effects only (§14).

---

## 14. People

Three objects, still unmerged.

**Fellowship.** Up to 8 keys. Formed by an offer and an accept, both ops. Lasts until dropped or until every member has been offline 24 real hours. Shared markers inside 200 m. Drag and the corpse timer in §4.5. No shared scrip, no shared metal.

**Township.** The deed and its mask. Geographic.

**Allegiance.** One patron per person. Swearing and breaking are unilateral ops. A vassal sets a tithe of **0–20%** of metal they extract and flux their pieces produce. The tithe is a visible integer, not a hidden siphon. Skill gains are never reduced. On each gain, the patron also receives **patronage** equal to `0.10 * gain`, a separate civic track.

Patronage thresholds, account-wide for that patron:

| Patronage | Civic unlock |
|---|---|
| 0 | A fellowship |
| 50 | Deed max edge 32 m (the slice cap) |
| 200 | Deed max edge 64 m |
| 1000 | A township table that covers the deed’s cell at strategic zoom |

Breaking allegiance does not refund tithed stacks already transferred. It stops the next one.

Names are strings vouched by a patron or chosen once at first launch. The key is the identity. A new key is a new person with skills at 0.

---

## 15. The Litho

Each cell has `stress`, integer, certified.

| Event | Stress |
|---|---|
| 100 metal extracted in the cell | +1 |
| One cairn-day with no extraction and no resonance | −1, floor 0 |
| A resonance use | +5 |

| Stress | World |
|---|---|
| ≥ 400 | Spore patches on unattended metal pieces: reclaim yield × 0.5 until scraped with the bit |
| ≥ 700 | A burrow event: the quorum proposes a hostile volume that chews one ungrounded piece per minute until the cell is contested by a player in person |

Resonance itself is not in the slice and has no spell list yet. The field exists so extraction is not free forever. The atoll’s stress stays 0 unless someone mines a vein that the slice does not place.

No faction select. No playable Litho.

---

## 16. Time of day and sight

At a given tick the sun direction is a pure function. Dawn and dusk are the 6 minutes when the sun’s elevation crosses the horizon; flux follows the dot product, so it already fades. There is no extra “night damage.”

Darkness is the lack of sun and lamps. A body carries no personal magic light. Muzzle flashes and the firepot are the short ones. Vision traces for sensors and for “can this commander see that dot” use the same occlusion as bullets’ line of sight, smoke included.

The player HUD does not include a radar of unsensed people. The sensed map shows world coordinates, a live heading, the current target, and only the people inside the mapping range. That range, the trail, names, and nearby objects grow with the mapping skill.

---

## 17. Records

Content is JSON in the client, versioned with the protocol. Hot ops stay CBOR as the WebRTC spec requires. These records are not ops; they are the catalog everyone hashed into the build.

```text
Weapon
  id, name, slot
  chest, headMul
  rpm, mag, reserve, reloadSec
  spreadMrad, moveSpread, airSpread
  rangeM, vel
  pen
  recoil: [{ pitch, yaw }]
  scrip
  massKg

Utility
  id, name, scrip, massKg
  fuseSec, radiusM, durationSec
  strikeDps, integrityDps

Piece
  id, metal, work, sockets[]
  blocksMove, blocksVision
  anchors: bool

Item
  id, massKg, stack, quality: bool

Recipe
  id, station, inputs[{ item, n }], seconds, skill, output

Contract
  id, roundsToWin, roundSec, buySec, gapSec, outerSec
  teamCap, friendlyFire: bool
  siteId

Site
  id
  insertions[{ id, volume }]
  coreVolume
  propIds[]
  frozen: true
```

Volumes are boxes in cell-local centimeters, consistent with the wire format.

A catalog hash is part of `Hello`. Two clients with different catalog hashes **MUST** refuse to play. Changing a recoil kick is a version bump.

---

## 18. The first game to build

The first implementation is a place, not a technology demo. Name: **Atoll**. One island. One contract. Enough wilderness on the beach to use the real body.

Network phases in the WebRTC spec still gate the sockets. This section is what those sockets are for. Do not build allegiance, fabbers, crawlers, Litho spawns, wind, geothermal, or a second island to satisfy this slice.

### 18.1 The island

- Playable land about **512 m** across, sea around it, cell anchor at the island’s center. The disc, compound, insertions, doors, crate, footing, and dummy are [content/atoll.json](../content/atoll.json). Where a distance here says "about", the JSON `metrics` win.
- Strike volume is the inner compound, not the beach.
- North insertion and South insertion, each a box a player can recognize, each about **90 m** of path from the core door.
- One core, one plant volume, two or three doors as strike props, a few wooden walls that stop the line rifle and not the spire.
- Outside the volume, a beach yard: one crate containing a bit, a hearth-stone craft’s worth of metal (**30**), **8** stone, **4** fiber, **2** rations, and a solar-fin piece as an item.
- One ruined footing, already grounded, so the first wall has a legal anchor.
- A stationary **dummy** in the yard, strike-body 100, that resets after 5 s. It does not vote, does not count as a peer, and does not satisfy the witnessed-hit test. The liar test still needs two real witnesses.

Day length stays 72 minutes so a player who leaves the tab can see the fin go dark. For testing, a debug multiplier **MAY** speed the sun and **MUST NOT** be the default.

### 18.2 What a player can finish in one sitting

1. Wake on the beach in the wilderness body. Move, look, jump. The stop-from-sprint test passes.
2. Walk into the compound. A prompt offers `atoll-skirmish`. Accept, buy a Line and a smoke, play a round: plant or defuse or die and reinsert. Scrip changes. Wilderness metal does not.
3. Walk back out. After 5 s the strike body is gone and the beach kit is back.
4. Dig with the bit. The hole is still there after a reconnect (once the op log exists; until P3, a local hole is acceptable only behind a feature flag named as such).
5. Place a footing if the ruin is not enough, then a wall, spending carried metal.
6. Craft or place the hearth stone, bind, die to the dummy on purpose, and return to the stone with the bruised baseline.
7. Place the solar fin. Its flux number is higher at noon than at midnight.
8. A second browser can shoot the first inside the strike and be subject to the cert, and can see the wall the first one placed.

### 18.3 Slice acceptance

These are player tests, not packet tests. The packet tests in the WebRTC spec still apply.

- From sprint, opposite strafe, accurate in 140–180 ms.
- A Line at 10 m against a still dummy, standing and accurate, lands where the sight is. The same shot while sprinting often misses.
- Unarmored Line headshot at close range is 28 × 4 = 112 and kills. The same shot through a helm is 112 × 0.60 = 67 and does not. Four unarmored chest shots are 112 and kill; three leave the body at 16. Do not add a hidden bonus to force a one-shot the table does not already produce.
- Planting and winning a round pays scrip. Abandoning the volume restores the beach inventory and does not pay.
- A wilderness death drops the bit into a corpse another peer can loot after 60 s.
- A wall with no path to a footing collapses. A wall on the ruin does not.
- Two clients that both watched the dig agree the hole’s chunk hash.
- The buy menu never lists the hearth stone or the bit.

### 18.4 Explicitly not in the slice

Allegiance UI, patronage, deeds beyond “you may place in the yard,” war table, fabber, crawler, cracker, vein, Litho creatures, farming, quality rolls on a bench rifle, voice, more than one site, a globe you can walk off. The sea is a boundary. Radial gravity is still the gravity function.

The catalog records for deferred pieces **SHOULD** exist as data with `enabled: false` so the schema is exercised. The sim **MUST NOT** spawn them.

---

## 19. Tick order

Every sim tick, in this order, so two clients hashing a chunk do not drift:

1. Apply the next certified ops in `seq` order. Terrain, damage, loadout, death, and transfers happen here, not in a local side effect.
2. Sample the input ring for this tick.
3. Step stamina, then the movement capsule.
4. Step in-flight projectiles and utility fuses.
5. Advance channels (reload, plant, dig, bandage, bind) if the input still holds and the rules still allow.
6. On economy ticks only: water, slump, flux, extractors, decay, bleed between certs that already set a bleeding flag.
7. Build the snap from the result.

Prediction runs 1–5 locally and is corrected by step 1 when a cert arrives. Step 6 is never predicted as a source of metal. A client may predict its own flashlight and its own tracer. It may not predict income.

---

## 20. Action to wire

| Player action | Wire |
|---|---|
| Move, look, crouch, sprint, swap, reload | `input` ring |
| Fire, melee, throw | `ShotProposal` or the utility proposal with the same vote rules |
| Buy, bond | `StrikeLoadout` |
| Plant, defuse | proposals, interruptible; the site checks them |
| Dig, fill, smooth | `TerrainEdit` |
| Place, salvage | `Place` and a salvage op that is a `Transfer` plus support re-check |
| Craft, bind, tithe, swear, fellowship, deed | the op of that name in the WebRTC spec |
| Sit, stand, pan the table | pose on `snap`, plus `Subscribe` |

If an action is not in this table it is not networked, and it is not a feature.

---

## 21. UI

The slice needs these and no others:

| Screen | What it is |
|---|---|
| Hands | Health or integrity, stamina, ammo, compass, prompt |
| Buy | Strike weapons and scrip. Hidden outside the buy window |
| Hold | Wilderness grid, mass, worn slots |
| Hammer | The piece list you can afford |
| Death | Strike: “reinserting.” Wilderness: the recall |
| Debug | Sun multiplier, chunk hash, buffered bytes. Off unless asked |

No minimap of other players. No allegiance panel. No quest log. Prompts are one line, in the world, not a tutorial modal chain. The first beach crate can have a paper inside it with four lines: compound is north, bit digs, hearth binds, fin drinks sun. That paper is the tutorial.

Command, deed, and skill screens are specified as later surfaces. The skill number may be a single line on the hold screen in the slice so gains are visible.

---

## 22. Defaults

| Constant | Value |
|---|---|
| Walk / sprint / crouch | 4.4 / 6.6 / 2.2 m/s |
| Accurate threshold | 0.8 m/s |
| Stop-from-sprint | 140–180 ms |
| Jump apex | 1.15 m |
| Stamina | 100, drain 14/s, regen 20/s |
| Strike health | 100 |
| Round / buy / gap / core fuse | 1:45 / 15 s / 6 s / 35 s |
| Rounds to win, outer cap | 7 / 25 min |
| Team size | 5 |
| Start / win / kill / cap scrip | 800 / 3250 / 300 / 9000 |
| Plant / defuse / kit defuse | 3.5 s / 10 s / 5 s |
| Terraform | 0.20–0.40 m³/s, reach 4 m |
| Support search | 8 pieces |
| Deed upkeep | 1 metal / cairn-day / 1000 m³ |
| Spec slots | 3 |
| Fellowship | 8 |
| Tithe | 0–20%, set by the vassal |
| Corpse | 10 min, 60 s stranger delay |
| Hearth recall | 12 s channel, 10 min cooldown |
| Catalog | hashed into `Hello` |

These numbers are the game. Change them with a catalog or protocol version, not with a quiet local tweak.
