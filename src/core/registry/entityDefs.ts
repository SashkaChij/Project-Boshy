/**
 * Entity definitions: geometry, editor field schema, and simulation flags.
 *
 * This file is the single source of truth for what an entity IS. The editor
 * GENERATES its palette and its property sheet from here -- there is no
 * per-entity UI code anywhere, so adding a trap is one entry here plus one
 * update function in entityBehaviour.ts.
 *
 * Deliberately data-only and DOM-free: sprites, icons and translation keys
 * live in registry/entityPresentation.ts so that art can never leak into the
 * deterministic core.
 */

export type FieldType = 'int' | 'float' | 'bool' | 'enum'

export interface FieldDef {
  key: string
  type: FieldType
  def: number
  min?: number
  max?: number
  step?: number
  /** For 'enum': the allowed values, in order. */
  values?: number[]
}

export type Category = 'system' | 'hazard' | 'block' | 'help' | 'boss'

export interface EntityDef {
  /** Collision/draw box, centred on the entity origin. */
  w: number
  h: number
  /** Grid snap in the editor, in pixels. */
  snap: number
  category: Category
  /** Contributes a solid rect to player collision. */
  solid?: boolean
  /** Solid only from above, like a platform. */
  oneway?: boolean
  /** Kills the player on overlap. */
  deadly?: boolean
  /** Can be destroyed by a player bullet. */
  shootable?: boolean
  /** Starting hit points for shootable entities. */
  hp?: number
  /** Entities with a direction use `d`; this lists the legal values. */
  dirs?: number[]
  fields: FieldDef[]
}

const NO_FIELDS: FieldDef[] = []

export const ENTITY_DEFS: Readonly<Record<string, EntityDef>> = Object.freeze({
  // ------------------------------------------------------------- system ---
  spawn: { w: 22, h: 22, snap: 16, category: 'system', dirs: [-1, 1], fields: NO_FIELDS },
  save: { w: 32, h: 32, snap: 16, category: 'system', shootable: true, hp: 1, fields: NO_FIELDS },
  goal: { w: 32, h: 32, snap: 16, category: 'system', fields: NO_FIELDS },
  warp: {
    w: 32, h: 32, snap: 32, category: 'system',
    fields: [{ key: 'room', type: 'int', def: 0, min: 0, max: 63 }],
  },
  sign: {
    w: 32, h: 32, snap: 16, category: 'system',
    fields: [{ key: 'text', type: 'int', def: 0, min: 0, max: 31 }],
  },

  // ------------------------------------------------------------- hazards ---
  cherry: {
    w: 22, h: 22, snap: 8, category: 'hazard', deadly: true, dirs: [0, 1, 2, 3],
    fields: [{ key: 'speed', type: 'float', def: 2, min: 0, max: 12, step: 0.5 }],
  },
  cherrySine: {
    w: 22, h: 22, snap: 8, category: 'hazard', deadly: true, dirs: [0, 1, 2, 3],
    fields: [
      { key: 'speed', type: 'float', def: 2, min: 0, max: 12, step: 0.5 },
      { key: 'amp', type: 'int', def: 48, min: 0, max: 256, step: 8 },
      { key: 'freq', type: 'int', def: 32, min: 4, max: 256, step: 4 },
    ],
  },
  cherryHome: {
    w: 22, h: 22, snap: 8, category: 'hazard', deadly: true,
    fields: [
      { key: 'speed', type: 'float', def: 2, min: 0.5, max: 8, step: 0.5 },
      { key: 'delay', type: 'int', def: 25, min: 0, max: 250, step: 5 },
    ],
  },
  cherryBounce: {
    w: 22, h: 22, snap: 8, category: 'hazard', deadly: true, dirs: [0, 1, 2, 3],
    fields: [{ key: 'speed', type: 'float', def: 3, min: 0.5, max: 12, step: 0.5 }],
  },
  minispike: {
    w: 16, h: 16, snap: 8, category: 'hazard', deadly: true, dirs: [0, 1, 2, 3],
    fields: NO_FIELDS,
  },
  turret: {
    w: 32, h: 32, snap: 16, category: 'hazard', dirs: [0, 1, 2, 3],
    fields: [
      { key: 'rate', type: 'int', def: 50, min: 5, max: 250, step: 5 },
      { key: 'speed', type: 'float', def: 4, min: 1, max: 16, step: 0.5 },
      { key: 'offset', type: 'int', def: 0, min: 0, max: 250, step: 5 },
    ],
  },
  fan: {
    w: 32, h: 32, snap: 16, category: 'hazard',
    fields: [
      { key: 'rate', type: 'int', def: 75, min: 10, max: 250, step: 5 },
      { key: 'count', type: 'int', def: 8, min: 2, max: 24 },
      { key: 'speed', type: 'float', def: 3, min: 1, max: 12, step: 0.5 },
      { key: 'spin', type: 'int', def: 0, min: -64, max: 64, step: 4 },
    ],
  },
  laser: {
    w: 32, h: 32, snap: 32, category: 'hazard', dirs: [0, 1, 2, 3],
    fields: [
      { key: 'period', type: 'int', def: 100, min: 20, max: 400, step: 10 },
      { key: 'warn', type: 'int', def: 30, min: 5, max: 120, step: 5 },
      { key: 'active', type: 'int', def: 30, min: 5, max: 200, step: 5 },
      { key: 'len', type: 'int', def: 8, min: 1, max: 25 },
      { key: 'offset', type: 'int', def: 0, min: 0, max: 400, step: 10 },
    ],
  },

  // -------------------------------------------------------------- blocks ---
  fallblock: {
    w: 32, h: 32, snap: 32, category: 'block', solid: true,
    fields: [{ key: 'delay', type: 'int', def: 0, min: 0, max: 100, step: 5 }],
  },
  riseblock: {
    w: 32, h: 32, snap: 32, category: 'block', solid: true,
    fields: [{ key: 'delay', type: 'int', def: 0, min: 0, max: 100, step: 5 }],
  },
  fakeblock: {
    // Looks exactly like a solid block. Is not one. The genre in one entity.
    w: 32, h: 32, snap: 32, category: 'block', fields: NO_FIELDS,
  },
  invisblock: {
    w: 32, h: 32, snap: 32, category: 'block', solid: true, fields: NO_FIELDS,
  },
  breakblock: {
    w: 32, h: 32, snap: 32, category: 'block', solid: true, shootable: true, hp: 1,
    fields: NO_FIELDS,
  },
  platform: {
    w: 48, h: 16, snap: 16, category: 'block', oneway: true,
    fields: [
      { key: 'dx', type: 'int', def: 1, min: -1, max: 1 },
      { key: 'dy', type: 'int', def: 0, min: -1, max: 1 },
      { key: 'dist', type: 'int', def: 96, min: 0, max: 768, step: 16 },
      { key: 'speed', type: 'float', def: 1.5, min: 0.25, max: 8, step: 0.25 },
    ],
  },
  crusher: {
    w: 64, h: 32, snap: 32, category: 'block', solid: true,
    fields: [
      { key: 'dist', type: 'int', def: 128, min: 32, max: 512, step: 32 },
      { key: 'speed', type: 'float', def: 8, min: 1, max: 16, step: 0.5 },
      { key: 'wait', type: 'int', def: 40, min: 5, max: 200, step: 5 },
      { key: 'offset', type: 'int', def: 0, min: 0, max: 400, step: 10 },
    ],
  },

  // ---------------------------------------------------------------- help ---
  refresher: { w: 24, h: 24, snap: 8, category: 'help', fields: NO_FIELDS },
  spring: {
    w: 32, h: 16, snap: 8, category: 'help', dirs: [0, 1, 2, 3],
    fields: [{ key: 'power', type: 'float', def: 12, min: 4, max: 24, step: 0.5 }],
  },
  gravflip: { w: 32, h: 32, snap: 16, category: 'help', fields: NO_FIELDS },

  // ---------------------------------------------------------------- boss ---
  boss: {
    w: 64, h: 64, snap: 32, category: 'boss', shootable: true, hp: 150,
    fields: [
      { key: 'pattern', type: 'enum', def: 0, values: [0, 1, 2] },
      { key: 'hp', type: 'int', def: 150, min: 10, max: 999, step: 10 },
    ],
  },
})

export const ENTITY_IDS: readonly string[] = Object.freeze(Object.keys(ENTITY_DEFS))

export function entityDef(t: string): EntityDef | undefined {
  return ENTITY_DEFS[t]
}

/** Resolve a property, falling back to the declared default. */
export function prop(def: EntityDef | undefined, p: Record<string, number>, key: string): number {
  const v = p[key]
  if (v !== undefined) return v
  const f = def?.fields.find((f) => f.key === key)
  return f ? f.def : 0
}

/** Strip properties that equal their default, so files stay small and diffable. */
export function compactProps(t: string, p: Record<string, number>): Record<string, number> | undefined {
  const def = ENTITY_DEFS[t]
  if (!def) return Object.keys(p).length ? p : undefined
  const out: Record<string, number> = {}
  let n = 0
  for (const f of def.fields) {
    const v = p[f.key]
    if (v !== undefined && v !== f.def) {
      out[f.key] = v
      n++
    }
  }
  return n ? out : undefined
}
