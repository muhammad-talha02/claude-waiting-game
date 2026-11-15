import { expect, mock, test } from 'claude-code/testing'

import { act, CRITTER_W, CRITTER_X, drop, fresh, heightFor, levelFor, OVER_LOCK, pause, SKINS, speedFor, step, unlockedCount, worldFor } from '../hooks/game'
import type { GameState, Hazard, HazardKind } from '../hooks/game'

const band = (isWorking: boolean) =>
  ({
    plugin: 'runner',
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

// ── the band ────────────────────────────────────────────────────────────

test('the band shows the game only while Claude works, on terminal and desktop', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const idle = await $.ui.mount({ ...band(false), surface })
    expect(await idle.find({ type: 'Client' })).toBeUndefined()
    await idle.unmount()

    const busy = await $.ui.mount({ ...band(true), surface })
    const client = await busy.find({ type: 'Client' })
    expect(client?.key).toBe('runner')
    expect(client?.props.height).toBe(heightFor(surface))
    expect((await busy.find({ in: 'runner', type: 'Text', text: /Click or Space to start/ }))?.text).toContain('Click or Space')
    await busy.unmount()
  }
  const phone = await $.ui.mount({ ...band(true), surface: 'mobile' })
  expect(await phone.find({ type: 'Client' })).toBeUndefined()
  await phone.unmount()
})

test('a click starts a run, Space jumps, and a lost run keeps the best score, the coins and the count', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'runner' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...band(true), surface: 'desktop' })
  await ui.resize({ columns: 80, rows: heightFor('desktop'), in: 'runner' })
  await ui.pointer({ type: 'down', x: 5, y: 3, button: 'left', in: 'runner' })
  await ui.advance(DESK.tickMs)
  expect(await ui.find({ in: 'runner', text: /Click or Space to start/ })).toBeUndefined()
  expect(await ui.find({ in: 'runner', key: 'ground' })).toBeDefined()

  // On the desktop the critter moves on the fine grid, by its margins.
  const topOf = async () => Number((await ui.find({ in: 'runner', key: 'body' }))?.props.marginTop)
  const ground = await topOf()
  await ui.key({ key: ' ', in: 'runner' })
  await ui.advance(DESK.tickMs * 10)
  expect(await topOf()).toBeLessThan(ground)

  // Claude finishes while the run goes on: the band stays for the run, and says so.
  await ui.redraw(band(false).props)
  expect(await ui.find({ type: 'Client' })).toBeDefined()
  expect(await ui.find({ in: 'runner', text: /Claude is done/ })).toBeDefined()

  // No more jumps: the run ends, and the band leaves a few seconds later.
  await ui.advance(DESK.tickMs * 2000)
  expect((await ui.find({ in: 'runner', text: /GAME OVER/ }))?.text).toContain('GAME OVER')
  await clock.advance(7_000)
  expect(await ui.find({ type: 'Client' })).toBeUndefined()
  await ui.unmount()

  const stats = await $.command.run({ command: 'runner', args: 'stats' } as never)
  expect(stats.text).toContain('1 run')
})

test('a colour picked in the game is kept, and the game draws it', async ($, on) => {
  mock.store(on)
  on('command.register', () => ({ value: { command: 'runner' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...band(true), surface: 'desktop' })
  await ui.post({ phase: 'over', score: 3, coins: 40 }, { in: 'runner' })
  await ui.post({ skin: 1 }, { in: 'runner' })
  const client = await ui.find({ type: 'Client' })
  expect((client?.props.props as { skin?: number; coins?: number } | undefined)?.skin).toBe(1)
  expect((client?.props.props as { skin?: number; coins?: number } | undefined)?.coins).toBe(40)
  await ui.resize({ columns: 80, rows: heightFor('desktop'), in: 'runner' })
  await ui.pointer({ type: 'down', x: 5, y: 3, button: 'left', in: 'runner' })
  await ui.advance(DESK.tickMs)
  expect((await ui.find({ in: 'runner', key: 'body' }))?.props.backgroundColor).toBe(SKINS[1]?.body)
  await ui.unmount()

  const stats = await $.command.run({ command: 'runner', args: 'stats' } as never)
  expect(stats.text).toContain('wearing Mint')
})

test('/runner off hides the band while Claude works, /runner on brings it back', async ($, on) => {
  mock.store(on)
  on('command.register', () => ({ value: { command: 'runner' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const off = await $.command.run({ command: 'runner', args: 'off' } as never)
  expect(off.text).toContain('Runner off')
  const ui = await $.ui.mount({ ...band(true), surface: 'terminal' })
  expect(await ui.find({ type: 'Client' })).toBeUndefined()

  const back = await $.command.run({ command: 'runner', args: 'on' } as never)
  expect(back.text).toContain('Runner on')
  await ui.redraw()
  expect(await ui.find({ type: 'Client' })).toBeDefined()
  await ui.unmount()
})

test('the terminal draws a run in whole cells: hazards come, and the critter jumps', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'runner' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const term = worldFor('terminal', 80)
  const ui = await $.ui.mount({ ...band(true), surface: 'terminal' })
  await ui.resize({ columns: 80, rows: heightFor('terminal'), in: 'runner' })
  await ui.pointer({ type: 'down', x: 5, y: 3, button: 'left', in: 'runner' })
  await ui.advance(term.tickMs * 16)
  expect(await ui.find({ in: 'runner', key: 'h1' })).toBeDefined()

  const topOf = async () => Number((await ui.find({ in: 'runner', key: 'critter' }))?.props.top)
  const ground = await topOf()
  await ui.key({ key: 'up', in: 'runner' })
  await ui.advance(term.tickMs * 6)
  expect(await topOf()).toBeLessThan(ground)
  await ui.unmount()
})

const footer = (modes: readonly string[]) =>
  ({ plugin: 'runner', component: 'SessionMode', requestId: 'session-mode', props: { modes } }) as const

test('the footer button hides the game and shows it again, keeping the mode labels', async ($, on) => {
  mock.store(on)
  on('command.register', () => ({ value: { command: 'runner' } }))
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
    expect((await bar.find({ type: 'Button', key: 'runner-toggle' }))?.text).toContain('Game on')
    expect(await bar.find({ type: 'Text', text: 'focus' })).toBeDefined()
    expect(await game.find({ type: 'Client' })).toBeDefined()

    await bar.press({ key: 'runner-toggle' })
    expect((await bar.find({ type: 'Button', key: 'runner-toggle' }))?.text).toContain('Game off')
    await game.redraw()
    expect(await game.find({ type: 'Client' })).toBeUndefined()

    await bar.press({ key: 'runner-toggle' })
    expect((await bar.find({ type: 'Button', key: 'runner-toggle' }))?.text).toContain('Game on')
    await game.redraw()
    expect(await game.find({ type: 'Client' })).toBeDefined()
    await bar.unmount()
    await game.unmount()
  }
})
