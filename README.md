# Critter Run

A small runner game for [Claude Code](https://claude.com/claude-code), in the band above the prompt. It shows up while Claude works, so you have something to do during a long turn.

You jump rocks and bugs, collect coins, pick up power-ups and level up. It runs on a plain dark panel, like an editor's, so it sits quietly beside your work. It runs in the terminal and in the Claude desktop app's Code tab.

<!-- Add a screenshot or GIF here: ![Critter Run](docs/screenshot.png) -->

## Install

Needs Claude Code with mod support (it was built and tested on **2.1.325**). If the install fails on an older build, run `claude update` first.

**In a terminal session**, type at the prompt:

```
/plugin install runner --marketplace muhammad-talha02/critter-run
```

Answer `y` to add the marketplace, then press Enter to install it for your user (all your sessions).

**From a shell:**

```bash
claude plugin install runner --marketplace muhammad-talha02/critter-run
```

**In the Claude desktop app** (where `/plugin` doesn't run): click **+** next to the prompt box, then **Plugins**, then **Add marketplace** with `muhammad-talha02/critter-run`, then **Add plugin**.

A plugin installed from a terminal for your user also loads in the desktop app's Code tab.

## Update

```bash
claude plugin marketplace update critter-run
```

```bash
claude plugin update runner@critter-run
```

Then start a new session.

## Uninstall

```bash
claude plugin uninstall runner@critter-run
```

To keep it installed but hide the game, run `/runner off`.

## How it works

- The game shows only while Claude is working, and stays until a run you're playing ends. If Claude finishes mid-run, a green **✓ Claude is done** chip appears and you can finish the run.
- Click the game to start. Keys reach it once a click has given it the focus; Esc gives the focus back to the prompt.

## Controls

| Key | What it does |
| --- | --- |
| Click, Space, ↑, w, k, Enter | Start, jump, and jump again in the air (double jump) |
| ↓, s, j | Drop straight down from a jump |
| P | Pause and resume |
| C | Change the critter's colour (from the ones you've unlocked) |

## The game

- Rocks, boulders and crystals sit on the ground: jump them. Red bugs fly low or at head height: jump them too. **Blue bugs fly high: stay on the ground and run under them** (jumping into one ends the run).
- Coins are one point each. Arcs of coins follow a well-timed jump, coins under a blue bug reward running under it, and coins high in the sky need a double jump.
- **Close call**: clear a hazard by a hair for a bonus point.
- Power orbs: the **🛡 shield** (blue, a cross) takes one hit for you within 12 seconds; the **🧲 magnet** (red, a U) pulls coins in for 10 seconds.
- Every 8 hazards cleared is a new level: faster, with new hazards (crystals and low bugs from level 2, head-high and high bugs from level 3).
- After a lost run there's a short pause before a key starts the next one, so mashing Space doesn't restart by accident.

## Saved between sessions

Your best score, coins collected over every run, runs played, and the colour you picked. Coins unlock colours:

| Colour | Coins |
| --- | --- |
| Ember | start |
| Mint | 40 |
| Berry | 120 |
| Ocean | 250 |
| Gold | 450 |
| Ghost | 750 |

`/runner stats` shows where you are.

## On and off

| | |
| --- | --- |
| **● Game on / ○ Game off** | A toggle in the prompt footer, beside the mode labels; the dot is green while it's on |
| `/runner off` | Hide the game |
| `/runner on` | Show it again |
| `/runner` | Flip it |
| `/runner stats` | Best score, coins, runs and colours |

## Where it runs

- **Terminal**: in the fullscreen layout, drawn in whole character cells, 7 rows tall.
- **Claude desktop app** (Code tab): drawn on a fine pixel grid, 6 rows tall.
- **Not on mobile.** With less room than the band needs, it stays hidden.

## Development

The mod is a Claude Code function-hooks plugin with no build step:

| File | What it does |
| --- | --- |
| `hooks/register.tsx` | When the band shows, the footer button, `/runner`, and the saved stats |
| `hooks/game.tsx` | The game itself: physics, the course, and drawing for each surface |
| `types/index.d.ts` | The mod's state contract |
| `tests/runner.test.tsx` | Tests for the game rules and the band |

Run it from a clone without installing:

```bash
claude --plugin-dir ./critter-run
```

Check and test it:

```bash
claude plugin validate ./critter-run
```

```bash
claude plugin test ./critter-run
```

Once Claude Code has loaded the mod, it writes its types to `.claude-plugin/types/` (ignored by git), and `tsc -p .` type-checks it.

The critter, the hazards and the scenery are original art drawn in code.

## License

[MIT](LICENSE)
