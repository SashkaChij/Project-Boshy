import type { LevelData } from '../core/types.js'

export interface CampaignWorld {
  /** Stable key used for progress records. */
  id: string
  /** i18n key for the display name. */
  nameKey: string
  level: LevelData
  order: number
}

const NAME_KEYS: Record<string, string> = {
  w1: 'world.forest',
  w2: 'world.factory',
  w3: 'world.void',
}

/**
 * Discovered rather than hand-listed, so adding a world is one file.
 * import.meta.glob is resolved at build time by Vite and by Vitest, so an
 * authoring mistake in a world surfaces as a failing test, not a runtime hole.
 */
const modules = import.meta.glob('./worlds/*.ts', { eager: true }) as Record<
  string,
  { world?: LevelData }
>

export const WORLDS: CampaignWorld[] = Object.entries(modules)
  .map(([path, mod]) => {
    const base = path.replace(/^.*\//, '').replace(/\.ts$/, '')
    return { base, mod }
  })
  .filter((e) => !!e.mod.world)
  .sort((a, b) => a.base.localeCompare(b.base))
  .map((e, i) => ({
    id: e.base,
    nameKey: NAME_KEYS[e.base] ?? 'world.forest',
    level: e.mod.world as LevelData,
    order: i,
  }))

export function worldById(id: string): CampaignWorld | undefined {
  return WORLDS.find((w) => w.id === id)
}
