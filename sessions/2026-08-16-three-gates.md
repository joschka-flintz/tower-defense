# 2026-08-16 (later) — Three gates on open sand

Follow-up to the start-screen session. Four asks: strip the duplicated controls out of the game
screen, announce Campaign without letting it be played, fix two nation blurbs, and build a map from
a drawing — open sand, hills to build on, three gates to hold.

---

## The small ones

- **The dev bar is down to two buttons**, *New game* (same setup again) and *Menu*. The gold box and
  the nation dropdown were the only way to configure a game before the start screen existed; keeping
  them meant two places to set the same thing, one of which silently disagreed with what the start
  screen said you had chosen.
- **Campaign** is listed on the start screen, greyed, flagged *coming soon*, and cannot be selected —
  the card is `disabled` and the click handler refuses it as well, so the rule is in the code rather
  than in the styling. `modes.ts` gained `comingSoon`; nothing else in the game reads the mode.
- **The Marches** lost the "No Stone Gatehouse" line — it was a description of an absence, and the
  panel already shows the roster.
- **The Wardens** gained a planned perk line, marked *not built yet*, saying they are meant to be the
  housing-and-farming realm. Nothing in the code gives them any of it.

## The map: Sand of the Three Gates

The drawing was: sand everywhere, green patches to build on, one castle down the right-hand side
with a roomy walled quarter at the top and three gates.

### What the engine had to grow

Three things, all of them *properties a map declares* rather than modes the engine switches into —
a map that declares none of them behaves exactly as it did before:

1. **Several ways in.** A map can now declare extra `routes`, each ending at its own gate.
2. **Hills.** Where a map declares them they are the only buildable ground, and the
   keep-clear-of-the-road rule is switched off rather than layered on top — a hill that happened to
   lie near a route would otherwise be silently unbuildable, which is a rule the player cannot see.
3. **Chokes.** Named gaps where a gatehouse may be walled in, because on open ground there is no
   road for one to straddle.

The castle also became a **list of blocks**, so the walls can step: a roomy quarter with the town in
it and a narrow strip of curtain wall running on from it. Where two blocks meet the shared face is
not drawn, which is what makes it read as one continuous city wall.

### The one that would have bitten later

`besiegeGates` measured everything in *distance remaining to the end*. That works because trails are
spliced onto the main road's tail — they genuinely end in the same place, which is exactly why a
gate on that tail stops their creeps too. Two routes making for two different gates do **not** end
in the same place, so remaining-distance is no longer a shared coordinate between them and a wall on
one front would have blocked creeps on another at the same distance from their own gate. Lanes,
creeps and gatehouses all carry a `routeId` now and the comparison starts there.

Verified: a gatehouse on the northern front held every northern creep at a standstill (and took
siege damage doing it) while the middle and southern creeps walked past it untouched.

### Three things I built and then rebuilt

- **The hills were sand-coloured** at first, on the theory that a desert's hills are made of sand.
  They looked better and told you nothing, and the hills are the only ground you can build on. They
  are green now, which is what the drawing said in the first place.
- **The choke markers were painted onto the terrain** — stone stubs and a dashed line at each gap.
  As markings on ground the player was not currently doing anything with, they read as unexplained
  circles. They now appear **only while a gatehouse is in hand**, as gold brackets spanning the gap
  the wall would seal, and the board is clean the rest of the time.
- **The hills were circles, and the drawing is not.** Two rounds of "this is not what I drew" before
  the actual problem was named: a patch was a chain of overlapping circles, and a chain of circles
  cannot make a finger hanging off a map edge, a mass with a bay bitten out of it, or a ring around
  a hollow — which is most of what is on the sketch. A hill can now be a **traced outline**, and the
  patches are traced from the drawing, patch by patch. Approximating the *character* of a drawing
  ("irregular patches, some elongated") is not the same as copying it, and the difference was
  obvious to the person who drew it long before it was obvious to me.

  Two mistakes inside that, both of which flattened the traced shapes back into ovals: smoothing the
  outline with curves through the **midpoints of its edges**, which cuts every corner off (a
  Catmull-Rom spline passes through the points themselves), and drawing the slope as a **larger copy
  of the shape** made by pushing its points away from its centre, which pulls the lobes apart and
  closes the bays (it is a thick stroke of the outline instead).

### Where it stands

`npm run balance -- kingdom --map=dune-throne` loses on **waves 7–9**, against 11 on the Meadow. The
diagnosis is worth keeping: with the first hill layout, `--gold=6000` reached wave 17. **The roster
can hold three fronts; it cannot afford to.** Three fronts want something close to three defences
and the wave rewards are tuned for one. The levers, if it needs them, are income on that map or
later-opening fronts — not stronger towers.

Two things already went in for the same reason: fronts open on **waves 1, 4 and 7** rather than all
at once (three places to be at once with a wave-one purse made the opening a guess about which gate
to guard), and the fronts were narrowed from 92 to 66 so a defence can cover the width of one.

The fronts thread the sand between the traced patches and clip a hill here and there — 5–11% of
each route's length. That is left alone deliberately: creeps walk over hills, these are low rises
rather than cliffs, and bending the routes around every lobe would mean distorting shapes that were
traced on purpose. A patch that sits in the enemy's line is simply the most exposed ground on the
map, and the most valuable.

Read those numbers sceptically, as ever. The fake player clusters within a front but has no idea
that the central massif covers two fronts at once, which is the entire point of the ground. Making
the hills denser actually made its big-purse runs *worse*, because more legal ground let it spread
further — the clustering finding from the nations session showing up a third time.

The harness did get two real fixes: it now builds only on fronts that have actually opened (it was
putting two thirds of its defence where nothing would walk for another five waves), and it deals
spots between the open fronts instead of filling the best one and ignoring the rest. The Meadow is
unchanged at 11, 11, 11, 13, 11, so neither fix moved the old numbers.

## The enemy keeps to the sand

The rule that arrived last and mattered most: **hills are solid ground**, not merely where you may
build. That makes a hand-drawn line between two points useless as a route, so routes are no longer
drawn at all. `src/game/terrain.ts` turns the ground into a walkable grid and finds each front's way
through the gaps; only the first and last points of a route — where it walks on, which gate it makes
for — are still read from the map.

That is the part worth keeping whatever happens to the shapes: **the ground and the enemy's path are
now the same fact**. Redraw a patch and the fronts move to suit. It is also what makes the map
editable by hand at all, which is what it is for.

Three mistakes inside it, each of which looked like something else:

- **No ladder of clearances.** With a single minimum, one narrow slot anywhere became the way in for
  the entire army, because nothing preferred the open ground beside it. Now a front tries 30 units of
  room, then 20, then 13, then anything.
- **No last rung.** When every minimum failed, the search returned nothing and the route quietly fell
  back to the straight line the map declares — walking the enemy over the hills, which is the exact
  thing the whole system exists to prevent, and in silence.
- **The run-in held to the full clearance.** The sand outside a gate is hard against stone and can
  never be as open as a corridor, so requiring it failed every rung for every front. Both ends of a
  route are excused now.

And a fourth, of a different kind: a cell counted as walkable if its *centre* was off a hill, so the
walkable region overlapped every hillside by half a cell and the front visibly clipped the grass.
Any part of a cell being hill blocks it now, and a cell's width comes off every clearance reading.

Measured on the current shapes: centre lines **0%** over hills, creep bodies grazing one about **4%**
of samples, all of it where a gap is narrower than a creep is wide.

`P` draws the fronts and their corridors. That was added for me and kept for the person editing the
map, because on ground drawn by hand there is no other way to see what moving a patch just did.

## The city, second pass

Reworked to Joschka's list once the ground was settled:

- **No royal hall** on this map (`CastleDef.hall: false`). The market and the plots stay — they are
  things you click, not decoration.
- **All three gates on the strip**, and the walled quarter sealed. A gate in the quarter's wall was
  a fourth way in that no front was making for; putting them all on one stretch of wall is what
  makes the three gates read as one defence problem.
- **Both parts smaller**, and the strip pushed east to 1190, which leaves a yard behind the wall
  rather than an empty field.
- **The plots re-laid** so none of them overlaps the wall — the farm's radius is 20 and the wall is
  24 thick from the block's left edge, which the old positions did not allow for.
- **The wall across the inside of the city is gone.** A block skipped drawing a face where a
  neighbour continued from it, but only looked for neighbours to the *east* — and every block runs
  east to the map edge, so a neighbour starting further *west* covers the whole face. That one
  missing case was the curtain drawn straight through the middle of the city.
- **The towers at the step no longer collide.** Gate towers are radius 20 at 46 from the gate's
  middle, corner towers radius 23, so a gate needs ~90 from the end of its wall and ~92 from the
  next one. The gates sit at 360, 500 and 640 for that reason.

## Loose ends

- The map is flagged **not balanced** on the chooser and needs playing.
- **The shapes are Joschka's to finish**, and he has started. As they stand the patches seal the
  middle of the board: no front can cross it with room to spare, so the middle one detours south and
  shares the southern corridor. Press `P` and it is obvious. Widening the gaps north and south of the
  central mass is the fix, and it is a data edit.
- The step in the castle wall sits lower than the drawing's, because the town needs the room.
