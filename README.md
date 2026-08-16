# Realm Defense

A medieval tower defense game that runs in the browser. No backend, no server, no accounts —
the whole game lives in the browser tab.

## Running it

Double-click **`start-game.cmd`**, then open <http://localhost:5173> in your browser.
Press `Ctrl+C` in that window to stop the server.

Edits to files under `src/` show up in the browser within a second — no rebuild, no reload.

### Why a .cmd file instead of `npm run dev`

This machine has no administrator rights, so Node.js could not be installed system-wide.
Instead the portable build lives in `C:\Users\flintz\nodejs` and is **not** on the system PATH.
`start-game.cmd` adds it to PATH for that one window. To use `npm` manually in a terminal:

```
set "PATH=C:\Users\flintz\nodejs;%PATH%"
npm run dev
```

To remove Node again later, just delete the `C:\Users\flintz\nodejs` folder.

`npm run build` produces a `dist/` folder of static files that can be dropped on any web host.

## How the code is organised

| Folder | Contains |
| --- | --- |
| `src/core/` | Generic helpers: the fixed-timestep game loop, vector/geometry maths. |
| `src/data/` | **Balance numbers only.** Tower stats, creep stats, map layout, wave composition. Safe to tweak. |
| `src/game/` | Game rules: creeps, towers, projectiles, placement validation, the `Game` state container. |
| `src/render/` | The only file that draws. Game logic never knows what anything looks like. |
| `src/ui/` | The HTML HUD (gold, lives, wave counter, build panel). |

Two conventions keep it easy to extend:

1. **New content = new data.** A new tower type is an entry in `src/data/towers.ts`; a new enemy is
   an entry in `src/data/creeps.ts`. No engine changes needed for simple variants.
2. **Logic and drawing are separate.** Switching to real sprites, or tilting the camera to a
   slight 3/4 angle, only touches `src/render/Renderer.ts`.

## Starting a game

The game opens on a **start screen**: the rules on the left, and on the right the four things a
game is made of — **play mode**, **nation**, **map**, and the **starting gold**. Anything that has
not been balanced yet says so on its own card, and the line above the Begin button repeats the
warning for whatever you have actually picked.

One play mode can be chosen today, *The Long Siege*, which is the game as it has always been.
*Campaign* — a run of linked battles carrying your realm forward — is listed but locked, as a
statement of intent rather than something you can start. A mode is the shape of the contest (lives,
how many waves) and lives in `src/data/modes.ts`; adding another should be an entry in that file
and nothing else.

**Menu** in the dev bar (and *Back to Menu* on the win/lose screen) returns to it. The board is left
standing and the simulation stops while the screen is up, so opening the menu mid-game and
dismissing it again costs nothing. **New game** beside it restarts the same setup. Nation and
starting gold are chosen only on the start screen — the dev bar no longer duplicates them.

## Controls

- Click a tower in the **Build** panel, then click the map to place it.
- Green ring = valid spot, red ring = blocked (road, scenery, another tower, or not enough gold).
- Right-click or `Esc` cancels building.
- **Click a placed tower** to see its range, buy upgrades, or **sell** it.
- **Selling** pays back half of everything spent on that building, upgrades included, and is the
  last row of its panel. Selling a gatehouse takes its turrets with it and pays for those too. The
  one thing you cannot sell is a house whose roof your other buildings are counted under — sell a
  tower first, and the house after.
- A **gatehouse is three separate things to click**: the gate in the middle (repair and reinforce)
  and each of the two turrets (choose Rock Thrower or Hot Oil; once built they behave as ordinary
  towers with their own panel).
- While placing a gatehouse it squares itself to the road automatically. Press **`R`** to rotate it
  (`Shift+R` the other way) for corners where the automatic angle is wrong.
- **Start Wave** sends the next wave.

## Nations

There are two nations, and a nation is nothing but a **roster** — which of the towers it may
build, and what it may install in a gatehouse turret. The map, the enemy waves and the economy are
the same for both. Rosters live in `src/data/nations.ts`.

| Nation | Idea | State |
| --- | --- | --- |
| **The Kingdom** | Stone walls and short weapons. A gatehouse to make the enemy *stop*, then crossbows, rock throwers and men in the road. No archers, no dogs, and **no catapult**. | Balanced before the last round of changes |
| **The Marches** | The other melee realm, and the Kingdom's opposite. **No gatehouse at all** — nothing here stops anybody. Instead it reaches: the longest bow in the game, a catapult, lancers with a long leash, and one flail emplacement tucked into a corner. | **New, not balanced** |
| **The Wardens** | Bows, hounds and the long watch. Kills at a distance rather than holding the road. | **Placeholder** — only what the two kingdoms do not field, never designed |

The **gatehouse/catapult split** is the point of the pair. Having both — a wall that halts a crowd
*and* the artillery to shell it while it stands there — was the strongest thing in the game, so
each realm gets exactly one of the two.

Pick a nation on the start screen. The **Nation** dropdown in the dev bar still switches mid-session
(it restarts the game), which is the quicker route when testing.

A tower that no nation lists is not deleted, only unoffered — it stays in `src/data/towers.ts`
ready for whoever ends up fielding it.

## Maps

A map is mostly its **route**: where the enemy walks, and where you are allowed to stand. Every map
shares the same wave table and the same economy. Maps live in `src/data/maps.ts`.

| Map | Idea | State |
| --- | --- | --- |
| **Classic Meadow** | Open pasture, four long straights, junctions at 10%, 38% and 52% along the road. | The ground everything was tuned on |
| **The Hollow Way** | A coiling sunken road that doubles back on itself twice, with its two halves running a hundred units apart down the middle of the board — one cluster there covers two stretches at once. Its northern lane joins barely a sixth of the way along. | **Not balanced** |
| **Sand of the Three Gates** | No road at all. Open desert, three broad fronts crossing it from the west, and **three gates** to hold. Buildings stand only on the green hills; a gatehouse only in a marked gap. | **Not balanced** |

`npm run balance -- --map=<id>` fights the harness over a given map.

### Open ground

The desert map runs on two rules the road maps do not have, both of which are properties of the map
rather than special cases in the engine:

- **Several ways in.** A map may declare more than one route, each ending at its own gate in the
  city wall. Every wave is split evenly between whichever fronts have opened, so the number of
  enemies is exactly what the wave table says — they simply arrive in two or three places. Fronts
  open on set waves (the second on wave 4, the third on wave 7) so the opening is not a guess about
  which gate to guard. A gatehouse blocks the front it stands on and no other.
- **Hills instead of verges.** Where a map declares hills, they are the only ground that takes a
  foundation, and the keep-clear-of-the-road rule does not apply — there is no road. A gatehouse
  goes in one of a handful of gaps between hills; pick the gatehouse in the build panel and the
  gaps light up on the board.
- **The enemy keeps to the sand.** Hills are solid ground it walks *around*. Nothing draws the
  enemy's path on such a map: the ground is turned into a walkable grid and each front finds its own
  way from where it enters to the gate it is making for, preferring the middle of a corridor and
  squeezing through a gap only when there is no way round. A front broadens over open sand and files
  through a narrow place. Edit the hills and the fronts re-route themselves.

Press **`P`** in game to draw the fronts and the corridor each has to walk in. That is the way to
see what moving a patch of hill did to the enemy's path.

### Emplacements can be shot at

Anything that shoots — crossbowmen, archers, rock throwers, catapults, oil cauldrons — has a
**structure** value and can be destroyed. Enemy bowmen and stone slingers halt on the road and put
shot into them; the Morningstar Knight crushes them with his flail as he passes. A wrecked
emplacement comes off the board and the ground is free again (a wrecked *turret* leaves the
gatehouse standing, so it can simply be re-manned).

Two ways to patch them up:

- **A field hospital in reach** mends damaged emplacements as well as treating wounded fighters.
  A fighter falls back at his post's **retreat** threshold (20–45%, shown on the panel), and will
  also spend a **lull** at the ward if he is under 70% and his post has had nothing in reach for a
  couple of seconds — but only once he has been in the fight that wave, and he goes straight back
  the instant anything comes into reach. Emplacements have no equivalent: they are mended whenever
  a hospital covers them, and pay for it by not shooting.
- **A siege engine's own crew** can mend it unaided. Below half structure a catapult stands down
  and does not fire again until it is whole. *Carpenter's Tools* makes that much quicker.

**Being worked on means not shooting**, whichever source is doing it — you cannot span the frame of
an engine and crank it at the same time. That is the whole cost of repair, and it is what stops a
hospital simply making a line of emplacements unkillable. A hospital heals fast, so the pause is
usually brief; a catapult's own crew is slower but waits until the damage is worth downing tools for.

Melee posts are deliberately **not** shootable. The men are the thing that dies there, and they
already have their own loop — get hurt, fall back, be healed. This is also why enemy shooters only
target things that shoot back: it makes them a duel rather than a flat rise in incoming damage,
and it lands very differently on a realm that holds the road with men than on one built on massed
bows, without a single nation-specific rule.

### Nation perks

A nation may also bend a *rule*, not just field a different list — deliberately, because a nation
that merely had cheaper towers would be the same nation with a discount. Perks are declared in
`nations.ts` and listed at the top of the build panel so they are discoverable.

- **The Kingdom:** melee posts recover **75%** of their health between waves instead of 50%. The
  counterweight to a roster that takes its casualties in the road rather than at two hundred paces.
  It never makes a fighter stronger than he was — it makes a bad wave survivable. Fighters only; a
  shot-up emplacement mends at the same rate for everybody.
- **The Marches:** Field Medicine costs **45% less** and a Field Hospital **30% less**. Its whole
  shooting line can be shot at, so cheap medicine is what lets it afford the hospitals that keep
  those emplacements standing — the same building doing two jobs.

## Towers

Which of these you can build depends on your nation.

| Tower | Cost | Nation | Behaviour |
| --- | --- | --- | --- |
| Pikemen | 40 | Kingdom | **Two** spearmen to a post, each of them flimsy. A melee post only ever holds one enemy at a time, so what a realm that fights in the road is really buying per coin is *hold-points* — this is the cheap way to get them. Pierce: shreds the unarmoured early waves, skids off plate later. Upgrades: brigandine, a third man at the post, a longer pike, drill. |
| Warhammer Knight | 160 | Kingdom | Plate and a hammer, and two people's worth of housing. Slow, short-leashed and expensive, and the only thing the Kingdom has that reliably breaks armour before the catapult. Upgrades: great helm, a sworn oath (tougher, holds down to 20%), a spiked head, and a two-handed sweep that crushes everything in reach. |
| Mounted Knight | 190 | Kingdom | Needs **Husbandry** — no stables, no cavalry. Rides far out from his post (the longest leash of anything, 230) to cut down whatever is furthest along. Only medium armour: the weight is in the horse rather than a full harness. Upgrades: a destrier, steel barding (heavy armour, slower), a sharpened sabre, and trample — he rides straight through the press every 2.5s. |
| Rock Thrower | 70 | Kingdom | A man heaving dressed stones. Short reach, never misses, and **blunt** — the only damage type that gets *better* the heavier the target is armoured. The cheap answer to the wave-6 knights, and also installable in a gatehouse turret. |
| Men-at-Arms | 50 | Marches | The Marches' cheap body and the mirror of the Kingdom's pikemen: **two** to a post again, but sword and buckler rather than a pike. Shorter reach, no formation — but they cut, and slash keeps far more of its bite against mail than pierce does. Upgrades: mail shirts, a third retainer, arming swords, back-and-breast (→ medium armour, slower). |
| Longbowman | 55 | Marches | Reach **300** — by far the longest in the game — and feeble arrows to pay for it. A coverage tower, not a killing one: its worth is how long an enemy spends under fire. Upgrades: war bow, arrow storm, ranging marks (→ 380), fire arrows. |
| Shieldbearers | 75 | Marches | **Two** pikemen behind kite shields — the Marches' middle rank. Medium armour and a pike's reach, where its other foot are light or heavy with nothing between. Pierce, so it is the *worse* choice against plate than the men-at-arms beside it (40% against 55%) and the sturdier one against everything else. Upgrades: braced shields, third rank, long pikes, drilled wall. |
| Flail Guard | 85 | Marches | Swings a morning star round and round on a chain. It picks **no target at all** — whatever the ball physically passes through is struck, as it passes, once per revolution. That makes it threaten a narrow *band* of ground at arm's length rather than a circle, so it wants an inside corner where the road doubles back through the ring. On a straight it is wasted. The Marches' only blunt damage. Upgrades: heavier head, spiked head, longer chain (sweeps wider), second flail (comes round faster). |
| Sword Knight | 165 | Marches | Plate and a longsword — the warhammer knight's opposite number. Cuts instead of crushing, so he is a fine general soldier and never the *right* one against plate. Upgrades: great helm, sworn oath, honed longsword, sweeping cut. |
| Lancer | 200 | Marches | Needs **Husbandry**. Heavy horse, couched lance, **pierce**. Rides far out (leash 215) to break the light and unarmoured mass before it arrives — pierce is at its best there and its worst against the plate that comes later, which is what the Flail Guard is for. Upgrades: destrier, bodkin lance, couched charge, spare mounts. |
| Archer | 30 | Wardens | Stands on the ground with a small footprint, so you can **mass** them. Long reach, slow deliberate shots, 80% hit chance. Upgrades: a timber shooting platform (more range and aim, and he visibly stands on it), a heavier bow, and fire arrows. |
| Houndmaster | 90 | Wardens | Sends a dog onto the road to pin an enemy and bite it. |
| Crossbowman | 45 | both | The archer's opposite: short reach, very slow to crank, but hits far harder and rarely misses. For the Kingdom it is the *only* thing that shoots, which is why it can buy a ranging sight. Upgrades: windlass crank, steel prod, ranging sight, fire bolts. |
| Swordsman | 60 | both | Steps onto the road and holds an enemy in place, like a dog — but he has real health, **medium armour**, and the enemy hits back. Below 35% health he breaks off and walks to the nearest Field Hospital. Upgrades: mail, a better sword, *Plate Armour* (heavy armour, but noticeably slower), and the *Wirbelattacke* — a full turn with the blade every 3 seconds that cuts everything within reach. |
| Field Hospital | 100 | both | Does not attack (needs Field Medicine). Wounded fighters withdraw here and are healed back to fighting fitness, then return to their post; damaged emplacements in reach are mended too. It has a **reach** (210), which covers **posts**: it takes any man whose post stands inside it, however far his own fighting has carried him. A post outside it has nowhere to fall back to, so where you put it matters. Upgrades: trained surgeons (30 → 58 per second), stretcher bearers (reach 210 → 320). |
| Catapult | 180 | Marches | Slow arcing stones that **always hit** and damage everything in a blast radius. Its crew can mend it, at the cost of not shooting. |
| Stone Gatehouse | 180 | Kingdom | Built **across the road** (needs Advanced Construction). Enemies must break the gate before they can pass, which is the one thing that stops a *crowd* rather than a single enemy — for the Kingdom that makes it the keystone rather than a luxury. Only the gate breaks; the masonry and its two turrets survive and keep fighting. Repair is paid for and never happens automatically; the gate can also be reinforced (700 → 1200 → 2000). Each turret takes a Rock Thrower (blunt) or Hot Oil (fire, needs Fire Projectiles). |
| Scholars' Hall | 150 | both | Does not attack. Develops technologies that apply to the whole realm. |

### Sweep towers

The Flail Guard is the only one, and it works unlike anything else on the board: it has **no
target**. The head goes round on a chain and hurts whatever it physically reaches, *as* it reaches
it — so an enemy is struck when the ball gets to them, once per revolution, not when a timer fires.
The ball you can see is the ball that hits; the game and the animation read the same angle.

The important consequence is that it threatens a narrow **band** of ground at arm's length, not a
filled disc. Enemies standing in the middle of the circle, or beyond it, are perfectly safe. That is
what makes a reach this short worth having at all: the job is to find the inside corner where the
road doubles back and drops the whole column through that band.

Measured beside a busy road in its best spot, it does about **twice** the work of a single-target
tower of similar price — which is right for something that catches two where they catch one, given
it also has half their range and only works in specific places.

### Melee posts

Every melee tower — swordsman, pikemen, both knights — is the same machinery with different
numbers: a post that sends fighters onto the road to hold an enemy there. Each fighter has real
health, an armour class, and a damage type of his own (the pike punches through, the hammer
crushes, the sword cuts), so the armour matrix below decides how the fight actually goes both ways.

Between waves the survivors bind their wounds and recover **50%** of their health (**75%** for the
Kingdom, whose men are professionals with surgeons behind them — see *Nation perks* below), and the
post **refills its ranks** — but only if someone is still standing. A post killed to the last man is
destroyed for good and its ground is free to build on again. So a two- or three-man pike post is
genuinely durable, while a lone swordsman or knight is still all or nothing.

### Housing and food

Two economies sit on top of gold, and they are deliberately *not* the same shape:

- **Housing is a hard cap.** Every combat building needs people to man it — one each, farms one for
  the farmer, and **two** for either knight, who does not go to war alone. Houses shelter 5, then 10,
  then 18 with upgrades (the later two need Advanced Construction, and the building visibly grows
  each time), and both upgrades shelter a head more cheaply than raising another cottage would.
  A house on a **city plot** is built properly from the outset: it comes with its
  Timber Frame already up, free and without the research. No spare housing, no new tower.

Houses and farms can be built **anywhere**, like any other building. The city walls also hold
reserved plots — three for houses, two for farms and one for the Scholars' Hall (which only ever
goes there). Two start occupied; empty plots are outlined on the map, and clicking one raises its
building.

Building inside the walls is better: a walled house comes with its Timber Frame free, and a walled
farm is safe from crows outright, so it is never offered a Scarecrow. The **market square** inside
the walls trades gold for grain and back, and the **city gate** itself can be clicked: reinforcing
it (needs Advanced Construction, 320 gold) raises your lives from 20 to 30. It is the only thing in
the game that does.

Everything that is manned costs housing and food, **including a rock thrower or oil cauldron
installed in a gatehouse turret** — the numbers are shown on each building in the build panel and
in its own stat panel.
- **Food is a flow with a penalty, not a second cap.** Farms harvest each wave; every building eats
  each wave. Run short and nothing is blocked — your towers simply fight at **60%** until the farms
  catch up. A hungry building is ringed in **amber** on the map, and its panel says so. That makes
  over-expanding a gamble rather than an impossibility, which is what stops it
  being housing with extra steps.

Surplus food keeps for exactly one wave and no more (the store is capped at a single harvest), so
you cannot stockpile your way out of building farms.

#### Exactly when food is counted

The books are settled **once, at the moment a wave is cleared**, and harvest and upkeep are
counted at the same instant (`settleFood` in `src/game/Game.ts`):

```
available = this wave's harvest + whatever was in store
if available < upkeep   ->  the realm is hungry, the store empties
otherwise               ->  store = available - upkeep, capped at one harvest
```

`hungry` then applies for the **whole of the next wave** — every building fights at 60% until the
next settling, whatever you build in the meantime. Nothing is checked during a wave.

You can build while a wave is running, so two rules keep that from being an escape hatch:

- **Anything standing when the books are settled eats**, whenever it went up. There is no way to
  raise a tower "after the count" and skip a wave's upkeep.
- **A farm raised during a wave reaps nothing that wave.** It was sown too late. Its panel says so,
  and it harvests normally from the next wave on.

So you cannot cancel a shortage you can already see coming by throwing up a farm. The way out of a
shortage is the **market**, which sells grain at a deliberately poor rate — that is the pressure
valve, and it costs you gold you wanted for defence.

**Crows** are an occurrence rather than an enemy: they ignore the road, cannot be attacked, and
only care about farms. A flock can spoil up to half of an unprotected field's harvest. The
*Scarecrow* upgrade keeps them off entirely; *Plough Horse* (needs Husbandry) raises a field from
6 to 13 — cheaper per bushel than breaking new ground, and it costs no extra housing.

### Enemies fight back

Anything holding an enemy in place — a dog or a swordsman — is struck back. Enemies attack on
their own rhythm (damage per blow × blows per second, in `src/data/creeps.ts`) rather than
draining the defender continuously, so a defender loses health in visible chunks.

Because of that, **dogs now have health** rather than a fixed amount of work in them: they die
when an enemy kills them, not when they have dealt some quota of damage. They are still restored
in full between waves; swordsmen recover only half.

**Feral Hounds** are the first enemy built around this: fast, fragile, and they bite often.

### Damage types and armour

Every attack has a type and every target has an armour class. All damage numbers in the data
tables are quoted **as if against an unarmoured target**; the matrix in `src/data/armor.ts` adjusts
from there.

| | Unarmoured | Light | Medium | Heavy |
| --- | --- | --- | --- | --- |
| **Pierce** — archers, crossbows, hound bites | 125% | 110% | 70% | **40%** |
| **Slash** — swords, dogs | 115% | 110% | 85% | 55% |
| **Blunt** — catapults, rock throwers, brute clubs | **85%** | 95% | 105% | **120%** |
| **Fire** — any flaming shot, burning ground | 100% | 100% | 95% | 85% |

This is the Warcraft-3 style matrix rather than a single "armour reduces everything" number, and
deliberately so: if every type merely decayed as armour rose, whichever decayed slowest would be
strictly best and the rest would be dead weight. Here each type has a niche.

Averaged over the four attack types the tiers come out at roughly **106% / 104% / 89% / 75%**, so
heavier armour is still better overall — but blunt *rises* through the scale (a hammer wastes its
force on a nimble unarmoured target and crushes plate), and fire barely cares, which makes it the
safe answer when you have guessed wrong.

Three enemies do something other than walk at you:

- **Bowmen** and **Stone Slingers** *halt* and shoot at your emplacements. Standing still costs them
  ground, which is the trade. The bowman looses pierce (a nuisance to a crossbowman); the slinger
  throws blunt, which is what actually threatens a catapult or rock thrower.
- The **Morningstar Knight** is the campaign's boss, at waves 10 and 20. Full harness, and *nothing
  holds him* — he walks through a pike line as if it were not there. Every few seconds the flail
  goes round and crushes every defender within reach at once, emplacements included. Blunt, so
  armour is no answer; heavy harness, so pierce is no answer either. Kill him before he arrives, or
  get out of his way and let him through.

Current armour classes: Peasants, Feral Hounds, Marauders and Bowmen are unarmoured; Pikemen,
Assassins, Lance Riders and Stone Slingers light; Shieldbearers and Mounted Knights medium; both
Knights, the Battering Ram and the Morningstar Knight **heavy** — so a line of archers and crossbows alone will not stop the late waves, and you need blunt.

This matrix is what gives each nation its shape. The Kingdom's pikemen and crossbows are all
**pierce**, which is exactly the type that collapses against plate, so wave 6 — where the warhammer
knights arrive — is the moment it has to have bought blunt: rock throwers, its own warhammer
knights, or a catapult. Marauders are the mirror image: unarmoured, so blunt is at its *worst*
against them, and they ignore being held, so the pike line cannot stop them either.

### Balance testing

`npm run balance` plays a full twenty-wave game per nation headlessly and prints what happened wave
by wave. See `HANDOFF.md` for how to read the output and the traps in it.

### Upgrades and technologies

Tower upgrades are independent nodes, not a ladder. An upgrade may declare `requires` (another
upgrade on the same tower) or `requiresTech` (a global technology), and the panel shows why a
locked one is unavailable. Adding one is a data entry in `src/data/towers.ts`.

Technologies live in `src/data/tech.ts` and are bought at a Scholars' Hall. Research is immediate —
there is no development time. `Fire Projectiles` is deliberately generic: the same research unlocks
*Fire Stones* on the catapult, *Fire Arrows* on the archer, *Fire Bolts* on the crossbow and *Hot
Oil* at a gatehouse. `Advanced Construction` unlocks the gatehouse, the catapult and the larger
houses. `Field Medicine` unlocks the hospital. `Husbandry` puts a horse to the plough — and, for
the Kingdom, opens the stables the Mounted Knight rides out of. `Marksmanship` and `Ballistics` add
flat hit chance to every projectile tower.

Fire arrows and bolts also set the target alight, ticking fire damage afterwards. Burning stacks
**twice at most** — a third hit refreshes the fire closest to going out instead of adding another.

Damage carries a type (`physical` or `fire`). Creeps can declare per-type multipliers via
`resist` in `src/data/creeps.ts` — the hook exists and is wired through, but no creep uses it yet.

A hound tower whose dogs are all spent is marked with a red ring — it is out of the fight until
the wave ends, then the pack returns at full strength.

## Debugging

While the dev server is running, the browser console exposes `td.game`, `td.renderer` and
`td.hud`. For example `td.game.gold = 9999` or `td.game.update(1/60)` to advance one tick.
This handle only exists in dev, never in a built version.

`vite.config.ts` also adds a dev-only `/__shot` endpoint: POST a canvas data URL to it
and the image lands in `.shots/`. Useful for inspecting rendering without a screen.
