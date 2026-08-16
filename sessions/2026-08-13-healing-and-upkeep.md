# 2026-08-13 — Hospital reach, lull-time healing, and the house/farm upgrade paths

Short session, three changes. No re-tuning of the Kingdom's roster — that is still the top of the
list from the last session.

---

## The mounted knight was never getting treated

Not a broken threshold, and nothing knight-specific in the code: a geometry hole.

A hospital admitted a man only if **he** was standing inside its reach. Its reach is 210. The
mounted knight's post has a leash of **230**, so he does his fighting *outside* the circle of the
ward that covers his own stable — he checked for a hospital, found none, and fought on until he
died. The lancer (215) had the same hole. Every other melee post is 140–175 and never noticed.

The rule is now that a hospital's reach covers **posts**: it takes a fighter if either he or the
post he was raised from stands inside the circle. That is also the rule the player can actually
see, since what is drawn on the map is a circle over a line of buildings.

Measured before and after, knight at 20% health, 253 units from the ward: before he stood and
fought; after he breaks off, rides in, and is back at 100% eight seconds later.

## Lull-time healing

A second, gentler threshold, `restAt`, default **70%** (`DEFAULT_REST_AT` in `towers.ts`, per-post
overridable, shown on the panel as "Rests at"). Below it a fighter walks to a hospital *during a
lull* instead of standing at his post carrying a wound.

Four conditions, and every one of them earns its place:

1. **He has been in the fight this wave.** No queueing at the ward before the first blow.
2. **His post has had nothing in reach for 2.5 seconds** (`LULL`). Without this he dithers: a wave
   arrives as a trickle, so "no target" flickers on and off, and the measured result was a man
   alternating between `fighting` and `retreating` twice a second who never got more than a few
   paces from his post.
3. **Anything entering his post's reach cancels it instantly**, wherever he is and whatever his
   health — mid-walk or mid-treatment. The line always comes first.
4. **A real retreat overrides it.** Falling below `retreatAt` while resting turns the visit into a
   retreat, and he stays until fit.

Not given to ranged towers. Emplacements already have their own version — a hospital mends anything
damaged in reach, whenever, and the price is that a building being worked on does not shoot — and
they have no idle time to spend anyway, since they shoot from where they stand.

## House and farm upgrades were dominated by sprawl

Both paths were priced above the thing they compete with, so neither was ever bought.

| | was | now |
| --- | --- | --- |
| Timber Frame | 110 for +2 (55 a head) | **60 for +5** (12 a head) |
| Townhouse | 180 for +3 (60 a head) | **120 for +8** (15 a head) |
| Plough Horse | 140 for +5 food (28 a bushel) | **95 for +7** (13.6 a bushel) |

The yardstick is what sprawl costs. Another house is 80 for 5, or **16 a head**; another farm is 70
*plus a housing place for the farmer*, about 85 all in for 6, or **14 a bushel**. Every upgrade now
comes in under its own yardstick, so improving a building is the better buy once you have the tech —
and it leaves your ground free for towers. Building wide is still right before Advanced Construction
and Husbandry are paid for.

The house sprite tiers keyed off the capacity *numbers* (≥7, ≥10), which the new figures would have
broken; the renderer reads the purchased upgrades now.

## State of the balance

`npm run balance` for the Kingdom, five seeds:

- before: lost on waves 11, 10, 11, 11, 11
- after: lost on waves 11, 11, 11, 13, 11

So: no regression, a small gain, and **the Kingdom still loses around wave 11**. Note that the fake
player barely buys upgrades, so it sees almost none of the economy change — a human will feel it far
more than this table does. Both new numbers and the healing change want a real playthrough.

## Also

- Audited every unit for the healing mechanic; the table is in `HANDOFF.md`. Everything that fights
  or shoots is covered **except hounds**, which have no retreat or healing code at all. Only the
  Wardens field them, so it is dead content today.
