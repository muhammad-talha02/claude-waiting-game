/** The best score, kept in $.store across sessions. */
export type BestScore = number

declare module 'claude-code' {
  interface PluginState {
    runner: {
      playing: boolean
      best: BestScore
      enabled: boolean
      /** Coins collected over every run: they unlock the critter's colours. */
      coins: number
      /** Runs played. */
      runs: number
      /** The critter's colour, an index into the game's SKINS. */
      skin: number
    }
  }
}
