import type { ClientModule, ClientSurface, RenderElement } from 'claude-code'

// The game itself: a surface module that runs on the drawing side, with its
// own frame clock and its own clicks and keys, so playing never waits on the
// hooks module or on Claude. It posts only when a run starts or ends, and
// when the critter's colour is changed.
//
// The world is measured in sprite pixels: x from the field's left edge, and
// heights above the ground line. The desktop app draws it on a fine grid: a
// Box's size takes fractions of a character width (ch) across and of a line
// height (lh) down, and so do its margins, while its top and left take whole
// cells only, so every piece sits at top 0, left 0 and is moved by its
// margins. A `round` border makes a piece a pill or a disc. The terminal
// draws the same game in whole cells.

export type Surface = 'terminal' | 'desktop'
export type GameProps = {
  best: number
  /** Coins collected over every run: they unlock the critter's colours. */
  coins: number
  /** The colour picked, an index into SKINS. */
  skin: number
  /** Whether Claude is still working: once it is not, the game says so. */
  working: boolean
  columns: number
  surface: Surface
}
export type HazardKind = 'rock' | 'boulder' | 'crystal' | 'bugLow' | 'bugMid' | 'bugHigh'
export type Hazard = {
  id: number
  kind: HazardKind
  x: number
  /** Height of its underside above the ground (a bug flies). */
  y: number
  w: number
  h: number
  scored: boolean
  /** Closest the critter came to it while passing, for the close-call bonus. */
  gapMin: number
}
export type Coin = { id: number; x: number; y: number }
export type PowerKind = 'shield' | 'magnet'
export type Orb = { id: number; kind: PowerKind; x: number; y: number }
export type Particle = { id: number; x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; fall: number }
export type Popup = { id: number; x: number; y: number; text: string; color: string; life: number }
export type Phase = 'idle' | 'run' | 'paused' | 'over'
export type GameState = {
  phase: Phase
  /** Height of the critter's feet above the ground, in pixels. */
  lift: number
  /** Upward speed, pixels per second. */
  vy: number
  /** Jumps used since the critter last stood: 2 is a double jump. */
  jumps: number
  /** Seconds left of the squash on landing. */
  squash: number
  hazards: Hazard[]
  coins: Coin[]
  orbs: Orb[]
  particles: Particle[]
  popups: Popup[]
  score: number
  /** Hazards passed: drives the speed and the level. */
  cleared: number
  coinsRun: number
  level: number
  /** Seconds left of each power. */
  shield: number
  magnet: number
  /** Seconds the critter passes through hazards after its shield breaks. */
  invuln: number
  /** Seconds left of the level banner. */
  banner: number
  tick: number
  /** Pixels run so far: drives the legs, the ground ticks and the dot grid. */
  dist: number
  seed: number
  /** Pixels of clear ground before the next hazard. */
  gap: number
  nextId: number
  /** Seconds since the run was lost. */
  overT: number
  bestAtStart: number
  coinsAtStart: number
  newBest: boolean
  /** The colour this run unlocked, or ''. */
  unlocked: string
  /** A colour picked here and not yet back from the hooks module. */
  skin: number | null
}
export type GamePost = { phase: 'run' } | { phase: 'over'; score: number; coins: number } | { skin: number }
export type World = { width: number; tickMs: number }
export type Skin = { name: string; at: number; body: string; shade: string; light: string }

// ── the world, in pixels ─────────────────────────────────────────────────
/** The ground line's y, from the field's top. */
export const GROUND = 34
/** The field's height on the desktop, ground strip included. */
const FIELD_H = 41
/** The critter's left edge, size and the part a hazard can hit. */
export const CRITTER_X = 8
export const CRITTER_W = 12
export const CRITTER_H = 10
const HIT_FROM = CRITTER_X + 2
const HIT_TO = CRITTER_X + 10
/** Jump: about 16 px high, 0.66 s in the air; a second, smaller one in the air. */
const JUMP_V = 97
const DOUBLE_V = 82
const GRAVITY = 294
/** ↓ in the air: straight down. */
const DROP_V = -170
/** Highest the feet go, so the head stays in the field. */
const CEILING = GROUND - CRITTER_H - 1
const SQUASH_S = 0.12
/** Seconds after a lost run before a press starts the next. */
export const OVER_LOCK = 0.6
const SHIELD_S = 12
const MAGNET_S = 10
const INVULN_S = 0.9
const BANNER_S = 1.8
const MAGNET_RANGE = 95
const MAGNET_PULL = 170
/** Clearance under this many pixels scores a close call. */
const CLOSE_PX = 2.2
const ORB_CHANCE = 0.14
/** Coins only a double jump reaches. */
const SKY_COIN_Y = 29
const LEVEL_EVERY = 8
const MAX_PARTICLES = 40

export const speedFor = (cleared: number) => Math.min(190, 75 + cleared * 2.2)
export const levelFor = (cleared: number) => 1 + Math.floor(cleared / LEVEL_EVERY)

export const SKINS: readonly Skin[] = [
  { name: 'Ember', at: 0, body: '#E8743B', shade: '#C2562A', light: '#F7A270' },
  { name: 'Mint', at: 40, body: '#2FB892', shade: '#1F8C6E', light: '#79DDBE' },
  { name: 'Berry', at: 120, body: '#B256D6', shade: '#8A3AAB', light: '#D592EE' },
  { name: 'Ocean', at: 250, body: '#3B82E8', shade: '#2A5FB5', light: '#80B0F5' },
  { name: 'Gold', at: 450, body: '#E8B53B', shade: '#B98820', light: '#F7D785' },
  { name: 'Ghost', at: 750, body: '#E4E8F0', shade: '#AEB5C4', light: '#FFFFFF' },
]
export const unlockedCount = (coins: number) => Math.max(1, SKINS.filter(s => coins >= s.at).length)

// ── how each surface draws it ────────────────────────────────────────────
/** Desktop: one pixel in ch across and lh down (a line is about 2.47 ch tall). */
const PX = 0.36
const PY = PX / 2.47
/** Overlap that hides the seams between pieces of one colour. */
const EPS = 0.04
/** Terminal: pixels per column. */
const TX = 1.5

export const heightFor = (surface: Surface) => (surface === 'desktop' ? 6 : 7)

export function worldFor(surface: Surface, columns: number): World {
  const cols = Math.max(24, columns)
  return surface === 'desktop' ? { width: Math.floor(cols / PX), tickMs: 20 } : { width: Math.floor(cols * TX), tickMs: 50 }
}

const JUMP_KEYS = new Set([' ', 'space', 'up', 'w', 'k', 'return'])
const DROP_KEYS = new Set(['down', 's', 'j'])

function random(seed: number): [number, number] {
  const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return [next / 4294967296, next]
}

/** A fixed pseudo-random number in [0, 1) for a position or an id: looks, never rules. */
function noise(n: number): number {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return v - Math.floor(v)
}

export function fresh(seed: number): GameState {
  return {
    phase: 'idle',
    lift: 0,
    vy: 0,
    jumps: 0,
    squash: 0,
    hazards: [],
    coins: [],
    orbs: [],
    particles: [],
    popups: [],
    score: 0,
    cleared: 0,
    coinsRun: 0,
    level: 1,
    shield: 0,
    magnet: 0,
    invuln: 0,
    banner: 0,
    tick: 0,
    dist: 0,
    seed: seed >>> 0,
    gap: 40,
    nextId: 1,
    overT: 0,
    bestAtStart: 0,
    coinsAtStart: 0,
    newBest: false,
    unlocked: '',
    skin: null,
  }
}

const isBug = (k: HazardKind) => k === 'bugLow' || k === 'bugMid' || k === 'bugHigh'

/** Where a hazard's underside is now: bugs bob as they fly. */
export function hazardY(o: Hazard, dist: number): number {
  return isBug(o.kind) ? o.y + Math.sin((dist + o.id * 23) / 7) * 0.8 : o.y
}

type PatternKind = HazardKind | 'pair'
const PATTERNS: readonly { kind: PatternKind; from: number; weight: number }[] = [
  { kind: 'rock', from: 1, weight: 5 },
  { kind: 'pair', from: 1, weight: 2 },
  { kind: 'boulder', from: 1, weight: 1.5 },
  { kind: 'crystal', from: 2, weight: 2 },
  { kind: 'bugLow', from: 2, weight: 1.5 },
  { kind: 'bugMid', from: 3, weight: 1.5 },
  { kind: 'bugHigh', from: 3, weight: 2 },
]

type Made = { hazards: Hazard[]; coins: Coin[]; orbs: Orb[]; seed: number; nextId: number; gap: number }

/** The next stretch of the course: a hazard (or two), maybe coins, maybe a power. */
function pattern(x0: number, level: number, cleared: number, speed: number, seed0: number, id0: number, has: { shield: boolean; magnet: boolean }): Made {
  let seed = seed0
  let nextId = id0
  const roll = () => {
    const [v, next] = random(seed)
    seed = next
    return v
  }
  const hazards: Hazard[] = []
  const coins: Coin[] = []
  const orbs: Orb[] = []
  const add = (kind: HazardKind, x: number, w: number, tall: number, y = 0) => {
    hazards.push({ id: nextId++, kind, x, y, w, h: tall, scored: false, gapMin: 99 })
  }
  const open = PATTERNS.filter(p => p.from <= level)
  const total = open.reduce((n, p) => n + p.weight, 0)
  let pick = roll() * total
  let kind: PatternKind = 'rock'
  for (const p of open) {
    pick -= p.weight
    if (pick < 0) {
      kind = p.kind
      break
    }
  }
  switch (kind) {
    case 'rock':
      add('rock', x0, 4 + Math.floor(roll() * 2), 6 + Math.floor(roll() * 3))
      break
    case 'pair':
      add('rock', x0, 4, 7)
      add('rock', x0 + 7, 3, 5)
      break
    case 'boulder':
      add('boulder', x0, 7, 9)
      break
    case 'crystal':
      add('crystal', x0, 10, 7)
      break
    case 'bugLow':
      add('bugLow', x0, 8, 5, 1.5)
      break
    case 'bugMid':
      add('bugMid', x0, 8, 5, 6)
      break
    case 'bugHigh':
      add('bugHigh', x0, 8, 5, 13.5)
      break
  }
  const end = hazards.reduce((m, o) => Math.max(m, o.x + o.w), x0)
  const top = hazards.reduce((m, o) => Math.max(m, o.y + o.h), 0)
  const mid = (x0 + end) / 2
  if (kind === 'bugHigh') {
    // Coins under a high bug: stay on the ground and run under it.
    if (roll() < 0.7) for (const dx of [-8, 2, 12]) coins.push({ id: nextId++, x: mid + dx, y: 4.5 })
  } else if (roll() < 0.55) {
    // An arc over the hazard, along a well-timed jump.
    const ys = [top + 7, top + 10, top + 7]
    ;[-11, 0, 11].forEach((dx, i) => coins.push({ id: nextId++, x: mid + dx, y: Math.min(22, ys[i] ?? 12) }))
  } else if (level >= 2 && roll() < 0.3) {
    // High coins: only a double jump gets them.
    for (const dx of [-9, 0, 9]) coins.push({ id: nextId++, x: mid + dx, y: SKY_COIN_Y })
  }
  const gap = 50 + roll() * 70 + speed * 0.4 - Math.min(12, (level - 1) * 2)
  if (cleared >= 6 && roll() < ORB_CHANCE) {
    const power: PowerKind = roll() < 0.5 ? 'shield' : 'magnet'
    if (!(power === 'shield' ? has.shield : has.magnet)) orbs.push({ id: nextId++, kind: power, x: end + gap * 0.5, y: 6 })
  }
  return { hazards, coins, orbs, seed, nextId, gap }
}

function fly(particles: readonly Particle[], dt: number): Particle[] {
  const out: Particle[] = []
  for (const p of particles) {
    const life = p.life - dt
    if (life <= 0) continue
    const y = p.y + p.vy * dt
    if (y < -2) continue
    out.push({ ...p, life, x: p.x + p.vx * dt, y, vy: p.vy - p.fall * dt })
  }
  return out
}

function rise(popups: readonly Popup[], dt: number): Popup[] {
  return popups.filter(p => p.life > dt).map(p => ({ ...p, life: p.life - dt, y: p.y + 9 * dt }))
}

const DUST = '#C9B79C'
const SPARK = '#FFE27A'
const SHIELD_FX = '#8FE3FF'
const MAGNET_FX = '#FF8A80'

/** One frame: the run moves on, a lost run settles; idle and paused wait. */
export function step(s: GameState, world: World): GameState {
  const dt = world.tickMs / 1000
  if (s.phase === 'paused') return s
  if (s.phase === 'idle') return { ...s, tick: s.tick + 1 }
  if (s.phase === 'over') {
    if (s.overT >= OVER_LOCK && s.particles.length === 0 && s.popups.length === 0) return s
    return { ...s, tick: s.tick + 1, overT: s.overT + dt, particles: fly(s.particles, dt), popups: rise(s.popups, dt) }
  }

  let { lift, vy, jumps, squash, seed, gap, score, cleared, coinsRun, level, shield, magnet, invuln, banner, nextId, newBest, unlocked } = s
  const fx = fly(s.particles, dt)
  const popups = rise(s.popups, dt)
  const say = (text: string, color: string, x = CRITTER_X, y = lift + 14) => {
    popups.push({ id: nextId++, x, y, text, color, life: 1.1 })
  }
  const speed = speedFor(cleared)
  const burst = (n: number, x: number, y: number, color: string, spread: number, up: number, fall: number, life: number, size: number) => {
    for (let i = 0; i < n; i++) {
      const id = nextId++
      fx.push({
        id,
        x,
        y,
        vx: -speed * 0.35 + (noise(id) - 0.5) * 2 * spread,
        vy: up * (0.35 + 0.65 * noise(id + 0.5)),
        life: life * (0.6 + 0.4 * noise(id + 0.25)),
        max: life,
        size,
        color,
        fall,
      })
    }
  }

  // The critter: gravity, the ceiling, landing.
  if (lift > 0 || vy > 0) {
    lift += vy * dt - (GRAVITY * dt * dt) / 2
    vy -= GRAVITY * dt
    if (lift > CEILING) {
      lift = CEILING
      vy = Math.min(vy, 0)
    }
    if (lift <= 0) {
      lift = 0
      vy = 0
      jumps = 0
      squash = SQUASH_S
      burst(4, CRITTER_X + 6, 0.3, DUST, 26, 14, 90, 0.35, 1.1)
    }
  }
  const move = speed * dt
  const dist = s.dist + move
  if (lift === 0 && Math.floor(dist / 26) !== Math.floor(s.dist / 26)) burst(1, CRITTER_X + 2, 0.2, DUST, 8, 10, 60, 0.3, 0.9)
  shield = Math.max(0, shield - dt)
  magnet = Math.max(0, magnet - dt)
  invuln = Math.max(0, invuln - dt)
  squash = Math.max(0, squash - dt)
  banner = Math.max(0, banner - dt)

  // Hazards: move, hit, score.
  let crashed = false
  const hazards: Hazard[] = []
  for (const o of s.hazards) {
    const m: Hazard = { ...o, x: o.x - move }
    const y = hazardY(m, dist)
    const overX = m.x + 0.5 < HIT_TO && m.x + m.w - 0.5 > HIT_FROM
    if (overX && !m.scored) {
      const hit = lift + 0.5 < y + m.h - 0.5 && lift + CRITTER_H - 0.8 > y + 0.5
      if (hit && invuln <= 0) {
        if (shield > 0) {
          shield = 0
          invuln = INVULN_S
          burst(10, m.x + m.w / 2, y + m.h / 2, SHIELD_FX, 60, 40, 120, 0.6, 1.2)
          say('Shield saved you!', '#8FE3FF')
          continue
        }
        crashed = true
      }
      m.gapMin = hit ? -1 : Math.min(m.gapMin, Math.max(y - (lift + CRITTER_H), lift - (y + m.h)))
    }
    if (!m.scored && m.x + m.w <= HIT_FROM) {
      m.scored = true
      cleared += 1
      score += 1
      if (m.gapMin >= 0 && m.gapMin < CLOSE_PX) {
        score += 1
        say('Close! +1', '#FFE082')
      }
    }
    if (m.x + m.w > -6) hazards.push(m)
  }

  // Coins: the magnet pulls them in; touching one takes it.
  const coins: Coin[] = []
  const cx = CRITTER_X + CRITTER_W / 2
  for (const c of s.coins) {
    let x = c.x - move
    let y = c.y
    if (magnet > 0) {
      const dx = cx - x
      const dy = lift + CRITTER_H / 2 - y
      const d = Math.hypot(dx, dy)
      if (d < MAGNET_RANGE && d > 0.01) {
        const k = Math.min(1, (MAGNET_PULL * dt) / d)
        x += dx * k
        y += dy * k
      }
    }
    if (x > CRITTER_X - 1.5 && x < CRITTER_X + CRITTER_W + 1.5 && y > lift - 1.5 && y < lift + CRITTER_H + 1.5) {
      coinsRun += 1
      score += 1
      burst(5, x, y, SPARK, 40, 30, 60, 0.35, 0.9)
      const was = unlockedCount(s.coinsAtStart + coinsRun - 1)
      const now = unlockedCount(s.coinsAtStart + coinsRun)
      const skin = SKINS[now - 1]
      if (now > was && skin) {
        unlocked = skin.name
        say(`Unlocked ${skin.name}!`, '#C7F59B', CRITTER_X + 14, 18)
      }
      continue
    }
    if (x > -5) coins.push({ ...c, x, y })
  }

  // Power orbs.
  const orbs: Orb[] = []
  for (const o of s.orbs) {
    const x = o.x - move
    if (x > CRITTER_X - 3 && x < CRITTER_X + CRITTER_W + 3 && o.y > lift - 3 && o.y < lift + CRITTER_H + 3) {
      if (o.kind === 'shield') {
        shield = SHIELD_S
        say('Shield!', '#8FE3FF')
      } else {
        magnet = MAGNET_S
        say('Magnet!', '#FF9E9E')
      }
      burst(8, x, o.y, o.kind === 'shield' ? SHIELD_FX : MAGNET_FX, 50, 40, 80, 0.5, 1)
      continue
    }
    if (x > -6) orbs.push({ ...o, x })
  }

  // The course: a new stretch once the last has run far enough in.
  const rightmost = hazards.reduce((m, o) => Math.max(m, o.x + o.w), -Infinity)
  if (world.width - rightmost >= gap) {
    const made = pattern(world.width + 2, level, cleared, speed, seed, nextId, { shield: shield > 0, magnet: magnet > 0 })
    hazards.push(...made.hazards)
    coins.push(...made.coins)
    orbs.push(...made.orbs)
    seed = made.seed
    nextId = made.nextId
    gap = made.gap
  }

  const lv = levelFor(cleared)
  if (lv > level) {
    level = lv
    banner = BANNER_S
  }
  if (!newBest && s.bestAtStart > 0 && score > s.bestAtStart) {
    newBest = true
    say('New best!', '#FFD54F', CRITTER_X + 16, 20)
  }
  if (crashed) {
    burst(7, CRITTER_X + 6, lift + 6, '#FFFFFF', 55, 60, 140, 0.8, 1.2)
    burst(5, CRITTER_X + 6, lift + 6, '#FFD54F', 45, 50, 140, 0.8, 1)
  }
  return {
    ...s,
    phase: crashed ? 'over' : 'run',
    overT: 0,
    lift,
    vy,
    jumps,
    squash,
    hazards,
    coins,
    orbs,
    particles: fx.length > MAX_PARTICLES ? fx.slice(fx.length - MAX_PARTICLES) : fx,
    popups: popups.slice(-4),
    score,
    cleared,
    coinsRun,
    level,
    shield,
    magnet,
    invuln,
    banner,
    seed,
    gap,
    nextId,
    newBest,
    unlocked,
    dist,
    tick: s.tick + 1,
  }
}

export type StartContext = { best: number; coins: number }

function start(s: GameState, ctx: StartContext): GameState {
  return { ...fresh(s.seed + s.tick + 1), phase: 'run', bestAtStart: ctx.best, coinsAtStart: ctx.coins, skin: s.skin }
}

/** A click, Space or ↑: start a run, jump, jump again in the air, or resume. */
export function act(s: GameState, ctx: StartContext = { best: 0, coins: 0 }): GameState {
  if (s.phase === 'idle') return start(s, ctx)
  if (s.phase === 'over') return s.overT >= OVER_LOCK ? start(s, ctx) : s
  if (s.phase === 'paused') return { ...s, phase: 'run' }
  if (s.lift === 0 && s.vy === 0) return { ...s, vy: JUMP_V, jumps: 1, squash: 0 }
  if (s.jumps < 2) {
    const id = s.nextId
    const ring: Particle[] = [-1, -0.5, 0.5, 1].map((d, i) => ({
      id: id + i,
      x: CRITTER_X + 6,
      y: s.lift,
      vx: d * 45 - speedFor(s.cleared) * 0.3,
      vy: -8,
      life: 0.3,
      max: 0.3,
      size: 1,
      color: '#FFFFFF',
      fall: 0,
    }))
    // Always a boost, pressed early or late: some of the speed kept, plus the second jump's.
    return { ...s, vy: Math.max(s.vy, 0) * 0.4 + DOUBLE_V, jumps: 2, particles: [...s.particles, ...ring], nextId: id + ring.length }
  }
  return s
}

/** ↓ in the air: drop straight down. */
export function drop(s: GameState): GameState {
  return s.phase === 'run' && s.lift > 0 && s.vy > DROP_V ? { ...s, vy: DROP_V } : s
}

/** P: pause a run, or resume it. */
export function pause(s: GameState): GameState {
  return s.phase === 'run' ? { ...s, phase: 'paused' } : s.phase === 'paused' ? { ...s, phase: 'run' } : s
}

// ── colours ──────────────────────────────────────────────────────────────
type RGB = readonly [number, number, number]
const rgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
const alpha = (hex: string, a: number) => {
  const [r, g, b] = rgb(hex)
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(2)})`
}

/**
 * The desktop panel: plain and dark, like an editor's background, with no
 * scenery, so it sits quietly beside the chat and only what you play against
 * has colour.
 */
const PANEL = '#1E1F24'
const PANEL_EDGE = '#31333B'
const GRID_DOT = 'rgba(255,255,255,0.07)'
const GROUND_LINE = '#4B4F5B'
const GROUND_TICK = '#34373F'
/** The blue bug, light enough to read against the dark panel. */
const HIGH_BUG = '#86A4FF'

// ── the critter, in its own pixels (x, y from its top-left, w, h, part) ────
type Part = 'B' | 'S' | 'L' | 'E' | 'W' | 'P'
type Rect = readonly [number, number, number, number, Part]
const SHELL: readonly Rect[] = [
  [2, 0, 8, 1, 'B'],
  [1, 1, 10, 6, 'B'],
  [2, 1, 3, 0.8, 'L'], // shine
  [1, 6, 10, 1, 'S'], // underside
  [2, 4.3, 1.3, 0.7, 'P'], // cheeks
  [8.7, 4.3, 1.3, 0.7, 'P'],
]
const LEGS: readonly (readonly Rect[])[] = [
  [[2, 7, 1, 3, 'S'], [4, 7, 1, 2, 'S'], [7, 7, 1, 3, 'S'], [9, 7, 1, 2, 'S']],
  [[2, 7, 1, 2, 'S'], [4, 7, 1, 3, 'S'], [7, 7, 1, 2, 'S'], [9, 7, 1, 3, 'S']],
  [[2, 7, 1, 2, 'S'], [4, 7, 1, 1.6, 'S'], [7, 7, 1, 2, 'S'], [9, 7, 1, 1.6, 'S']], // tucked, in the air
]

const stride = (s: GameState) => Math.floor(s.dist / 7) % 2

/** Which legs: tucked in the air, else a stride every 7 px run. */
function legsFor(s: GameState): readonly Rect[] {
  if (s.lift > 0) return LEGS[2] ?? []
  if (s.phase !== 'run') return LEGS[0] ?? []
  return LEGS[stride(s)] ?? []
}

/** Arms swing against the legs; up in the air. */
function armsFor(s: GameState): readonly Rect[] {
  if (s.lift > 0) return [[0, 2, 1, 2, 'B'], [11, 2, 1, 2, 'B']]
  const k = s.phase === 'run' ? stride(s) : 0
  return [[0, 3 + k * 0.6, 1, 2, 'B'], [11, 3.6 - k * 0.6, 1, 2, 'B']]
}

/** Eyes: open with a glint, a blink now and then, flat once the run is lost. */
function eyesFor(s: GameState): readonly Rect[] {
  if (s.phase === 'over') return [[3, 3, 1.8, 0.6, 'E'], [7.4, 3, 1.8, 0.6, 'E']]
  if (s.tick % 160 < 6) return [[3.3, 3, 1.2, 0.5, 'E'], [7.8, 3, 1.2, 0.5, 'E']]
  return [[3.3, 2, 1.2, 2, 'E'], [7.8, 2, 1.2, 2, 'E'], [3.4, 2.1, 0.5, 0.6, 'W'], [7.9, 2.1, 0.5, 0.6, 'W']]
}

/** Squash on landing, stretch going up. */
function scaleFor(s: GameState): [number, number] {
  if (s.squash > 0) {
    const k = s.squash / SQUASH_S
    return [1 + 0.18 * k, 1 - 0.18 * k]
  }
  if (s.vy > 40) return [0.92, 1.08]
  if (s.vy < -80) return [0.95, 1.05]
  if (s.phase === 'idle') return [1, 1 + 0.025 * Math.sin(s.tick * 0.12)]
  return [1, 1]
}

const props = new WeakMap<object, GameProps>()

function propsOf(surface: ClientSurface<GameState>): GameProps {
  return props.get(surface) ?? { best: 0, coins: 0, skin: 0, working: true, columns: 60, surface: 'terminal' }
}

function worldOf(surface: ClientSurface<GameState>): World {
  const p = propsOf(surface)
  return worldFor(p.surface, surface.columns || p.columns)
}

/** Coins as they stand now, this run's included. */
const liveCoins = (p: GameProps, s: GameState) => Math.max(p.coins, s.coinsAtStart + s.coinsRun)

function skinIndex(p: GameProps, s: GameState): number {
  const open = unlockedCount(liveCoins(p, s))
  const want = s.skin ?? p.skin
  return want >= 0 && want < open ? want : 0
}

function apply(surface: ClientSurface<GameState>, next: GameState) {
  const was = surface.state
  if (next === was) return
  surface.setState(next)
  if ((was?.phase === 'idle' || was?.phase === 'over' || was === undefined) && next.phase === 'run') surface.post({ phase: 'run' } satisfies GamePost)
  if (was?.phase === 'run' && next.phase === 'over') surface.post({ phase: 'over', score: next.score, coins: next.coinsRun } satisfies GamePost)
}

/** C: the next colour unlocked. */
function cycleSkin(surface: ClientSurface<GameState>) {
  const s = surface.state
  if (!s) return
  const p = propsOf(surface)
  const open = unlockedCount(liveCoins(p, s))
  const next = (skinIndex(p, s) + 1) % open
  const name = SKINS[next]?.name ?? ''
  const note: Popup = { id: s.nextId, x: CRITTER_X, y: 24, text: open > 1 ? name : `More colours at ${SKINS[1]?.at ?? 40} coins`, color: '#FFFFFF', life: 1.1 }
  surface.setState({ ...s, skin: next, popups: [...s.popups, note], nextId: s.nextId + 1 })
  if (open > 1) surface.post({ skin: next } satisfies GamePost)
}

const pad = (n: number) => String(Math.min(n, 9999)).padStart(4, '0')
const fix = (n: number) => +n.toFixed(3)

const Game: ClientModule<GameProps, GameState> = (p, surface) => {
  props.set(surface, p)
  if (surface.state === undefined) {
    surface.every(worldOf(surface).tickMs, () => {
      const s = surface.state
      if (s) apply(surface, step(s, worldOf(surface)))
    })
    const ctx = (): StartContext => {
      const q = propsOf(surface)
      return { best: q.best, coins: q.coins }
    }
    surface.onPointer(e => {
      if (e.type !== 'down' || (e.button ?? 'left') !== 'left') return
      apply(surface, act(surface.state ?? fresh(Date.now()), ctx()))
    })
    surface.onKey(e => {
      const s = surface.state ?? fresh(Date.now())
      const key = e.key.toLowerCase()
      if (JUMP_KEYS.has(key)) apply(surface, act(s, ctx()))
      else if (DROP_KEYS.has(key)) apply(surface, drop(s))
      else if (key === 'p') apply(surface, pause(s))
      else if (key === 'c') cycleSkin(surface)
    })
    surface.setState(fresh(Date.now()))
  }
  const s = surface.state ?? fresh(0)
  const columns = Math.max(24, surface.columns || p.columns)
  const world = worldFor(p.surface, columns)
  const best = Math.max(p.best, s.score)
  const skin = SKINS[skinIndex(p, s)] ?? SKINS[0] ?? { name: 'Ember', at: 0, body: '#E8743B', shade: '#C2562A', light: '#F7A270' }
  const coinsNow = liveCoins(p, s)
  const ready = s.phase === 'over' && s.overT >= OVER_LOCK
  const narrow = columns < 84

  const lines: { text: string; color: string; strong?: boolean; extra?: { text: string; color: string } }[] = []
  if (s.phase === 'idle') {
    lines.push({ text: 'CRITTER RUN', color: '#FFFFFF', strong: true })
    lines.push({ text: 'Click or Space to start', color: '#FFE9A8' })
    lines.push({ text: narrow ? '↑ jump ×2 · ↓ drop · P pause · C colour' : '↑ / Space jump · again in the air for a double jump · ↓ drop · P pause · C colour', color: '#D9DEEA' })
    lines.push({ text: `★ ${best}   ● ${coinsNow}   ${skin.name}${unlockedCount(coinsNow) > 1 ? ` (${unlockedCount(coinsNow)}/${SKINS.length})` : ''}`, color: '#D9DEEA' })
  } else if (s.phase === 'paused') {
    lines.push({ text: 'PAUSED', color: '#FFFFFF', strong: true })
    lines.push({ text: 'P, Space or a click to go on', color: '#D9DEEA' })
  } else if (s.phase === 'over') {
    lines.push({
      text: `GAME OVER · ${s.score}`,
      color: '#FFFFFF',
      strong: true,
      extra: s.newBest ? { text: '  ★ New best!', color: '#FFD54F' } : { text: `  best ${best}`, color: '#B9C0D0' },
    })
    lines.push({ text: `● +${s.coinsRun} coins · ${coinsNow} in all`, color: '#FFE08A' })
    if (s.unlocked) lines.push({ text: `New colour: ${s.unlocked}! Press C to wear it`, color: '#C7F59B' })
    lines.push({ text: ready ? 'Click or Space to run again' : ' ', color: '#FFE9A8' })
  }

  const { Box, Text } = surface.elements

  // Chips across the top: the level and powers on the left, the counts on the right.
  const chip = (key: string, text: string, color = '#FFFFFF', bg = 'rgba(16,20,36,0.55)') => (
    <Box key={key}>
      <Text size="caption" mono tabular color={color} backgroundColor={bg}>
        {` ${text} `}
      </Text>
    </Box>
  )
  const left: RenderElement[] = []
  if (s.phase !== 'idle') left.push(chip('lv', `LV ${s.level}`))
  if (s.shield > 0) left.push(chip('shield', `🛡 ${Math.ceil(s.shield)}`, '#BFF0FF'))
  if (s.magnet > 0) left.push(chip('magnet', `🧲 ${Math.ceil(s.magnet)}`, '#FFC9C9'))
  if (!p.working && s.phase !== 'idle') left.push(chip('done', '✓ Claude is done', '#FFFFFF', 'rgba(46,125,50,0.85)'))
  const right: RenderElement[] = [chip('best', `★ ${pad(best)}`, '#FFE08A'), chip('coins', `● ${s.coinsRun}`, '#FFE08A'), chip('score', pad(s.score))]

  if (p.surface === 'desktop') {
    const W = world.width
    // A rectangle of the world, in pixels, as a Box on the fine grid: `round`
    // makes it a pill or a disc, edged in the colour given or its own.
    // (Not `h` for the height: that is the JSX factory's name here.)
    const px = (key: string, x: number, top: number, w: number, tall: number, color: string, round?: string | true) => {
      const l = Math.max(0, x)
      const r = Math.min(x + w, W)
      const t = Math.max(0, top)
      const b = Math.min(top + tall, FIELD_H)
      if (r - l <= 0.05 || b - t <= 0.05) return null
      return round ? (
        <Box
          key={key}
          position="absolute"
          top={0}
          left={0}
          marginLeft={fix(l * PX)}
          marginTop={fix(t * PY)}
          width={fix((r - l) * PX)}
          height={fix((b - t) * PY)}
          backgroundColor={color}
          borderStyle="round"
          borderColor={round === true ? color : round}
          padding={0}
        />
      ) : (
        <Box
          key={key}
          position="absolute"
          top={0}
          left={0}
          marginLeft={fix(l * PX)}
          marginTop={fix(t * PY)}
          width={fix((r - l) * PX + EPS)}
          height={fix((b - t) * PY + EPS)}
          backgroundColor={color}
        />
      )
    }
    const pieces: (RenderElement | null)[] = []
    const put = (...more: (RenderElement | null)[]) => {
      pieces.push(...more)
    }

    // No scenery: a plain dark panel like an editor's, with a faint dot grid
    // drifting by and one ground line with ticks under it, so the run still
    // reads as moving.
    const layer = (name: string, pace: number, period: number, each: (key: string, x: number, k: number) => void) => {
      const off = s.dist * pace
      const first = Math.floor(off / period) - 1
      for (let k = first; k <= first + Math.ceil(W / period) + 2; k++) each(`${name}${k}`, k * period - off, k)
    }
    layer('dot', 0.25, 16, (key, x) => {
      for (let r = 0; r < 4; r++) put(px(`${key}r${r}`, x, 4 + r * 8, 0.7, 0.7, GRID_DOT))
    })
    put(px('ground', 0, GROUND, W, 0.8, GROUND_LINE))
    layer('tick', 1, 17, (key, x, k) => {
      put(px(key, x + noise(k) * 8, GROUND + 2.5 + noise(k * 2.7) * 3, 1.5 + noise(k * 1.3) * 2.5, 0.6, GROUND_TICK))
    })

    // Hazards.
    for (const o of s.hazards) {
      const y = hazardY(o, s.dist)
      const top = GROUND - y - o.h
      const k = `h${o.id}`
      if (o.kind === 'rock' || o.kind === 'boulder') {
        const [body, edge, shine] = o.kind === 'rock' ? ['#A6ACB8', '#6E7480', '#D8DCE4'] : ['#B58E69', '#7A5B40', '#DEBC96']
        put(
          px(`${k}s`, o.x - 0.8, GROUND - 0.5, o.w + 1.6, 1.2, 'rgba(0,0,0,0.3)', true),
          px(k, o.x, top, o.w, o.h + 0.5, body, edge),
          px(`${k}l`, o.x + 1, top + 1, Math.max(1, o.w * 0.45), 1.4, shine, true),
        )
        if (o.kind === 'boulder') put(px(`${k}c`, o.x + o.w * 0.6, top + 2.5, 0.6, 3, '#6E5440'))
      } else if (o.kind === 'crystal') {
        put(
          px(`${k}s`, o.x - 0.8, GROUND - 0.5, o.w + 1.6, 1.2, 'rgba(0,0,0,0.3)', true),
          px(`${k}a`, o.x, top + 3, 3, o.h - 3 + 0.4, '#7C5AE8'),
          px(`${k}at`, o.x + 0.6, top + 1.8, 1.8, 1.4, '#7C5AE8'),
          px(`${k}b`, o.x + 3, top + 1.2, 4, o.h - 1.2 + 0.4, '#A385FF'),
          px(`${k}bt`, o.x + 3.8, top - 0.2, 2.4, 1.6, '#A385FF'),
          px(`${k}bl`, o.x + 4.2, top + 1.6, 0.9, o.h - 3, '#E4DAFF'),
          px(`${k}c`, o.x + 7, top + 2.5, 3, o.h - 2.5 + 0.4, '#8D6BF4'),
          px(`${k}ct`, o.x + 7.6, top + 1.4, 1.8, 1.4, '#8D6BF4'),
        )
      } else {
        // A bug, facing the critter, wings beating.
        const high = o.kind === 'bugHigh'
        const shell = high ? HIGH_BUG : '#E04848'
        const rim = high ? '#4F6AD4' : '#A82828'
        const up = Math.floor(s.tick / 3) % 2 === 0
        put(
          px(`${k}w1`, o.x + 2.2, top - (up ? 1.8 : 0.6), 3.2, up ? 2.2 : 1.2, 'rgba(255,255,255,0.75)', true),
          px(`${k}w2`, o.x + 4.6, top - (up ? 1.4 : 0.4), 3, up ? 2 : 1, 'rgba(255,255,255,0.6)', true),
          px(k, o.x + 1.5, top + 0.4, 6.5, o.h - 0.4, shell, rim),
          px(`${k}d`, o.x, top + 1.4, 2.6, 2.6, '#2A2A33', true),
          px(`${k}e`, o.x + 0.5, top + 2, 0.8, 0.8, '#FFFFFF'),
          px(`${k}p1`, o.x + 3.6, top + 1.4, 1.1, 1.1, '#2A2A33', true),
          px(`${k}p2`, o.x + 5.6, top + 2.6, 1.1, 1.1, '#2A2A33', true),
        )
      }
    }

    // Coins spin; orbs bob in a halo.
    for (const c of s.coins) {
      const turn = Math.abs(Math.cos((s.tick + c.id * 5) * 0.12))
      const w = Math.max(0.9, 4 * turn)
      const top = GROUND - c.y - 2
      put(px(`c${c.id}`, c.x - w / 2, top, w, 4, '#F5C542', '#D99A1E'))
      if (w > 2.2) put(px(`c${c.id}l`, c.x - w / 4, top + 0.9, 0.8, 1.6, '#FFF1B0'))
    }
    for (const o of s.orbs) {
      const bob = Math.sin((s.tick + o.id * 7) * 0.1)
      const cxo = o.x
      const cy = GROUND - o.y - bob
      const [fill, glow] = o.kind === 'shield' ? ['#4FC3F7', 'rgba(79,195,247,0.25)'] : ['#EF5350', 'rgba(239,83,80,0.25)']
      put(px(`o${o.id}g`, cxo - 4.5, cy - 4.5, 9, 9, glow, true), px(`o${o.id}`, cxo - 3, cy - 3, 6, 6, fill, '#FFFFFF'))
      if (o.kind === 'shield') put(px(`o${o.id}a`, cxo - 0.5, cy - 2, 1, 4, '#FFFFFF'), px(`o${o.id}b`, cxo - 2, cy - 0.5, 4, 1, '#FFFFFF'))
      else put(px(`o${o.id}a`, cxo - 2, cy - 2, 1, 3, '#FFFFFF'), px(`o${o.id}b`, cxo + 1, cy - 2, 1, 3, '#FFFFFF'), px(`o${o.id}c`, cxo - 2, cy + 0.5, 4, 1, '#FFFFFF'))
    }

    // The critter: squash and stretch about its feet, a bob as it runs.
    const [sx, sy] = scaleFor(s)
    const bob = s.phase === 'run' && s.lift === 0 && stride(s) === 1 ? 0.4 : 0
    const top = GROUND - CRITTER_H - s.lift
    const paint: Record<Part, string> = { B: skin.body, S: skin.shade, L: skin.light, E: '#2A1810', W: '#FFFFFF', P: 'rgba(255,120,120,0.45)' }
    const flicker = s.invuln > 0 && Math.floor(s.invuln * 14) % 2 === 1
    const body = (rects: readonly Rect[], name: string, dy: number) =>
      rects.map(([x, y, w, tall, part], i) => {
        const nx = 6 + (x - 6) * sx
        const ny = CRITTER_H + (y + dy - CRITTER_H) * sy
        return px(i === 0 && name === 'shell' ? 'body' : `${name}${i}`, CRITTER_X + nx, top + ny, w * sx, tall * sy, paint[part])
      })
    // A soft shadow on the ground, smaller and fainter the higher it jumps.
    const shadowW = Math.max(4, 10 - s.lift * 0.3)
    put(px('cshadow', CRITTER_X + 6 - shadowW / 2, GROUND - 0.5, shadowW, 1.2, `rgba(0,0,0,${Math.max(0.1, 0.32 - s.lift * 0.012).toFixed(2)})`, true))
    if (s.shield > 0 && !(s.shield < 2 && Math.floor(s.shield * 6) % 2 === 1)) {
      put(px('bubble', CRITTER_X - 2.5, top - 2.5, CRITTER_W + 5, CRITTER_H + 4, 'rgba(143,227,255,0.22)', 'rgba(170,236,255,0.85)'))
    }
    if (!flicker) put(...body(SHELL, 'shell', bob), ...body(armsFor(s), 'arm', bob), ...body(legsFor(s), 'leg', 0), ...body(eyesFor(s), 'eye', bob))

    // Bits flying about, and the words over them.
    for (const q of s.particles) {
      const a = Math.min(1, q.life / (q.max * 0.6))
      put(px(`p${q.id}`, q.x, GROUND - q.y - q.size, q.size, q.size, alpha(q.color, a)))
    }
    const words = s.popups.map(w => (
      <Box key={`w${w.id}`} position="absolute" top={0} left={0} marginLeft={fix(Math.max(0, Math.min(W - 30, w.x)) * PX)} marginTop={fix(Math.max(0, GROUND - w.y - 5) * PY)}>
        <Text size="caption" weight="bold" color={alpha(w.color, Math.min(1, w.life / 0.4))} backgroundColor={`rgba(16,20,36,${(0.5 * Math.min(1, w.life / 0.4)).toFixed(2)})`}>
          {` ${w.text} `}
        </Text>
      </Box>
    ))

    return (
      <Box position="relative" width={columns} height={heightFor('desktop')} overflow="hidden" backgroundColor={PANEL} borderStyle="round" borderColor={PANEL_EDGE} padding={0}>
        {pieces}
        {words}
        {s.banner > 0 && s.phase === 'run' ? (
          <Box key="banner" position="absolute" top={1} left={0} right={0} justifyContent="center">
            <Text weight="bold" color={alpha('#FFFFFF', Math.min(1, s.banner / 0.5))} backgroundColor={`rgba(16,20,36,${(0.6 * Math.min(1, s.banner / 0.5)).toFixed(2)})`}>
              {` LEVEL ${s.level} · faster! `}
            </Text>
          </Box>
        ) : null}
        <Box key="hudl" position="absolute" top={0} left={1} flexDirection="row" columnGap={1}>
          {left}
        </Box>
        <Box key="hudr" position="absolute" top={0} right={1} flexDirection="row" columnGap={1}>
          {right}
        </Box>
        {lines.length > 0 ? (
          <Box key="panel" position="absolute" top={1} left={0} right={0} justifyContent="center">
            <Box flexDirection="column" alignItems="center" backgroundColor="rgba(14,18,34,0.74)" borderStyle="round" borderColor="rgba(255,255,255,0.22)" paddingX={2} paddingY={0}>
              {lines.map((l, i) => (
                <Box key={`l${i}`}>
                  <Text size={l.strong ? 'body' : 'caption'} weight={l.strong ? 'bold' : 'regular'} color={l.color}>
                    {l.text}
                    {l.extra ? <Text color={l.extra.color}>{l.extra.text}</Text> : null}
                  </Text>
                </Box>
              ))}
            </Box>
          </Box>
        ) : null}
      </Box>
    )
  }

  // The terminal: whole cells, the same game underneath.
  const FIELD = heightFor('terminal') - 1
  const TY = GROUND / FIELD
  const col = (x: number) => Math.round(x / TX)
  const rowAt = (y: number) => Math.max(0, Math.min(FIELD - 1, Math.floor((GROUND - y) / TY)))
  const cells = (key: string, x: number, y: number, w: number, tall: number, color: string) => {
    const l = Math.max(0, col(x))
    const r = Math.min(columns, Math.max(col(x) + 1, col(x + w)))
    const t = Math.max(0, Math.min(FIELD - 1, Math.round((GROUND - y - tall) / TY)))
    const b = Math.max(t + 1, Math.min(FIELD, Math.round((GROUND - y) / TY)))
    if (r - l <= 0) return null
    return <Box key={key} position="absolute" left={l} top={t} width={r - l} height={b - t} backgroundColor={color} />
  }
  const glyph = (key: string, x: number, y: number, text: string, color: string, bg?: string) => {
    const l = col(x)
    if (l < 0 || l >= columns) return null
    return (
      <Box key={key} position="absolute" left={l} top={rowAt(y)}>
        {bg ? (
          <Text color={color} backgroundColor={bg} weight="bold">
            {text}
          </Text>
        ) : (
          <Text color={color}>{text}</Text>
        )}
      </Box>
    )
  }
  const things: (RenderElement | null)[] = []
  for (const o of s.hazards) {
    const k = `h${o.id}`
    if (isBug(o.kind)) {
      const shell = o.kind === 'bugHigh' ? HIGH_BUG : '#E04848'
      things.push(cells(`${k}d`, o.x, o.y, 1.5, o.h, '#2A2A33'), cells(k, o.x + 1.5, o.y, o.w - 1.5, o.h, shell))
    } else {
      things.push(cells(k, o.x, o.y, o.w, o.h, o.kind === 'crystal' ? '#A385FF' : o.kind === 'boulder' ? '#B58E69' : '#A6ACB8'))
    }
  }
  for (const c of s.coins) things.push(glyph(`c${c.id}`, c.x, c.y, '●', '#F5C542'))
  for (const o of s.orbs) things.push(glyph(`o${o.id}`, o.x, o.y, o.kind === 'shield' ? 'S' : 'M', '#FFFFFF', o.kind === 'shield' ? '#2B9FD6' : '#D9433F'))
  const crow = Math.max(0, FIELD - 2 - Math.round(s.lift / TY))
  const legs = s.lift > 0 ? ' ▀▀  ▀▀ ' : s.phase === 'run' && stride(s) === 1 ? '  ▀  ▀  ' : ' ▀ ▀▀ ▀ '
  const eyes = s.phase === 'over' ? ' -  - ' : s.tick % 160 < 6 ? ' _  _ ' : ' o  o '
  const words = s.popups.map(w => glyph(`w${w.id}`, Math.max(0, w.x), Math.min(GROUND - 1, w.y + 4), w.text, '#FFFFFF'))
  return (
    <Box flexDirection="column" width={columns} height={heightFor('terminal')}>
      <Box position="relative" width={columns} height={FIELD} overflow="hidden">
        {things}
        {s.invuln > 0 && Math.floor(s.invuln * 14) % 2 === 1 ? null : (
          <Box key="critter" position="absolute" left={col(CRITTER_X)} top={crow} flexDirection="column" width={10} height={2}>
            <Text>
              <Text color="#4FC3F7">{s.shield > 0 ? '(' : ' '}</Text>
              <Text color={skin.body}>▐</Text>
              <Text backgroundColor={skin.body} color="#2A1810" weight="bold">
                {eyes}
              </Text>
              <Text color={skin.body}>▌</Text>
              <Text color="#4FC3F7">{s.shield > 0 ? ')' : ' '}</Text>
            </Text>
            <Text color={skin.shade}>{` ${legs}`}</Text>
          </Box>
        )}
        {words}
        <Box key="hudl" position="absolute" top={0} left={0} flexDirection="row" columnGap={1}>
          {s.phase !== 'idle' ? <Text dimColor>{`LV ${s.level}`}</Text> : null}
          {s.shield > 0 ? <Text color="#4FC3F7">{`SHIELD ${Math.ceil(s.shield)}`}</Text> : null}
          {s.magnet > 0 ? <Text color="#EF5350">{`MAGNET ${Math.ceil(s.magnet)}`}</Text> : null}
          {!p.working && s.phase !== 'idle' ? <Text color="#46A758">✓ Claude is done</Text> : null}
        </Box>
        <Box key="hudr" position="absolute" right={1} top={0}>
          <Text>
            <Text color="#E8B53B">{`★ ${pad(best)}  ● ${s.coinsRun}  `}</Text>
            <Text dimColor>Score </Text>
            <Text weight="bold">{pad(s.score)}</Text>
          </Text>
        </Box>
        {s.banner > 0 && s.phase === 'run' ? (
          <Box key="banner" position="absolute" top={1} left={0} right={0} justifyContent="center">
            <Text weight="bold">{`LEVEL ${s.level} · faster!`}</Text>
          </Box>
        ) : null}
        {lines.length > 0 ? (
          <Box key="panel" position="absolute" top={1} left={0} right={0} flexDirection="column" alignItems="center">
            {lines.map((l, i) => (
              <Box key={`l${i}`}>
                <Text weight={l.strong ? 'bold' : 'regular'} dimColor={!l.strong && l.color === '#D9DEEA'}>
                  {l.text}
                  {l.extra ? <Text color={l.extra.color}>{l.extra.text}</Text> : null}
                </Text>
              </Box>
            ))}
          </Box>
        ) : null}
      </Box>
      <Text color="#5DAA5A" wrap="truncate">
        {'▔'.repeat(columns)}
      </Text>
    </Box>
  )
}

export default Game
