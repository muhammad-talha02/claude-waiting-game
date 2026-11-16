# Changelog

## 0.7.2

- Fixes 0.7.1 not showing at all in the Claude desktop app: the app doesn't say whether the band is collapsed, and the game was handed an empty value that Claude Code refuses to draw.

## 0.7.1

- Lighter on the desktop app: the title screen redraws only when the critter blinks, the faint dot grid is gone, and on a very wide window the playing field stops at 200 columns, centred.
- Collapsing the band pauses a run, and nothing is redrawn until it opens again.
- Colour names from pressing C fade out on the title and pause screens too, four at most.
- A run's score, coins and count are kept when C is pressed the moment it ends, and never counted twice. The game no longer stays above the prompt after Claude is done when it was hidden or failed mid-run.
- Ctrl and Cmd shortcuts are no longer taken as game keys.
- Holding C no longer saves the colour on every change; saved numbers are kept to sensible limits.

## 0.7.0

- Renamed **Claude Waiting Game** (it was Critter Run). The plugin is now `waiting-game`, its marketplace `claude-waiting-game`, and `/waiting-game` takes the place of `/runner`. The start screen reads CLAUDE WAITING GAME.

## 0.6.1

- The footer toggle reads like the footer's own text: no 🎮 emoji, dim words, and a status dot, green **● Game on** or hollow **○ Game off**.

## 0.6.0

- A simple, developer-friendly look on the desktop: the scenery is gone (sky, sun, moon, stars, clouds, hills, grass and dirt). The game now runs on a plain dark panel like an editor's, with a faint dot grid and one ground line, so only the critter, hazards and coins have colour.

## 0.5.0

- An easier-on-the-eyes desktop scene: a deep, muted sky (steel blue by day, plum at dusk, navy at night) in place of the pale one, darker hills and earth, softer clouds and sun, and a smoother sky gradient.
- Rocks, boulders, crystals and the high blue bug are brighter, so they stand out against the darker sky; hazards cast a firmer shadow.
- The critter casts a shadow that shrinks as it jumps.

## 0.4.0

- Renamed the game **Critter Run** and redrew the desktop scene: a sky with a day-night cycle (sun, moon, stars), rolling hills, clouds, grass and dirt, in a rounded card.
- New hazards: boulders, crystals, and bugs flying low, at head height, or high (run under the blue ones).
- Coins, double jump, ↓ to drop, P to pause, C to change colour.
- Shield and magnet power-ups, a close-call bonus, a new level every 8 hazards cleared.
- Colours unlock with coins collected across runs; `/runner stats`.
- A **✓ Claude is done** chip when Claude finishes mid-run.

## 0.3.0

- A **🎮 Game on / off** button in the prompt footer.

## 0.2.0

- Smooth movement on the desktop app: the game draws on a fine pixel grid at 50 frames a second.

## 0.1.0

- First version: a runner game in the band above the prompt while Claude works, with the best score kept and `/runner on | off`.
