# Handoff notes

`README.md` describes **what** the game does. This file records what a fresh session cannot infer
from the code: why things are the way they are, what is still wrong, and how to work on it.

Last updated after the housing/farming/city pass.

---

## How to run and inspect it

Node is portable at `C:\Users\flintz\nodejs` and **not on PATH** (no admin rights on this machine).

```
start-game.cmd          # adds Node to PATH for that window, runs the dev server
```

Then <http://localhost:5173>. Type-check with:

```
set "PATH=C:\Users\flintz\nodejs;%PATH%"
npx tsc --noEmit
```

### Two dev-only tools that make iteration cheap

The in-app browser pane is often not composited, so `requestAnimationFrame` never fires and
screenshots time out. Work around it with these instead:

1. **`window.td`** — exposes `{ game, renderer, hud }` in dev. You can drive the whole simulation
   headlessly: `td.game.update(1/60)` in a loop, then `td.renderer.render()`.
2. **`POST /__shot?name=foo`** — a Vite middleware in `vite.config.ts` that writes a canvas
   data-URL to `.shots/foo.png`, which can then be read off disk. This is the only reliable way to
   actually *look* at the rendering.

```js
renderer.render();
await fetch('/__shot?name=check', { method: 'POST', body: canvas.toDataURL('image/png') });
```

### Rolling back a change that did not work out

The project is a **git repository**, and that is the fallback system. Every session's work should
end in a commit, so any change can be undone wholesale.

```bash
git log --oneline
```

To look at what changed since the last known-good state:

```bash
git diff HEAD~1
```

To throw away everything uncommitted and go back to the last commit:

```bash
git restore .
```

To undo the last commit entirely, files and all:

```bash
git reset --hard HEAD~1
```

`node_modules/`, `dist/` and `.shots/` are ignored, so a reset never touches the installed packages
or the screenshots.

**Commit before starting anything large**, and say in the message what has and has not been tested.
The whole point is that "this update did not work out" is one command, not an afternoon of undoing
edits by hand.

### Balance testing

There is now a headless harness. It plays a full twenty-wave game per nation with no browser and
no rendering, and prints what happened wave by wave:

```
npm run balance
```

`tools/balance.ts` holds a fake player and a shopping list per nation; `tools/run-balance.mjs`
bundles it with the esbuild already inside Vite and runs it under Node. Flags: a nation name to
run only that one, `--all` to include nations marked unplayable, `--gold=N` for a diagnostic run
at a purse the design does not give you, `--debug` to print why a purchase failed. It exits
non-zero if a nation marked `playable` loses.

Always test at **`DESIGN_STARTING_GOLD`** (currently 260, in `src/game/Game.ts`). The HUD's
"Start gold" box is a testing convenience for the user only — never balance against it.

Build spots are generated on a grid, filtered to those 42–190 units from the path, and **sorted by
distance to the path ascending**. Filling the map corner-first produces meaningless results — this
bit me once.

**Read the runs sceptically.** Nearly every "this roster is undertuned" result during the nation
work turned out to be the fake player, not the game:

- Shopping happens *before* `startWave`, so `game.waveNumber` is the wave just finished. Every
  `fromWave` gate fired a wave late until that was fixed.
- Building a farm spends the housing a preceding pass had just cleared, so "make room, then place"
  reported success and then every candidate spot came back `no-housing`.
- Buying upgrades interleaved with towers meant an upgrade after *every* tower, and the 180-gold
  gatehouse two lines down the list was never reached. Upgrades are a strictly second phase now.
- `--gold=6000` is the fastest way to separate the two: if the roster wins with money, the problem
  is income, not capability.

---

## Design decisions worth not re-litigating

- **A nation is only a roster.** `src/data/nations.ts` says which towers a player may build and
  what may go in a gatehouse turret. Every tower definition stays in `towers.ts` whichever nation
  can build it — a tower no nation lists is simply not offered, never deleted. The map, the wave
  table and the economy are shared.
- **A melee post refills its ranks between waves, but only if someone survived.** A post wiped out
  to the last man is still destroyed and its ground freed. When the swordsman was the only melee
  tower, "he dies and the post is gone" was a fair price for a cheap gap-filler; for a realm that
  leans on melee across most of its board it is ruinous, and the balance runs stalled at six
  buildings and lost on wave 6 every time. The asymmetry is deliberate: multi-man posts are
  durable, a lone swordsman or knight is still all or nothing.
- **Upgrades are independent nodes**, not a ladder. `requires` chains one behind another,
  `requiresTech` gates one behind research. The panel indents successors automatically from those
  links, so a skill tree draws itself.
- **Damage is quoted against unarmoured targets**; the matrix in `src/data/armor.ts` adjusts.
  Deliberately *not* a single "armour reduces everything" number — that makes whichever type decays
  slowest strictly best. Blunt rises through the scale; fire is nearly flat.
- **Housing is a hard cap, food is a soft penalty.** If food merely blocked building it would be
  housing with extra steps. Running short drops every tower to 60% instead, which makes
  over-expansion a gamble rather than an impossibility.
- **Logic and rendering are strictly separated.** Game code never knows what anything looks like.
  All drawing lives in `src/render/`.
- **Data-driven content.** A new tower, creep, technology or upgrade should be an entry in
  `src/data/`, not new engine code.

---

## Why food is settled the way it is

Food is settled **once, when a wave is cleared**, with harvest and upkeep counted at the same
instant. Buildings can go up *during* a wave, so that timing was examined carefully; the
conclusion is that end-of-wave settling is right and the alternative is worse.

Charging **upkeep at the start of a wave** looks tighter and is not: a tower raised after the wave
begins would not be on the books for it, so the optimal play becomes "always wait until the wave
starts before building". That is a free lunch with no trade-off, which is a worse hole than the
one it closes. End-of-wave settling has no upkeep dodge at all — anything standing when the books
are settled eats, whenever it went up.

The one genuine leak was on the other side, and is now closed: a farm raised mid-wave used to
deliver a full harvest to a wave it had barely existed in, which let you cancel a shortage you
could already see coming. `Tower.raisedMidWave` makes it sit that reckoning out. Upkeep needs no
equivalent flag, and adding one would reintroduce exactly the dodge described above.

The sanctioned way out of a shortage is the **market**, which sells grain at a deliberately poor
rate. That is the pressure valve; a mid-wave farm was undercutting it.

## Open design questions

**Should building be allowed during a wave at all?** It currently is. Keeping it matches the genre
and avoids dead time, and with the harvest rule above it no longer costs anything in coherence.
The one thing worth noticing is that a melee post raises its fighters *instantly*, so a pikeman
bought mid-wave puts two men on the road at once — a strong panic button whose only cost is gold.
If that ever needs reining in, the targeted fix is to make new fighters muster before they are
available, not to ban building outright.

## Not balance-tested yet

**The Marches — the entire nation.** Roster, prices, upgrades, the cost-discount perk, and the
harness plan in `balance.ts` are all first drafts. The plan in particular knows neither of the two
things that actually matter for this realm: that a Flail Guard is worth several times as much on an
inside corner as on a straight, and that a hospital covering the shooting line is what keeps it
alive. Expect it to under-perform a human badly.

**The gatehouse/catapult split** moved the catapult off the Kingdom, which was balanced *with* it.
The Kingdom's numbers are now stale too.


The following all landed **without** a balance run, at the user's explicit request — a new nation
and a change of tower composition are coming first, and tuning before that would be wasted. The
numbers below are considered starting points, not settled:

- Shootable emplacements (`buildingHp`, `selfRepair`, armour classes on projectile towers).
- The Bowman and Stone Slinger, and the waves they appear in (7, 9, 13, 16, 19, 20).
- The Morningstar Knight at waves 10 and 20. His flail was cut from 46 every 2.2s to 34 every 2.6s
  during smoke testing because at the original figures he erased six pikemen in sixteen seconds,
  which is not a decision, it is a deletion. His health went 900 → 700 for the same reason.
- The bowman's shot was cut from 14 to 9 for the same reason: three of them levelled an
  unprotected crossbowman inside a single wave.
- Hospital reach (210, or 320 with Stretcher Bearers) and the City Gate upgrade (+10 lives, 320g).

`npm run balance` will run, but its shopping lists know nothing about any of this — the fake player
never builds a hospital to cover its crossbows, and nothing in the plan reacts to losing a building.
**Expect the numbers to be worse than a human's, and do not tune against them until the plans have
been rewritten for the new roster.**

## Known problems

1. **The Wardens are a placeholder.** `nations.ts` marks them `playable: false` and they lose on
   wave 4–5. Their roster is only "everything the Kingdom gave up" — archers, houndmasters — with
   no design behind it, and the shopping list in `balance.ts` is a stub. That is the next job.
2. **There is no pre-game nation chooser.** The dropdown in the dev bar is the only way to switch,
   and it restarts the game. Deliberate for now — the Kingdom is the one that is finished.
3. The **royal hall** in the city is clipped by the right map edge. Intentional-ish (it reads as a
   city continuing off-map) but could be composed better.
4. **Creeps are still coloured circles** apart from the Feral Hound. They look increasingly out of
   place next to the detailed towers. This is the obvious next art job.
5. There are **no sounds, no save/load, and only one map**.

### Fixed since last time

- *Advanced Construction was a trap* — 150 (hall) + 240 (tech) to unlock buildings that then cost
  120–220 each, and researching it lost while ignoring it won. Now 170, and for the Kingdom it is
  no longer optional: the gatehouse is how a realm without archers stops a crowd.
- *Wave rewards were flat* relative to what the economy costs. They now rise with the wave number,
  roughly 1.3–1.5x from wave 8 on. Without it a realm reached wave 19 with the whole board built
  and nothing left it could pay for.

---

## Where things live

| Path | What |
| --- | --- |
| `src/data/` | All balance numbers: towers, creeps, waves, tech, armour matrix, map + city plots, **nation rosters** |
| `src/game/` | Rules: `Game` is the world; `Tower`, `Creep`, `Dog`, `Swordsman`, `Gatehouse`, `Crow`, `Projectile`, `FireField` |
| `src/render/` | `Renderer` (terrain, entities, city) and `sprites.ts` (every procedural sprite) |
| `src/ui/` | `hud.ts` (panels, stats, build/upgrade lists) and `panels.ts` (drag + minimise) |
| `tools/` | The headless balance harness. The only code here that runs under Node, not a browser. |

`Swordsman.ts` is badly named now: that one class backs **every** melee post — pikemen, the
warhammer knight, the mounted knight — with the numbers, armour class and damage type all arriving
through `SwordsmanOwner`. Renaming it to `Fighter` would be an improvement and touches five files.

The terrain, the city and every building sprite are **pre-rendered once** into offscreen canvases
and blitted, which is why the drawing can afford so much detail. If you change a sprite, it is
rebuilt on reload, not per frame.

---

## The user

Joschka does not program. He directs the design and judges the result; write the code and explain
only what he asks about. He tests by playing, so leave the game in a runnable, balanced state and
tell him plainly what changed and what is still wrong.
