# 2026-08-16 — A start screen, a second map, and selling

Two requests: a start screen that explains the rules and lets a game be configured before it runs,
and the ability to sell a building for half of what it cost. Both are in. A second map and a
`--map=` flag on the balance harness came along with the first, because a chooser with one entry in
it is not a chooser.

No balance work. `npm run balance` for the Kingdom on the Meadow is unchanged at 11, 11, 11, 13, 11.

---

## The start screen

`src/ui/start.ts` plus a block of markup in `index.html`. Four choices — **play mode, nation, map,
starting gold** — and the rules down the left in eight short sections.

Everything in it renders from `src/data/`: the mode list from `modes.ts`, the nations from
`nations.ts` (blurb, perks and all), the maps from `maps.ts`. That includes the **"not balanced"
flags** on the cards, and the warning line above the Begin button, which repeats them for whatever
combination is actually selected. Adding a mode or a map should be a data entry and nothing else.

Two structural decisions worth keeping:

- **One `Game`, one `Renderer` and one HUD for the life of the page.** The screen calls
  `Game.configure` rather than constructing anything. Building a fresh set per game would re-bind
  every HUD listener — two Start Wave clicks per press after the second game — and repeat several
  seconds of sprite pre-rendering. `Renderer.render` notices the ground is not the ground it painted
  and calls the new `retile`.
- **The world stands still while the screen is up.** The board behind it is the last game's; it
  should not play on unattended. Which also means opening the menu mid-game and dismissing it again
  costs nothing.

Ways back to it: **Menu** in the dev bar, and **Back to Menu** on the win/lose overlay.

### Play modes

One mode, *The Long Siege*, which is the game as it has always been. `src/data/modes.ts` gives a
mode a name, a blurb, its rules for the chooser, `lives`, `waves` and a design purse. `Game` reads
`lives` and `waves` from it and switches on nothing, so the second mode is an entry in that file —
until it needs to bend something that has no field yet, at which point the field goes in `modes.ts`
first.

### The second map

**The Hollow Way.** Where the Meadow gives four long straights, this coils: the road enters from the
north, doubles back twice, and its two halves run about a hundred units apart down the middle of the
board — so one cluster in that corridor covers two stretches of road at once, which has no
equivalent on the Meadow. The northern lane joins a sixth of the way along, which is early enough to
hurt.

The city is deliberately **identical** — same walls, plots, market, and the road still arrives at
the gate from due west. `paintCastleTown` puts the royal hall at hard-coded coordinates inside those
walls, so a map with the city anywhere else is a drawing job, not a data entry. That is now written
down in `HANDOFF.md` as a constraint rather than left to be rediscovered.

`npm run balance -- kingdom --map=hollow-way` → lost on 10, 9, 9, 9, 10, against 11, 11, 11, 13, 11
on the Meadow. Harder for the fake player, which is the expected result and not much of a verdict:
it places by distance-to-road and knows nothing about the double-back that is the point of the
ground.

## Selling

Half of everything spent on a building, upgrades included, rounded down. The last row of the
building's own panel, styled apart from the upgrades above it so demolition is never one misclick
away from a purchase.

Three decisions rather than accidents:

- **The refund is against gold actually paid.** `Tower.goldSpent` accumulates as it is spent instead
  of being recomputed from the price list. The Marches pay 70% for a hospital — recomputing would
  refund them half of a price they never paid, and any future price change would silently rewrite
  the value of everything already standing.
- **A gatehouse sells with its turrets**, and the refund covers them. The alternative is a turret
  standing on nothing.
- **The one refusal is housing.** Pulling down a house that other buildings are counted under would
  leave `housingFree` negative, which is a state the player cannot see and cannot easily undo. The
  row stays visible and says why. Food has no such guard on purpose: going hungry is survivable, so
  selling your last farm stays a mistake you are allowed to make.

Verified end to end in the browser: a crossbow at 45 with an 85 upgrade refunds 65, frees its
housing and clears the selection; a gatehouse at 180 with a 70 rock thrower refunds 125 and takes
both off the board; the starting house refuses with *"Your people would have nowhere to live"*.

## Loose ends

- The dev bar still has its own gold box and nation dropdown. They overlap with the start screen now
  but are quicker for testing, so they stay.
- The start screen has no keyboard navigation beyond tabbing, and no way to preview a map.
- The Hollow Way is untested by anything but the harness and needs playing.
