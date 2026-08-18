import { MAX_ENTITIES_PER_ROOM, MAX_ROOMS, ROOM_H, ROOM_W, TILE } from '../core/constants.js'
import { getTile, makeRoom, type LayerName } from '../core/level.js'
import { ENTITY_DEFS, entityDef, prop } from '../core/registry/entityDefs.js'
import type { EntitySpawn, LevelData, Room } from '../core/types.js'

export type ToolId = 'pencil' | 'rect' | 'fill' | 'eraser' | 'picker' | 'select' | 'entity'
export type { LayerName }

export interface TileEdit {
  i: number
  from: number
  to: number
}

export type Command =
  | { kind: 'tiles'; room: number; layer: LayerName; cells: TileEdit[] }
  | { kind: 'entAdd'; room: number; index: number; e: EntitySpawn }
  | { kind: 'entRemove'; room: number; index: number; e: EntitySpawn }
  | { kind: 'entChange'; room: number; index: number; from: EntitySpawn; to: EntitySpawn }
  | { kind: 'roomAdd'; index: number; room: Room }
  | { kind: 'roomRemove'; index: number; room: Room; startBefore: number; startAfter: number }

export interface Selection {
  tx0: number
  ty0: number
  tx1: number
  ty1: number
}

const UNDO_LIMIT = 100

/**
 * Editor state and its undo stack.
 *
 * The one rule that matters: ONE POINTER GESTURE IS ONE UNDO ENTRY. A drag
 * that paints forty tiles must undo as a single action. Getting this wrong is
 * the most common defect in hand-rolled editors and it makes the tool feel
 * broken even when everything else is right.
 */
export class EditorState {
  level: LevelData
  roomIndex = 0
  layer: LayerName = 'main'
  tool: ToolId = 'pencil'
  brushTile = 1
  brushEntity: string | null = null
  brushEntityDir = 0
  brushEntityProps: Record<string, number> = {}
  selection: Selection | null = null
  selectedEntity: number | null = null
  clipboard: { w: number; h: number; tiles: number[]; entities: EntitySpawn[] } | null = null

  showGrid = true
  showCollision = false
  showJumpArc = false
  crosshair = false

  camera = { x: 0, y: 0, zoom: 1 }
  dirty = false

  private undoStack: Command[][] = []
  private redoStack: Command[][] = []
  private gesture: Command[] | null = null
  private listeners = new Set<() => void>()

  constructor(level: LevelData) {
    this.level = level
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    for (const fn of this.listeners) fn()
  }

  get room(): Room {
    return this.level.rooms[this.roomIndex] ?? (this.level.rooms[0] as Room)
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  // ---------------------------------------------------------------- gestures --

  beginGesture(): void {
    if (this.gesture) this.endGesture()
    this.gesture = []
  }

  endGesture(): void {
    const g = this.gesture
    this.gesture = null
    if (!g || g.length === 0) return
    this.undoStack.push(g)
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift()
    this.redoStack.length = 0
    this.dirty = true
    this.emit()
  }

  /** Single-shot edits outside a drag still get their own undo entry. */
  private record(cmd: Command): void {
    if (this.gesture) {
      this.gesture.push(cmd)
      return
    }
    this.undoStack.push([cmd])
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift()
    this.redoStack.length = 0
    this.dirty = true
    this.emit()
  }

  undo(): void {
    const batch = this.undoStack.pop()
    if (!batch) return
    for (let i = batch.length - 1; i >= 0; i--) this.applyInverse(batch[i] as Command)
    this.redoStack.push(batch)
    this.dirty = true
    this.emit()
  }

  redo(): void {
    const batch = this.redoStack.pop()
    if (!batch) return
    for (const cmd of batch) this.applyForward(cmd)
    this.undoStack.push(batch)
    this.dirty = true
    this.emit()
  }

  private applyForward(cmd: Command): void {
    switch (cmd.kind) {
      case 'tiles': {
        const room = this.level.rooms[cmd.room]
        if (!room) return
        for (const c of cmd.cells) room.layers[cmd.layer][c.i] = c.to
        break
      }
      case 'entAdd': {
        this.level.rooms[cmd.room]?.entities.splice(cmd.index, 0, cmd.e)
        break
      }
      case 'entRemove': {
        this.level.rooms[cmd.room]?.entities.splice(cmd.index, 1)
        break
      }
      case 'entChange': {
        const r = this.level.rooms[cmd.room]
        if (r) r.entities[cmd.index] = structuredClone(cmd.to)
        break
      }
      case 'roomAdd': {
        this.level.rooms.splice(cmd.index, 0, cmd.room)
        break
      }
      case 'roomRemove': {
        this.level.rooms.splice(cmd.index, 1)
        this.level.start.room = cmd.startAfter
        break
      }
    }
    this.clampRoomIndex()
  }

  private applyInverse(cmd: Command): void {
    switch (cmd.kind) {
      case 'tiles': {
        const room = this.level.rooms[cmd.room]
        if (!room) return
        for (const c of cmd.cells) room.layers[cmd.layer][c.i] = c.from
        break
      }
      case 'entAdd': {
        this.level.rooms[cmd.room]?.entities.splice(cmd.index, 1)
        break
      }
      case 'entRemove': {
        this.level.rooms[cmd.room]?.entities.splice(cmd.index, 0, cmd.e)
        break
      }
      case 'entChange': {
        const r = this.level.rooms[cmd.room]
        if (r) r.entities[cmd.index] = structuredClone(cmd.from)
        break
      }
      case 'roomAdd': {
        this.level.rooms.splice(cmd.index, 1)
        break
      }
      case 'roomRemove': {
        this.level.rooms.splice(cmd.index, 0, cmd.room)
        this.level.start.room = cmd.startBefore
        break
      }
    }
    this.clampRoomIndex()
  }

  private clampRoomIndex(): void {
    if (this.level.rooms.length === 0) this.level.rooms.push(makeRoom(0, 0))
    this.roomIndex = Math.max(0, Math.min(this.roomIndex, this.level.rooms.length - 1))
    this.level.start.room = Math.max(0, Math.min(this.level.start.room, this.level.rooms.length - 1))
    this.selectedEntity = null
  }

  // ------------------------------------------------------------------- tiles --

  paint(tx: number, ty: number, tile: number): void {
    if (tx < 0 || ty < 0 || tx >= ROOM_W || ty >= ROOM_H) return
    const room = this.room
    const i = ty * ROOM_W + tx
    const from = room.layers[this.layer][i] ?? 0
    if (from === tile) return
    room.layers[this.layer][i] = tile
    this.record({ kind: 'tiles', room: this.roomIndex, layer: this.layer, cells: [{ i, from, to: tile }] })
  }

  paintRect(tx0: number, ty0: number, tx1: number, ty1: number, tile: number, outline: boolean): void {
    const cells: TileEdit[] = []
    const room = this.room
    const [x0, x1] = tx0 <= tx1 ? [tx0, tx1] : [tx1, tx0]
    const [y0, y1] = ty0 <= ty1 ? [ty0, ty1] : [ty1, ty0]
    for (let ty = Math.max(0, y0); ty <= Math.min(ROOM_H - 1, y1); ty++) {
      for (let tx = Math.max(0, x0); tx <= Math.min(ROOM_W - 1, x1); tx++) {
        if (outline && tx !== x0 && tx !== x1 && ty !== y0 && ty !== y1) continue
        const i = ty * ROOM_W + tx
        const from = room.layers[this.layer][i] ?? 0
        if (from === tile) continue
        room.layers[this.layer][i] = tile
        cells.push({ i, from, to: tile })
      }
    }
    if (cells.length) this.record({ kind: 'tiles', room: this.roomIndex, layer: this.layer, cells })
  }

  fill(tx: number, ty: number, tile: number): void {
    if (tx < 0 || ty < 0 || tx >= ROOM_W || ty >= ROOM_H) return
    const room = this.room
    const target = getTile(room, this.layer, tx, ty)
    if (target === tile) return
    const cells: TileEdit[] = []
    const seen = new Uint8Array(ROOM_W * ROOM_H)
    const stack = [[tx, ty]]
    while (stack.length) {
      const cur = stack.pop() as [number, number]
      const [cx, cy] = cur
      if (cx < 0 || cy < 0 || cx >= ROOM_W || cy >= ROOM_H) continue
      const i = cy * ROOM_W + cx
      if (seen[i]) continue
      seen[i] = 1
      if ((room.layers[this.layer][i] ?? 0) !== target) continue
      cells.push({ i, from: target, to: tile })
      room.layers[this.layer][i] = tile
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1])
    }
    if (cells.length) this.record({ kind: 'tiles', room: this.roomIndex, layer: this.layer, cells })
  }

  pick(tx: number, ty: number): void {
    const hit = this.entityAt(tx * TILE + TILE / 2, ty * TILE + TILE / 2)
    if (hit !== null) {
      const e = this.room.entities[hit] as EntitySpawn
      this.brushEntity = e.t
      this.brushEntityDir = e.d ?? 0
      // Picking up an entity takes its PROPERTIES too, so you stamp
      // pre-configured traps instead of retuning each one by hand.
      this.brushEntityProps = { ...(e.p ?? {}) }
      this.tool = 'entity'
      this.emit()
      return
    }
    this.brushTile = getTile(this.room, this.layer, tx, ty)
    this.tool = 'pencil'
    this.emit()
  }

  // ---------------------------------------------------------------- entities --

  entityAt(px: number, py: number): number | null {
    const ents = this.room.entities
    for (let i = ents.length - 1; i >= 0; i--) {
      const e = ents[i] as EntitySpawn
      const def = entityDef(e.t)
      const hw = (def?.w ?? 32) / 2
      const hh = (def?.h ?? 32) / 2
      if (px >= e.x - hw && px <= e.x + hw && py >= e.y - hh && py <= e.y + hh) return i
    }
    return null
  }

  addEntity(px: number, py: number): boolean {
    const type = this.brushEntity
    if (!type) return false
    const def = entityDef(type)
    if (!def) return false
    if (this.room.entities.length >= MAX_ENTITIES_PER_ROOM) return false

    const snap = def.snap || 1
    const x = Math.round(px / snap) * snap
    const y = Math.round(py / snap) * snap
    const e: EntitySpawn = { t: type, x, y }
    if (this.brushEntityDir) e.d = this.brushEntityDir
    if (Object.keys(this.brushEntityProps).length) e.p = { ...this.brushEntityProps }

    const index = this.room.entities.length
    this.room.entities.push(e)
    this.record({ kind: 'entAdd', room: this.roomIndex, index, e: structuredClone(e) })
    this.selectedEntity = index
    return true
  }

  removeEntity(index: number): void {
    const e = this.room.entities[index]
    if (!e) return
    this.room.entities.splice(index, 1)
    this.record({ kind: 'entRemove', room: this.roomIndex, index, e: structuredClone(e) })
    this.selectedEntity = null
  }

  moveEntity(index: number, px: number, py: number, from: EntitySpawn): void {
    const e = this.room.entities[index]
    if (!e) return
    const def = entityDef(e.t)
    const snap = def?.snap || 1
    e.x = Math.round(px / snap) * snap
    e.y = Math.round(py / snap) * snap
    this.record({ kind: 'entChange', room: this.roomIndex, index, from: structuredClone(from), to: structuredClone(e) })
  }

  setEntityProp(index: number, key: string, value: number): void {
    const e = this.room.entities[index]
    if (!e) return
    const from = structuredClone(e)
    if (key === 'd') e.d = value
    else {
      e.p = { ...(e.p ?? {}) }
      e.p[key] = value
    }
    this.record({ kind: 'entChange', room: this.roomIndex, index, from, to: structuredClone(e) })
  }

  entityProp(index: number, key: string): number {
    const e = this.room.entities[index]
    if (!e) return 0
    if (key === 'd') return e.d ?? 0
    return prop(entityDef(e.t), e.p ?? {}, key)
  }

  // ------------------------------------------------------------------- rooms --

  addRoom(gx: number, gy: number): boolean {
    if (this.level.rooms.length >= MAX_ROOMS) return false
    if (this.level.rooms.some((r) => r.x === gx && r.y === gy)) return false
    const room = makeRoom(gx, gy)
    const index = this.level.rooms.length
    this.level.rooms.push(room)
    this.record({ kind: 'roomAdd', index, room })
    this.roomIndex = index
    return true
  }

  removeRoom(index: number): void {
    if (this.level.rooms.length <= 1) return
    const room = this.level.rooms[index]
    if (!room) return
    const startBefore = this.level.start.room
    this.level.rooms.splice(index, 1)
    const startAfter = Math.max(0, Math.min(startBefore, this.level.rooms.length - 1))
    this.level.start.room = startAfter
    this.record({ kind: 'roomRemove', index, room, startBefore, startAfter })
    this.clampRoomIndex()
  }

  // --------------------------------------------------------------- clipboard --

  copySelection(): void {
    const s = this.selection
    if (!s) return
    const w = s.tx1 - s.tx0 + 1
    const h = s.ty1 - s.ty0 + 1
    const tiles: number[] = []
    for (let ty = s.ty0; ty <= s.ty1; ty++) {
      for (let tx = s.tx0; tx <= s.tx1; tx++) tiles.push(getTile(this.room, this.layer, tx, ty))
    }
    const x0 = s.tx0 * TILE
    const y0 = s.ty0 * TILE
    const x1 = (s.tx1 + 1) * TILE
    const y1 = (s.ty1 + 1) * TILE
    const entities = this.room.entities
      .filter((e) => e.x >= x0 && e.x < x1 && e.y >= y0 && e.y < y1)
      .map((e) => ({ ...structuredClone(e), x: e.x - x0, y: e.y - y0 }))
    this.clipboard = { w, h, tiles, entities }
  }

  paste(tx: number, ty: number): void {
    const c = this.clipboard
    if (!c) return
    this.beginGesture()
    const room = this.room
    const cells: TileEdit[] = []
    for (let y = 0; y < c.h; y++) {
      for (let x = 0; x < c.w; x++) {
        const dx = tx + x
        const dy = ty + y
        if (dx < 0 || dy < 0 || dx >= ROOM_W || dy >= ROOM_H) continue
        const i = dy * ROOM_W + dx
        const from = room.layers[this.layer][i] ?? 0
        const to = c.tiles[y * c.w + x] ?? 0
        if (from === to) continue
        room.layers[this.layer][i] = to
        cells.push({ i, from, to })
      }
    }
    if (cells.length) this.record({ kind: 'tiles', room: this.roomIndex, layer: this.layer, cells })
    for (const e of c.entities) {
      if (room.entities.length >= MAX_ENTITIES_PER_ROOM) break
      const placed: EntitySpawn = { ...structuredClone(e), x: e.x + tx * TILE, y: e.y + ty * TILE }
      const index = room.entities.length
      room.entities.push(placed)
      this.record({ kind: 'entAdd', room: this.roomIndex, index, e: structuredClone(placed) })
    }
    this.endGesture()
  }

  clearSelection(): void {
    const s = this.selection
    if (!s) return
    this.beginGesture()
    this.paintRect(s.tx0, s.ty0, s.tx1, s.ty1, 0, false)
    const x0 = s.tx0 * TILE
    const y0 = s.ty0 * TILE
    const x1 = (s.tx1 + 1) * TILE
    const y1 = (s.ty1 + 1) * TILE
    for (let i = this.room.entities.length - 1; i >= 0; i--) {
      const e = this.room.entities[i] as EntitySpawn
      if (e.x >= x0 && e.x < x1 && e.y >= y0 && e.y < y1) this.removeEntity(i)
    }
    this.endGesture()
  }

  markSaved(): void {
    this.dirty = false
    this.emit()
  }

  static entityCategories(): Record<string, string[]> {
    const out: Record<string, string[]> = {}
    for (const [id, def] of Object.entries(ENTITY_DEFS)) {
      const list = out[def.category] ?? (out[def.category] = [])
      list.push(id)
    }
    return out
  }
}
