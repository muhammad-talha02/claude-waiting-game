import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine, Mounted } from 'claude-code/testing'

import { act, CRITTER_W, CRITTER_X, drop, fresh, heightFor, levelFor, MAX_DESKTOP_COLUMNS, OVER_LOCK, pause, report, SKINS, speedFor, step, unlockedCount, worldFor } from '../hooks/game'
import type { GamePost, GameState, Hazard, HazardKind } from '../hooks/game'

const band = (isWorking: boolean) =>
  ({
    plugin: 'waiting-game',
    component: 'AbovePrompt',
    requestId: 'band',
    props: {
      hasSurvey: false,
      isCollapsed: false,
      isWorking,
      maxRows: 20,
      bodyColumns: 80,
      scroll: { offset: 0, bodyRows: 20 },
      view: {},
    },
  }) as const

// ── the game's own rules ────────────────────────────────────────────────

const DESK = worldFor('desktop', 80)
const TERM = worldFor('terminal', 80)

const rock = (id: number, x: number, h = 7): Hazard => ({ id, kind: 'rock', x, y: 0, w: 4, h, scored: false, gapMin: 99 })
/** A run with only these hazards in it: a far rock holds the next stretch back. */
const course = (s: GameState, hazards: Hazard[]): GameState => ({ ...s, hazards: [...hazards, rock(900, 100_000)], coins: [], orbs: [] })

test('a click starts a run; a press jumps, a second in the air jumps again, a third does nothing', () => {
  const idle = fresh(1)
  expect(idle.phase).toBe('idle')
  const run = act(idle)
  expect(run.phase).toBe('run')
  const up = act(run)
  expect(up.vy).toBeGreaterThan(0)
  expect(up.jumps).toBe(1)
  const air = step(step(up, DESK), DESK)
  const twice = act(air)
  expect(twice.jumps).toBe(2)
  expect(twice.vy).toBeGreaterThan(air.vy)
  const later = step(twice, DESK)
  expect(act(later)).toBe(later)
})

test('standing still, the critter runs into the first hazard, on either grid', () => {
  for (const world of [DESK, TERM]) {
    let s: GameState = act(fresh(7))
    for (let i = 0; i < 2000 && s.phase === 'run'; i++) s = step(s, world)
    expect(s.phase).toBe('over')
    expect(s.score).toBe(0)
  }
})

test('a jump rises about 16 px and lands in about two thirds of a second; a double jump goes higher', () => {
  let s: GameState = act(act(fresh(1)))
  let top = 0
  let frames = 0
  do {
    s = step(s, DESK)
    top = Math.max(top, s.lift)
    frames += 1
  } while (s.lift > 0 && frames < 200)
  expect(top).toBeGreaterThan(14)
  expect(top).toBeLessThan(18)
  expect(frames * DESK.tickMs).toBeGreaterThan(550)
  expect(frames * DESK.tickMs).toBeLessThan(800)

  let d: GameState = act(act(fresh(1)))
  let high = 0
  for (let i = 0; i < 200 && (i === 0 || d.lift > 0); i++) {
    if (i === 15) d = act(d)
    d = step(d, DESK)
    high = Math.max(high, d.lift)
  }
  expect(high).toBeGreaterThan(20)
})

test('↓ in the air drops straight down; P pauses until P, Space or a click', () => {
  const up = step(step(act(act(fresh(1))), DESK), DESK)
  expect(drop(up).vy).toBeLessThan(0)
  const ground = step(act(fresh(1)), DESK)
  expect(drop(ground)).toBe(ground)

  const paused = pause(ground)
  expect(paused.phase).toBe('paused')
  expect(step(paused, DESK)).toBe(paused)
  expect(pause(paused).phase).toBe('run')
  expect(act(paused).phase).toBe('run')
})

/** A careful player: jumps so the top of the jump is over each hazard, runs under high bugs. */
function autoplay(s: GameState): GameState {
  if (s.lift > 0 || s.vy !== 0) return s
  const ahead = s.hazards.filter(o => o.x + o.w > CRITTER_X + 2).sort((a, b) => a.x - b.x)[0]
  if (!ahead || ahead.kind === 'bugHigh') return s
  const d = ahead.x + ahead.w / 2 - (CRITTER_X + CRITTER_W / 2)
  return d <= speedFor(s.cleared) * 0.33 ? act(s) : s
}

test('a careful player clears 30 hazards as they speed up and change, on either grid', () => {
  for (const world of [DESK, TERM]) {
    let s: GameState = act(fresh(3))
    const seen = new Set<HazardKind>()
    for (let i = 0; i < 60_000 && s.phase === 'run' && s.cleared < 30; i++) {
      // No powers here: a shield would hide a hazard no one could clear.
      s = step(autoplay({ ...s, orbs: [] }), world)
      for (const o of s.hazards) seen.add(o.kind)
    }
    expect(s.phase).toBe('run')
    expect(s.cleared).toBe(30)
    expect(s.level).toBe(levelFor(30))
    expect(seen.size).toBeGreaterThan(3)
    expect(s.score).toBeGreaterThan(29)
  }
})

test('a coin is taken by touch and scores; the magnet pulls in one out of reach', () => {
  let s = course(act(fresh(5)), [])
  s = { ...s, coins: [{ id: 50, x: CRITTER_X + 30, y: 4 }] }
  for (let i = 0; i < 60; i++) s = step(s, DESK)
  expect(s.coinsRun).toBe(1)
  expect(s.score).toBe(1)

  let m = course(act(fresh(5)), [])
  m = { ...m, coins: [{ id: 51, x: CRITTER_X + 40, y: 26 }] }
  let plain = m
  m = { ...m, magnet: 5 }
  for (let i = 0; i < 80; i++) {
    m = step(m, DESK)
    plain = step(plain, DESK)
  }
  expect(m.coinsRun).toBe(1)
  expect(plain.coinsRun).toBe(0)
})

test('a shield takes one hit: the hazard breaks and the run goes on', () => {
  let s = course(act(fresh(5)), [rock(60, CRITTER_X + 30)])
  s = { ...s, shield: 5 }
  for (let i = 0; i < 40; i++) s = step(s, DESK)
  expect(s.phase).toBe('run')
  expect(s.shield).toBe(0)
  expect(s.hazards.some(o => o.id === 60)).toBe(false)
})

test('after a lost run a press waits a moment before starting the next', () => {
  let s = course(act(fresh(5)), [rock(60, CRITTER_X + 20)])
  for (let i = 0; i < 200 && s.phase === 'run'; i++) s = step(s, DESK)
  expect(s.phase).toBe('over')
  expect(act(s)).toBe(s)
  for (let i = 0; i * DESK.tickMs < OVER_LOCK * 1000 + 40; i++) s = step(s, DESK)
  expect(act(s).phase).toBe('run')
})

test('the level rises every 8 hazards, faster each time; colours unlock with coins', () => {
  expect(levelFor(0)).toBe(1)
  expect(levelFor(8)).toBe(2)
  expect(speedFor(20)).toBeGreaterThan(speedFor(0))
  expect(unlockedCount(0)).toBe(1)
  expect(unlockedCount(SKINS[1]?.at ?? 30)).toBe(2)
  expect(unlockedCount(1_000_000)).toBe(SKINS.length)
})

test('the title screen draws again only to blink, about 0.6 times a second on the desktop', () => {
  for (const world of [DESK, TERM]) {
    // As the game's clock does: count the frames that bring back the same state.
    let s = fresh(1)
    let held = 0
    let draws = 0
    const frames = 1600
    for (let i = 0; i < frames; i++) {
      const next = step(s, world, held)
      held = next === s ? held + 1 : 0
      if (next !== s) draws += 1
      s = next
    }
    // Shut and open again once every 160 frames: two draws.
    expect(draws).toBe(20)
    expect(s.tick).toBe(frames)
  }
  expect(20 / ((1600 * DESK.tickMs) / 1000)).toBeLessThan(0.7)
})

test('a paused game stands still; only words on it fade, then nothing is drawn', () => {
  const run = step(act(fresh(1)), DESK)
  const paused = { ...pause(run), popups: [{ id: 1, x: CRITTER_X, y: 24, text: 'Mint', color: '#FFFFFF', life: 0.5 }] }
  let s = paused
  for (let i = 0; i < 40; i++) s = step(s, DESK)
  expect(s.popups).toHaveLength(0)
  expect({ ...s, popups: [] }).toEqual({ ...paused, popups: [] })
  expect(step(s, DESK)).toBe(s)
})

test('the desktop field stops at 200 columns; the terminal takes them all', () => {
  expect(MAX_DESKTOP_COLUMNS).toBe(200)
  expect(worldFor('desktop', 1000)).toEqual(worldFor('desktop', MAX_DESKTOP_COLUMNS))
  expect(worldFor('desktop', 120).width).toBeLessThan(worldFor('desktop', 200).width)
  expect(worldFor('terminal', 300).width).toBeGreaterThan(worldFor('terminal', 200).width)
})

test('every post after a run ends says so, with the run it was', () => {
  let s: GameState = { ...act({ ...fresh(5), game: 42 }), skin: 1 }
  expect(report(s)).toEqual({ game: 42, run: 1, phase: 'run', score: 0, coins: 0, skin: 1 })
  s = course(s, [rock(60, CRITTER_X + 20)])
  for (let i = 0; i < 200 && s.phase === 'run'; i++) s = step(s, DESK)
  expect(report(s)).toMatchObject({ game: 42, run: 1, phase: 'over' })
  // A colour picked after: the same end, said again.
  expect(report({ ...s, skin: 0 })).toEqual({ ...report(s), skin: 0 })
  for (let i = 0; i * DESK.tickMs < OVER_LOCK * 1000 + 40; i++) s = step(s, DESK)
  expect(report(act(s))).toMatchObject({ game: 42, run: 2, phase: 'run' })
  expect(report(pause(act(act(s))))).toMatchObject({ run: 2, phase: 'run' })
})

// ── the band ────────────────────────────────────────────────────────────

test('the band shows the game only while Claude works, on terminal and desktop', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const idle = await $.ui.mount({ ...band(false), surface })
    expect(await idle.find({ type: 'Client' })).toBeUndefined()
    await idle.unmount()

    const busy = await $.ui.mount({ ...band(true), surface })
    const client = await busy.find({ type: 'Client' })
    expect(client?.key).toBe('waiting-game')
    expect(client?.props.height).toBe(heightFor(surface))
    expect((await busy.find({ in: 'waiting-game', type: 'Text', text: /Click or Space to start/ }))?.text).toContain('Click or Space')
    await busy.unmount()
  }
  const phone = await $.ui.mount({ ...band(true), surface: 'mobile' })
  expect(await phone.find({ type: 'Client' })).toBeUndefined()
  await phone.unmount()
})

test('the game still shows when the surface does not say whether the band is collapsed', async $ => {
  // The desktop app may leave isCollapsed out; a Client whose props hold
  // undefined is refused, and the game would silently not show.
  for (const surface of ['terminal', 'desktop'] as const) {
    const { isCollapsed: _, ...props } = band(true).props
    const ui = await $.ui.mount({ ...band(true), props: props as never, surface })
    const client = await ui.find({ type: 'Client' })
    expect(client?.key).toBe('waiting-game')
    expect((client?.props.props as { collapsed?: unknown } | undefined)?.collapsed).toBe(false)
    await ui.unmount()
  }
})

test('a click starts a run, Space jumps, and a lost run keeps the best score, the coins and the count', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'waiting-game' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...band(true), surface: 'desktop' })
  await ui.resize({ columns: 80, rows: heightFor('desktop'), in: 'waiting-game' })
  await ui.pointer({ type: 'down', x: 5, y: 3, button: 'left', in: 'waiting-game' })
  await ui.advance(DESK.tickMs)
  expect(await ui.find({ in: 'waiting-game', text: /Click or Space to start/ })).toBeUndefined()
  expect(await ui.find({ in: 'waiting-game', key: 'ground' })).toBeDefined()

  // On the desktop the critter moves on the fine grid, by its margins.
  const topOf = async () => Number((await ui.find({ in: 'waiting-game', key: 'body' }))?.props.marginTop)
  const ground = await topOf()
  await ui.key({ key: ' ', in: 'waiting-game' })
  await ui.advance(DESK.tickMs * 10)
  expect(await topOf()).toBeLessThan(ground)

  // Claude finishes while the run goes on: the band stays for the run, and says so.
  await ui.redraw(band(false).props)
  expect(await ui.find({ type: 'Client' })).toBeDefined()
  expect(await ui.find({ in: 'waiting-game', text: /Claude is done/ })).toBeDefined()

  // No more jumps: the run ends, and the band leaves a few seconds later.
  await ui.advance(DESK.tickMs * 2000)
  expect((await ui.find({ in: 'waiting-game', text: /GAME OVER/ }))?.text).toContain('GAME OVER')
  await clock.advance(7_000)
  expect(await ui.find({ type: 'Client' })).toBeUndefined()
  await ui.unmount()

  const stats = await $.command.run({ command: 'waiting-game', args: 'stats' } as never)
  expect(stats.text).toContain('1 run')
})

test('a colour picked in the game is kept, and the game draws it', async ($, on) => {
  mock.store(on)
  on('command.register', () => ({ value: { command: 'waiting-game' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...band(true), surface: 'desktop' })
  await ui.post({ game: 7, run: 1, phase: 'over', score: 3, coins: 40, skin: null }, { in: 'waiting-game' })
  await ui.post({ game: 7, run: 1, phase: 'over', score: 3, coins: 40, skin: 1 }, { in: 'waiting-game' })
  const client = await ui.find({ type: 'Client' })
  expect((client?.props.props as { skin?: number; coins?: number } | undefined)?.skin).toBe(1)
  expect((client?.props.props as { skin?: number; coins?: number } | undefined)?.coins).toBe(40)
  await ui.resize({ columns: 80, rows: heightFor('desktop'), in: 'waiting-game' })
  await ui.pointer({ type: 'down', x: 5, y: 3, button: 'left', in: 'waiting-game' })
  await ui.advance(DESK.tickMs)
  expect((await ui.find({ in: 'waiting-game', key: 'body' }))?.props.backgroundColor).toBe(SKINS[1]?.body)
  await ui.unmount()

  const stats = await $.command.run({ command: 'waiting-game', args: 'stats' } as never)
  expect(stats.text).toContain('wearing Mint')
})

test('/waiting-game off hides the band while Claude works, /waiting-game on brings it back', async ($, on) => {
  mock.store(on)
  on('command.register', () => ({ value: { command: 'waiting-game' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const off = await $.command.run({ command: 'waiting-game', args: 'off' } as never)
  expect(off.text).toContain('Waiting Game off')
  const ui = await $.ui.mount({ ...band(true), surface: 'terminal' })
  expect(await ui.find({ type: 'Client' })).toBeUndefined()

  const back = await $.command.run({ command: 'waiting-game', args: 'on' } as never)
  expect(back.text).toContain('Waiting Game on')
  await ui.redraw()
  expect(await ui.find({ type: 'Client' })).toBeDefined()
  await ui.unmount()
})

test('the terminal draws a run in whole cells: hazards come, and the critter jumps', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'waiting-game' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const term = worldFor('terminal', 80)
  const ui = await $.ui.mount({ ...band(true), surface: 'terminal' })
  await ui.resize({ columns: 80, rows: heightFor('terminal'), in: 'waiting-game' })
  await ui.pointer({ type: 'down', x: 5, y: 3, button: 'left', in: 'waiting-game' })
  await ui.advance(term.tickMs * 16)
  expect(await ui.find({ in: 'waiting-game', key: 'h1' })).toBeDefined()

  const topOf = async () => Number((await ui.find({ in: 'waiting-game', key: 'critter' }))?.props.top)
  const ground = await topOf()
  await ui.key({ key: 'up', in: 'waiting-game' })
  await ui.advance(term.tickMs * 6)
  expect(await topOf()).toBeLessThan(ground)
  await ui.unmount()
})

const footer = (modes: readonly string[]) =>
  ({ plugin: 'waiting-game', component: 'SessionMode', requestId: 'session-mode', props: { modes } }) as const

test('the footer button hides the game and shows it again, keeping the mode labels', async ($, on) => {
  mock.store(on)
  on('command.register', () => ({ value: { command: 'waiting-game' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  // Stands for the engine's own labels beneath the plugin.
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>focus</Text>
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['desktop', 'terminal'] as const) {
    const bar = await $.ui.mount({ ...footer(['focus']), surface })
    const game = await $.ui.mount({ ...band(true), surface })
    expect((await bar.find({ type: 'Button', key: 'waiting-game-toggle' }))?.text).toContain('Game on')
    expect((await bar.find({ type: 'Button', key: 'waiting-game-toggle' }))?.text).not.toContain('🎮')
    expect(await bar.find({ type: 'Text', text: '●' })).toBeDefined()
    expect(await bar.find({ type: 'Text', text: 'focus' })).toBeDefined()
    expect(await game.find({ type: 'Client' })).toBeDefined()

    await bar.press({ key: 'waiting-game-toggle' })
    expect((await bar.find({ type: 'Button', key: 'waiting-game-toggle' }))?.text).toContain('Game off')
    expect(await bar.find({ type: 'Text', text: '○' })).toBeDefined()
    await game.redraw()
    expect(await game.find({ type: 'Client' })).toBeUndefined()

    await bar.press({ key: 'waiting-game-toggle' })
    expect((await bar.find({ type: 'Button', key: 'waiting-game-toggle' }))?.text).toContain('Game on')
    await game.redraw()
    expect(await game.find({ type: 'Client' })).toBeDefined()
    await bar.unmount()
    await game.unmount()
  }
})

// ── what the band does for the game ─────────────────────────────────────

const IN = { in: 'waiting-game' } as const
const startAt = { type: 'down', x: 5, y: 3, button: 'left', in: 'waiting-game' } as const
/** The game's moving pieces: the ground ticks, the critter, the hazards. */
const MOVING = /^(tick|body|leg|h)-?\d/

/** The words over the game (a colour's name, "Close! +1"), by their keys. */
async function wordsOn(ui: Mounted<'desktop', 'AbovePrompt'>) {
  return (await ui.findAll({ ...IN, type: 'Box' })).filter(b => /^w\d+$/.test(b.key ?? ''))
}

/** Where the game's pieces whose keys match stand. */
async function placesOn(ui: Mounted<'desktop', 'AbovePrompt'>, keys: RegExp) {
  return (await ui.findAll({ ...IN, type: 'Box' }))
    .filter(b => keys.test(b.key ?? ''))
    .map(b => [b.key, b.props.marginLeft, b.props.marginTop, b.props.width, b.props.height])
}

async function startSession($: Engine, on: On, saved: Readonly<Record<string, unknown>> = {}) {
  const clock = mock.clock(on)
  mock.store(on, saved)
  on('command.register', () => ({ value: { command: 'waiting-game' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  return clock
}

test('on the title screen the critter still blinks, and nothing else moves', async ($, on) => {
  await startSession($, on)
  const ui = await $.ui.mount({ ...band(true), surface: 'desktop' })
  await ui.resize({ columns: 80, rows: heightFor('desktop'), ...IN })
  await ui.advance(DESK.tickMs * 10)
  expect(await ui.find({ ...IN, key: 'eye3' })).toBeDefined()
  const open = await ui.drawn(IN)
  await ui.advance(DESK.tickMs * 100)
  expect(await ui.drawn(IN)).toEqual(open)
  // Frame 160: the eyes shut, and open again six frames on.
  await ui.advance(DESK.tickMs * 52)
  expect(await ui.find({ ...IN, key: 'eye3' })).toBeUndefined()
  await ui.advance(DESK.tickMs * 10)
  expect(await ui.drawn(IN)).toEqual(open)
  await ui.unmount()
})

test('C on the title screen or in a pause shows four names at most, and they fade; the paused game stays put', async ($, on) => {
  await startSession($, on)
  const ui = await $.ui.mount({ ...band(true), surface: 'desktop' })
  await ui.resize({ columns: 80, rows: heightFor('desktop'), ...IN })
  for (let i = 0; i < 10; i++) await ui.key({ key: 'c', ...IN })
  expect(await wordsOn(ui)).toHaveLength(4)
  await ui.advance(2_000)
  expect(await wordsOn(ui)).toHaveLength(0)

  await ui.pointer(startAt)
  await ui.advance(DESK.tickMs * 30)
  await ui.key({ key: 'p', ...IN })
  await ui.advance(DESK.tickMs)
  const still = await placesOn(ui, MOVING)
  expect(still.length).toBeGreaterThan(5)
  for (let i = 0; i < 6; i++) await ui.key({ key: 'c', ...IN })
  expect(await wordsOn(ui)).toHaveLength(4)
  await ui.advance(2_000)
  expect(await wordsOn(ui)).toHaveLength(0)
  expect(await placesOn(ui, MOVING)).toEqual(still)
  expect(await ui.find({ ...IN, text: /PAUSED/ })).toBeDefined()
  await ui.unmount()
})

test('Ctrl and Cmd combos are left to the app, not taken as game keys', async ($, on) => {
  await startSession($, on)
  const ui = await $.ui.mount({ ...band(true), surface: 'desktop' })
  await ui.resize({ columns: 80, rows: heightFor('desktop'), ...IN })
  await ui.key({ key: ' ', ctrl: true, ...IN })
  await ui.key({ key: 'c', meta: true, ...IN })
  await ui.key({ key: 'up', meta: true, ...IN })
  await ui.advance(DESK.tickMs)
  expect(await ui.find({ ...IN, text: /Click or Space to start/ })).toBeDefined()
  expect(await wordsOn(ui)).toHaveLength(0)
  await ui.key({ key: ' ', ...IN })
  await ui.advance(DESK.tickMs)
  expect(await ui.find({ ...IN, text: /Click or Space to start/ })).toBeUndefined()
  await ui.unmount()
})

test('a game that failed, or one drawn anew, leaves no run playing, so the band goes once Claude is done', async ($, on) => {
  await startSession($, on)
  const ui = await $.ui.mount({ ...band(true), surface: 'terminal' })
  await ui.resize({ columns: 80, rows: heightFor('terminal'), ...IN })
  await ui.pointer(startAt)
  await ui.advance(TERM.tickMs)
  await ui.redraw(band(false).props)
  expect(await ui.find({ type: 'Client' })).toBeDefined()

  // It fails mid-run (laid out far wider than any screen, its tree passes the
  // bounds): no run is left to wait for.
  await ui.resize({ columns: 150_000, rows: heightFor('terminal'), ...IN }).catch(() => undefined)
  await ui.redraw()
  expect(await ui.find({ type: 'Client' }), 'after the fault').toBeUndefined()

  // Claude works again and a run starts; then the game is dropped mid-run (as
  // when the band has too little room for it), with nothing said.
  await ui.redraw(band(true).props)
  await ui.resize({ columns: 80, rows: heightFor('terminal'), ...IN })
  await ui.pointer(startAt)
  await ui.advance(TERM.tickMs)
  await ui.redraw(band(false).props)
  expect(await ui.find({ type: 'Client' }), 'mid-run').toBeDefined()
  await ui.unmount()
  // Drawn again once Claude is done: the run still seems to be on, so the band
  // shows a new game, which says nothing is playing, and the band goes.
  const anew = await $.ui.mount({ ...band(false), surface: 'terminal' })
  await anew.redraw()
  expect(await anew.find({ type: 'Client' }), 'after a new game').toBeUndefined()
  await anew.unmount()
})

test('a colour picked as a run ends keeps that run, counted once', async ($, on) => {
  const clock = await startSession($, on, { coins: 40 })
  const coinsIn = (text: string | undefined) => Number(/(\d+) coins/.exec(text ?? '')?.[1])
  const ui = await $.ui.mount({ ...band(true), surface: 'desktop' })
  await ui.resize({ columns: 80, rows: heightFor('desktop'), ...IN })
  await ui.key({ key: 'c', ...IN })
  await ui.pointer(startAt)
  await ui.advance(DESK.tickMs * 2000)
  expect(await ui.find({ ...IN, text: /GAME OVER/ })).toBeDefined()
  const ended = await $.command.run({ command: 'waiting-game', args: 'stats' } as never)
  expect(ended.text).toContain('1 run')
  expect(ended.text).toContain('wearing Mint')
  // C now, with Claude done: its post says the run's end again, which is not
  // counted twice, and the band still stays its few seconds after the end.
  await ui.redraw(band(false).props)
  await ui.key({ key: 'c', ...IN })
  await ui.redraw()
  expect(await ui.find({ type: 'Client' })).toBeDefined()
  await clock.advance(7_000)
  expect(await ui.find({ type: 'Client' })).toBeUndefined()
  await ui.unmount()
  const stats = await $.command.run({ command: 'waiting-game', args: 'stats' } as never)
  expect(stats.text).toContain('1 run')
  expect(stats.text).toContain('wearing Ember')
  expect(coinsIn(stats.text)).toBe(coinsIn(ended.text))

  // In the app a post can take the place of one sent earlier in the same
  // frame: when only the colour's post arrives, the run it ended still
  // counts, once, however often it comes.
  const again = await $.ui.mount({ ...band(true), surface: 'desktop' })
  const late: GamePost = { game: 9, run: 1, phase: 'over', score: 7, coins: 2, skin: 1 }
  await again.post(late, IN)
  await again.post(late, IN)
  await again.post({ ...late, skin: 0 }, IN)
  await again.post({ ...late, skin: 1 }, IN)
  await again.unmount()
  const after = await $.command.run({ command: 'waiting-game', args: 'stats' } as never)
  expect(after.text).toContain('2 runs')
  expect(after.text).toContain('wearing Mint')
  expect(coinsIn(after.text)).toBe(coinsIn(stats.text) + 2)
})

test('holding C saves the colour once it settles, not on every change', async ($, on) => {
  // A store of the test's own, to see each write.
  const store = new Map<string, unknown>([['coins', 120]])
  const saved: unknown[] = []
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    if (e.key === 'skin') saved.push(e.value)
    return { value: undefined }
  })
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'waiting-game' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...band(true), surface: 'desktop' })
  for (let i = 0; i < 8; i++) await ui.key({ key: 'c', ...IN })
  expect(saved).toEqual([])
  await clock.advance(1_000)
  // Eight presses through three colours: Berry.
  expect(saved).toEqual([2])
  await ui.unmount()
  expect((await $.command.run({ command: 'waiting-game', args: 'stats' } as never)).text).toContain('wearing Berry')
})

test('collapsing the band pauses a run, keeps it, and draws nothing until it opens', async ($, on) => {
  await startSession($, on)
  const ui = await $.ui.mount({ ...band(true), surface: 'desktop' })
  await ui.resize({ columns: 80, rows: heightFor('desktop'), ...IN })
  await ui.pointer(startAt)
  await ui.advance(DESK.tickMs * 20)
  const before = await placesOn(ui, MOVING)

  await ui.redraw({ ...band(true).props, isCollapsed: true })
  await ui.advance(DESK.tickMs * 200)
  expect(await ui.find({ type: 'Client' })).toBeDefined()
  expect(await ui.find({ ...IN, key: 'ground' })).toBeUndefined()
  // Keys don't reach a band out of sight.
  await ui.key({ key: 'p', ...IN })

  await ui.redraw(band(true).props)
  expect(await ui.find({ ...IN, text: /PAUSED/ })).toBeDefined()
  expect(await placesOn(ui, MOVING)).toEqual(before)
  await ui.key({ key: 'p', ...IN })
  await ui.advance(DESK.tickMs * 5)
  expect(await ui.find({ ...IN, text: /PAUSED/ })).toBeUndefined()
  expect(await placesOn(ui, MOVING)).not.toEqual(before)
  await ui.unmount()
})

test('on a very wide desktop window the field stops at 200 columns, centred, and hazards come in at its edge', async ($, on) => {
  await startSession($, on)
  const ui = await $.ui.mount({ ...band(true), surface: 'desktop', props: { ...band(true).props, bodyColumns: 600 } })
  await ui.resize({ columns: 600, rows: heightFor('desktop'), ...IN })
  await ui.pointer(startAt)
  await ui.advance(DESK.tickMs * 100)
  const outer = await ui.find({ ...IN, type: 'Box' })
  expect(outer?.props.width).toBe(600)
  expect(outer?.props.justifyContent).toBe('center')
  expect((await ui.find({ ...IN, key: 'field' }))?.props.width).toBe(MAX_DESKTOP_COLUMNS)
  const hazards = (await ui.findAll({ ...IN, type: 'Box' })).filter(b => /^h\d+$/.test(b.key ?? ''))
  expect(hazards.length).toBeGreaterThan(0)
  for (const b of hazards) expect(Number(b.props.marginLeft)).toBeLessThan(MAX_DESKTOP_COLUMNS)
  expect(JSON.stringify(await ui.drawn(IN)).length).toBeLessThan(100_000)
  await ui.unmount()
})
