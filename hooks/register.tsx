import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { heightFor, SKINS, unlockedCount } from './game'
import type { GameProps, GamePost } from './game'

// A runner game in the band above the prompt while Claude is working. The
// game runs in ./game.tsx; this module decides when the band shows, keeps
// the best score, the coins, the runs and the critter's colour across
// sessions, and answers /runner.

const playing = atom({ plugin: 'runner', key: 'playing' } as const, false)
const best = atom({ plugin: 'runner', key: 'best' } as const, 0)
const enabled = atom({ plugin: 'runner', key: 'enabled' } as const, true)
const coins = atom({ plugin: 'runner', key: 'coins' } as const, 0)
const runs = atom({ plugin: 'runner', key: 'runs' } as const, 0)
const skin = atom({ plugin: 'runner', key: 'skin' } as const, 0)

const BEST_KEY = 'best'
const ENABLED_KEY = 'enabled'
const COINS_KEY = 'coins'
const RUNS_KEY = 'runs'
const SKIN_KEY = 'skin'
/** How long the band stays after a run ends once Claude is done. */
const LINGER_MS = 6_000

function isPost(data: unknown): data is GamePost {
  if (!data || typeof data !== 'object') return false
  const d = data as { phase?: unknown; score?: unknown; coins?: unknown; skin?: unknown }
  if (d.phase === 'run') return true
  if (d.phase === 'over') return typeof d.score === 'number' && typeof d.coins === 'number'
  return d.phase === undefined && typeof d.skin === 'number'
}

const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0)

async function setEnabled($: EngineInterface, on: boolean) {
  await update($, enabled, () => on)
  if (!on) await update($, playing, () => false)
  await $.store.set(ENABLED_KEY, on)
}

/** The footer button: flips the value as it is now, not as it was drawn. */
async function toggle($: EngineInterface) {
  const now = await update($, enabled, on => !on)
  if (!now) await update($, playing, () => false)
  await $.store.set(ENABLED_KEY, now)
}

async function stats($: EngineInterface): Promise<string> {
  const [b, c, r, k] = [await read($, best), await read($, coins), await read($, runs), await read($, skin)]
  const open = unlockedCount(c)
  const next = SKINS[open]
  const wearing = SKINS[k < open ? k : 0]?.name ?? 'Ember'
  return [
    `Best ${b} · ${c} coins · ${r} run${r === 1 ? '' : 's'}`,
    `Colours ${open}/${SKINS.length} (wearing ${wearing})${next ? `; ${next.name} at ${next.at} coins` : ''}. Press C in the game to change.`,
  ].join('\n')
}

const TOGGLE_KEY = 'runner-toggle'

export const register: Register = on => {
  let linger: { cancel: () => void } | null = null

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const get = (key: string) => $.store.get(key).catch(() => undefined)
    const [savedBest, savedOn, savedCoins, savedRuns, savedSkin] = [await get(BEST_KEY), await get(ENABLED_KEY), await get(COINS_KEY), await get(RUNS_KEY), await get(SKIN_KEY)]
    if (count(savedBest) > 0) await update($, best, b => Math.max(b, count(savedBest)))
    if (count(savedCoins) > 0) await update($, coins, c => Math.max(c, count(savedCoins)))
    if (count(savedRuns) > 0) await update($, runs, r => Math.max(r, count(savedRuns)))
    if (typeof savedSkin === 'number') await update($, skin, () => count(savedSkin))
    if (typeof savedOn === 'boolean') await update($, enabled, () => savedOn)
    await update($, playing, () => false)
    await $.command.register({
      name: 'runner',
      description: 'The runner game above the prompt while Claude works: on, off, stats, or no argument to flip it',
      argumentHint: '[on | off | stats]',
      immediate: true,
    })
    return result
  })

  on('command.run', { command: 'runner' }, async ($, e) => {
    const arg = (e.args ?? '').trim().toLowerCase()
    if (arg === 'stats') return { text: await stats($) }
    const now = await read($, enabled)
    const want = arg === 'on' ? true : arg === 'off' ? false : arg === '' ? !now : null
    if (want === null) return { text: 'Usage: /runner [on | off | stats]' }
    await setEnabled($, want)
    const b = await read($, best)
    return {
      text: want
        ? `Runner on: it shows above the prompt while Claude is working.${b > 0 ? ` Best score ${b}.` : ''}`
        : 'Runner off. /runner on brings it back.',
    }
  })

  on('ui.message', async ($, e, next) => {
    if (e.component !== 'AbovePrompt' || e.element !== 'runner' || !isPost(e.data)) return next(e)
    const data = e.data
    if ('skin' in data) {
      const k = count(data.skin)
      await update($, skin, () => k)
      await $.store.set(SKIN_KEY, k)
      return next(e)
    }
    linger?.cancel()
    linger = null
    if (data.phase === 'run') {
      await update($, playing, () => true)
    } else {
      const score = count(data.score)
      const top = await update($, best, b => Math.max(b, score))
      if (score > 0 && score >= top) await $.store.set(BEST_KEY, top)
      const total = await update($, coins, c => c + count(data.coins))
      await $.store.set(COINS_KEY, total)
      const played = await update($, runs, r => r + 1)
      await $.store.set(RUNS_KEY, played)
      linger = $.clock.after(LINGER_MS, () => {
        linger = null
        void update($, playing, () => false)
      })
    }
    return next(e)
  })

  // A Game on/off button in the prompt footer, beside the mode labels: there
  // whether or not Claude is working, so the game can be turned off ahead of
  // time. The engine's own labels are kept in front of it.
  // The footer is the engine's, no plugin's: `plugin: '*'` hears it with no `plugin` on `e`.
  on('ui.render', { component: 'SessionMode', plugin: '*' }, async ($, e, next) => {
    if (e.surface !== 'terminal' && e.surface !== 'desktop') return next(e)
    const isOn = await read($, enabled)
    const engine = await next(e)
    const { Box, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" columnGap={1}>
        {engine}
        <Button key={TOGGLE_KEY} plain dimColor={!isOn} label={isOn ? '🎮 Game on' : '🎮 Game off'} onPress={() => toggle($)} />
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' && e.surface !== 'desktop') return next(e)
    if (e.props.hasSurvey || e.props.maxRows < heightFor(e.surface)) return next(e)
    const isOn = await read($, enabled)
    const isPlaying = await read($, playing)
    if (!isOn || (!e.props.isWorking && !isPlaying)) return next(e)
    const { Box, Client } = $.ui.resolve(e)
    const props: GameProps = {
      best: await read($, best),
      coins: await read($, coins),
      skin: await read($, skin),
      working: e.props.isWorking,
      columns: e.props.bodyColumns,
      surface: e.surface,
    }
    return (
      <Box width="100%">
        <Client key="runner" module="./game.tsx" props={props} width="100%" height={heightFor(e.surface)} />
      </Box>
    )
  })
}
