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

### The repository

The project is a **git repository**, backed up to a **private** GitHub repo:

```
https://github.com/joschka-flintz/tower-defense.git
```

Two things about it worth not breaking:

- **Commits use a noreply author address** (`joschka-flintz@users.noreply.github.com`), set as a
  repo-local `user.email`. That is deliberate — it keeps the real address out of the history. If you
  clone this somewhere fresh, set it again, or the global identity will leak back in.
- **Work done with Claude carries a `Co-Authored-By: Claude Opus 5` trailer.** The author stays the
  human whose account it is; the trailer is what records the assistance. Do not invent a separate
  bot author.

Push with `git push`. Git Credential Manager is configured system-wide, so the first push from a new
machine opens a GitHub sign-in in the browser.

### Rolling back a change that did not work out

Git is the fallback system. Every session's work should end in a commit, so any change can be undone
wholesale.

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

Once a commit has been **pushed**, prefer undoing it with a new commit rather than rewriting
history:

```bash
git revert <sha>
```

`reset --hard` on something already pushed means a force-push, which is worth avoiding for the sake
of one bad commit.

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
at a purse the design does not give you, `--debug` to print why a purchase failed, `--map=<id>` to
fight over different ground. It exits non-zero if a nation marked `playable` loses.

Always test at **`DESIGN_STARTING_GOLD`** (currently 260, in `src/game/Game.ts`). The start screen's
gold box and the dev bar's are conveniences for the user only — never balance against them.

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

## The start screen, and what a game is made of

A game is now four choices — **mode, nation, map, purse** — made on a start screen before anything
runs, and each of the four is a data file: `modes.ts`, `nations.ts`, `maps.ts`, and a number.
`src/ui/start.ts` renders itself entirely from those, including the "not balanced" flags. If adding
a mode or a map ever requires editing `start.ts`, the data shape is wrong, not the screen.

Two structural decisions in there worth keeping:

- **One `Game`, one `Renderer`, one HUD for the life of the page.** The start screen calls
  `Game.configure`, which swaps the map and resets; it does not build a new game. Building a fresh
  set per game would re-bind every HUD listener (a second Start Wave click per game started) and
  repeat several seconds of sprite pre-rendering. `Renderer.render` notices when the ground under it
  is not the ground it painted and calls `retile`.
- **The simulation stands still while the screen is up** (`main.ts` skips `update`). The board
  behind it is the last game's, and it should not play on unattended.

`Game.map` is no longer `readonly`. Everything on the board is in map coordinates, so a map change
can only ever be a new game — `configure` is the only thing that swaps it, and it resets.

## Open-ground maps: routes, hills and chokes

`Sand of the Three Gates` is the first map that is not a road, and it added three things to the map
model. All three are *properties a map declares*, not modes the engine switches into — a map that
declares none of them behaves exactly as before.

- **`routes`** — further independent ways in, each ending at its own gate. `GameMap.routes` is the
  main road plus these; trails still belong to the road they join. Every lane now carries a
  `routeId`, and so does every creep and every gatehouse, because **"how far is left to walk" is
  only a shared coordinate between lanes that end in the same place**. Trails do (they are spliced
  onto the main road's tail, which is what lets a gate on that tail stop their creeps); two routes
  making for two different gates do not. `besiegeGates` compares `routeId` first for exactly that
  reason.
- **`hills`** — the only buildable ground. `checkPlacement` picks *either* the hill rule or the
  road-clearance rule, never both: layering them would make a hill that happened to lie near a
  route silently unbuildable, which is the kind of rule a player cannot see.

  A hill is **either a circle or a traced outline**, and the outlines are the point. Hand-drawn
  ground is not made of circles: the shapes on the sketch this map came from are fingers hanging off
  the map edges, masses with bays bitten out of them, and a ring around a hollow, none of which a
  chain of circles can say. Two things about drawing them were got wrong first and are worth not
  repeating — the outline is run through a **Catmull-Rom spline**, which passes *through* every
  traced point (cutting corners between them instead rounded every bay and finger away into the same
  fat oval), and the slope is a **thick stroke of the outline** rather than a second larger copy of
  it (growing a shape by pushing its points out from its middle only works on a round one; on a
  lobed patch it pulls the lobes apart and closes the bays).
- **The enemy keeps to the sand.** Hills are solid ground it walks *around*, which is why a route
  on such a map is not the line the map draws: `src/game/terrain.ts` turns the ground into a
  walkable grid and finds the way through the gaps, and only a route's **first and last** points —
  where a front walks on, and which gate it makes for — are read from the map at all. Redraw a patch
  and the fronts re-route themselves; there is no second copy of the map's shape to keep in step.

  Three things in there were each wrong once and are worth not repeating. A **ladder of clearances**
  (30, 20, 13, then anything) makes a front prefer the open corridor and squeeze only when there is
  no alternative — without the wide rungs a single narrow slot becomes the way in for the whole army,
  and without the last rung the search fails on a tight map and *silently* falls back to the straight
  line, walking everyone over the hills. The **run-in at either end is excused the minimum**, because
  the sand outside a gate is hard against stone and can never be as open as a corridor — holding it
  to the full clearance failed every rung. And a cell counts as blocked if **any** of it is hill,
  not just its centre, with a cell's width taken off every clearance reading, or bodies placed
  against those readings sit visibly in the grass.

  A creep's wander to one side is clamped to `Lane.corridor` — the room actually available where it
  is standing — so a front broadens over open sand and files through a gap. Measured on the current
  shapes: centre lines 0% over hills, bodies grazing one about 4% of samples, all of it at gaps
  narrower than a creep.

  **Press `P` in game to draw the fronts and their corridors.** On a map whose ground is drawn by
  hand that is the only way to see what moving a patch did, and a pinched or shared corridor is
  obvious at a glance.

- **`chokes`** — gaps where a gatehouse may be walled in, since there is no road to straddle. On a
  pathfound map they are **found**, not named: the tightest points of each front, spaced apart, on
  the board and clear of both ends. Hand-placed ones rotted — move a hill and a gap that no longer
  existed was still offered as somewhere to build a gate.
  `GameMap.chokeStance` is the single answer to where a wall there stands and which way it faces,
  so the mark on the board, the ghost under the cursor and the gate that ends up there cannot
  disagree. The marks are drawn **only while a gatehouse is being placed** — painted onto the
  terrain they were just unexplained circles on ground the player was not using.

### Editing the sand map

The shapes in `DUNE_THRONE.hills` are meant to be edited by hand; everything else about the map
follows from them. What to watch, with `P` held on:

- **Leave corridors.** Patches drawn close enough to seal the middle of the board do not make the
  map harder, they make two fronts detour through the same gap somewhere else. That is the state
  the current shapes are in: the middle front takes a long way round to the south.
- A patch **against a map edge beside an entry** pinches the front as it walks on. The router now
  tries a spread of points along that edge and takes the roomiest, but it cannot invent a gap.
- Gaps narrower than a creep are walked in single file, with bodies overlapping the grass a little.
  That is the honest result of the ground; widen the gap if it looks wrong.

A wave is **split evenly between the open fronts**, so the wave table keeps meaning what it says.
Fronts open on set waves (`RouteDef.fromWave`): three at once from wave one is not three times the
enemy, but it is three places to be at once with a wave-one purse, and it turns the opening into a
guess about which gate to defend.

**The castle is a list of blocks**, each running off the east map edge, each with its own gates.
Where two blocks meet, the shared face is not drawn — that is what makes an L-shaped city read as
one continuous wall that steps rather than two compounds with a curtain between them. The town
(market, plots, and the hall unless `hall: false`) goes in whichever block sets `town: true`; the
rest are wall and a yard.

Two things about blocks that were wrong once:

- **A neighbour to the *west* covers a face completely.** Every block runs east to the map edge, so
  the exposed part of a north or south face ends at the leftmost neighbour touching that edge —
  and when that neighbour starts further west than the block does, none of the face is exposed at
  all. Skipping those neighbours drew a wall straight across the inside of the city at the step.
- **Gates need room for their towers.** Each carries a drum 46 from its middle with a radius of 20,
  and a block's corners carry one with a radius of 23, so a gate wants ~90 from the end of its wall
  and ~92 from the next gate. Closer than that and the towers visibly overlap at different sizes.

A block may have **no gate at all** (`gates: []`). The Sand map's walled quarter is sealed and all
three of its gates are on the strip: a gate in the quarter would be a fourth way in that no front
is making for.

**The hall is placed against its block, not at fixed coordinates**, so a walled quarter somewhere
else still has its hall inside it. That was the last hard-coded thing about the city; the plots and
the market are still per-map data and have to be authored clear of it.

## Selling

Half of everything spent on a building, upgrades included, rounded down (`SELL_REFUND` in
`Game.ts`). Three things about it that were decided rather than fallen into:

- **The refund is against gold actually paid**, recorded on `Tower.goldSpent` as it is spent, not
  recomputed from the price list. The Marches pay 70% for a hospital; recomputing would refund them
  half of a price they never paid, and any future price change would silently rewrite the value of
  everything already standing.
- **A gatehouse is sold with its turrets**, and the refund covers them. The alternative is a turret
  standing on nothing, which is not a thing the board can draw.
- **The one refusal is housing.** Pulling down a house that other buildings are counted under would
  leave `housingFree` negative — a state the player cannot see and cannot easily undo, since every
  build check reads it. Food deliberately has no such guard: going hungry is a survivable penalty
  and always has been, so selling your last farm stays a mistake you are allowed to make.

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

## Who can be healed, and who cannot

Audited in full after the mounted knight turned out to be fighting on at a sliver of health:

| Thing | Mended by a hospital? |
| --- | --- |
| Every melee post (all of them are `Swordsman`) | **Yes.** Retreats below its own `retreatAt`, and now also spends a lull at the ward below `restAt` (70%). |
| Every emplacement that shoots, and the Flail Guard | **Yes** — `Tower.updateRepairs`, at the cost of not shooting while worked on. Includes rock throwers and cauldrons installed in a **gatehouse turret**: gate slots get the same context as free-standing towers. |
| Siege engines (catapult) | Yes, plus their own crew below `retreatAt`. |
| The gatehouse and the city gate themselves | No — repaired with **gold**, by hand, from their panel. Deliberate. |
| **Hounds** | **No, and they never have been.** `Dog` has no retreat, no threshold and no hospital code at all. Only the houndmaster fields them and only the Wardens field him, so it is dead content today — but it is a real gap if that nation is ever designed. |

A hospital's reach covers **posts**, not wandering men: it admits a fighter if either he or his home
post stands inside the circle. Measuring only from where the man happens to be looks equivalent and
is not — the mounted knight rides 230 out from his post and the hospital only reaches 210, so he was
routinely wounded outside the reach of the very ward that covered his stable, found nothing, and
fought on until he died. The lancer (215) had the same hole. Every other post stays within 175.

## Known problems

1. **The Wardens are a placeholder.** `nations.ts` marks them `playable: false` and they lose on
   wave 4–5. Their roster is only "everything the Kingdom gave up" — archers, houndmasters — with
   no design behind it, and the shopping list in `balance.ts` is a stub. That is the next job.
2. **Neither new map has been balanced.** `--map=hollow-way` loses on waves 9–10 where the Meadow
   loses on 11. `--map=dune-throne` loses on **7–9**, and that one has a specific diagnosis worth
   keeping: at `--gold=6000` it reached wave 17 with the first hill layout, so the roster *can*
   hold three fronts — **it cannot afford to**. Three fronts want something close to three
   defences, and the wave rewards are tuned for one. If it needs help, more income on that map (or
   later-opening fronts) is the lever, not stronger towers.

   Read both sceptically. The fake player places by distance-to-route and clusters within a front;
   it has no idea that the central massif covers two fronts at once, which is the whole point of
   the ground. Denser hills actually made its big-purse runs *worse*, because more legal ground let
   it spread further — the clustering finding from the nations session, showing up again.
3. **There is one play mode.** `modes.ts` exists so the second one is a data entry; nothing in
   `Game` switches on a mode id, and only `lives` and `waves` are wired up. A mode that wants to
   change the wave table or the economy needs a field there first.
4. **Every route must still arrive at its gate from due west**, and the city still runs off the
   east edge. The hall now follows its block, but the gate passages, the streets and the wall faces
   are all drawn west-facing. A city anywhere else on the board is a drawing job.
5. The **royal hall** in the city is clipped by the right map edge. Intentional-ish (it reads as a
   city continuing off-map) but could be composed better.
6. **Creeps are still coloured circles** apart from the Feral Hound. They look increasingly out of
   place next to the detailed towers. This is the obvious next art job.
7. There are **no sounds and no save/load**.

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
