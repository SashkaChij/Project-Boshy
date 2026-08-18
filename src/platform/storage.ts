import type { Replay } from '../core/replay.js'
import type { LevelData } from '../core/types.js'

/**
 * Settings live in localStorage (small, synchronous, fine to lose).
 * Levels live in IndexedDB.
 *
 * The important caveat is iOS: WebKit's ITP deletes all script-writable
 * storage for a site the user has not visited in 7 days. So we ask for
 * persistence, and the UI presents "export to file" as the real backup rather
 * than as a power-user extra.
 */

const SETTINGS_KEY = 'fox.settings'
const DB_NAME = 'fox-levels'
const DB_VERSION = 1

export interface WorldProgress {
  cleared: boolean
  bestTicks: number
  bestDeaths: number
  assistOnly: boolean
}

export interface Settings {
  musicVolume: number
  sfxVolume: number
  touchMode: 'auto' | 'on' | 'off'
  difficulty: number
  assist: boolean
  progress: Record<string, WorldProgress>
}

const DEFAULTS: Settings = {
  musicVolume: 0.5,
  sfxVolume: 0.7,
  touchMode: 'auto',
  difficulty: 0,
  assist: false,
  progress: {},
}

let settings: Settings = { ...DEFAULTS, progress: {} }

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>
      settings = { ...DEFAULTS, ...parsed, progress: { ...(parsed.progress ?? {}) } }
    }
  } catch {
    settings = { ...DEFAULTS, progress: {} }
  }
  return settings
}

export function getSettings(): Settings {
  return settings
}

export function saveSettings(patch: Partial<Settings> = {}): void {
  settings = { ...settings, ...patch }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* private mode or quota; the session still works, it just will not persist */
  }
}

export function recordClear(worldId: string, ticks: number, deaths: number, assist: boolean): void {
  const prev = settings.progress[worldId]
  const better = !prev || !prev.cleared || ticks < prev.bestTicks
  settings.progress[worldId] = {
    cleared: true,
    bestTicks: better ? ticks : prev.bestTicks,
    bestDeaths: better ? deaths : prev.bestDeaths,
    assistOnly: prev ? prev.assistOnly && assist : assist,
  }
  saveSettings()
}

export function resetProgress(): void {
  saveSettings({ progress: {} })
}

/** Best effort; Safari may decline, and that is not an error worth surfacing. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist()
  } catch {
    /* ignore */
  }
  return false
}

// -------------------------------------------------------------- IndexedDB ---

export interface StoredLevel {
  id: string
  title: string
  updatedAt: number
  data: LevelData
  /** The author's own clear, kept so the level ships proof it is completable. */
  replay?: Replay
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('levels')) {
        db.createObjectStore('levels', { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'))
  })
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction('levels', mode)
        const req = fn(t.objectStore('levels'))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('indexedDB request failed'))
      }),
  )
}

export async function listLevels(): Promise<StoredLevel[]> {
  try {
    const all = await tx<StoredLevel[]>('readonly', (s) => s.getAll() as IDBRequest<StoredLevel[]>)
    return all.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

export async function getLevel(id: string): Promise<StoredLevel | undefined> {
  try {
    return await tx<StoredLevel | undefined>('readonly', (s) => s.get(id) as IDBRequest<StoredLevel | undefined>)
  } catch {
    return undefined
  }
}

export async function putLevel(data: LevelData, replay?: Replay): Promise<void> {
  // Keep any existing replay unless a new one is supplied, so saving an
  // unrelated edit does not silently discard the author's verified clear.
  const existing = replay ? undefined : await getLevel(data.id)
  const rec: StoredLevel = {
    id: data.id,
    title: data.meta.title,
    updatedAt: Date.now(),
    data,
    ...(replay ?? existing?.replay ? { replay: replay ?? existing?.replay } : {}),
  }
  await tx('readwrite', (s) => s.put(rec) as IDBRequest<IDBValidKey>)
}

export async function deleteLevel(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id) as IDBRequest<undefined>)
}

/** Time-ordered, collision-resistant enough for local ids. */
export function newLevelId(): string {
  const t = Date.now().toString(36)
  const r = Math.floor(Math.random() * 0x100000000).toString(36)
  return `${t}${r}`.padEnd(14, '0').slice(0, 14)
}
