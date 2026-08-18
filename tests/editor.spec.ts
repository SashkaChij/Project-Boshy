import { describe, expect, it } from 'vitest'
import { EditorState } from '../src/editor/state.js'
import { emptyLevel, getTile } from '../src/core/level.js'
import { ROOM_W, TILE } from '../src/core/constants.js'

/**
 * EditorState is deliberately DOM-free so the part of the editor most likely
 * to have subtle bugs -- the undo stack -- can be tested without a browser.
 */
const fresh = (): EditorState => new EditorState(emptyLevel('e1', 'Edit test'))

describe('editor undo', () => {
  it('collapses one drag into exactly one undo entry', () => {
    const s = fresh()
    s.beginGesture()
    for (let tx = 0; tx < 10; tx++) s.paint(tx, 5, 1)
    s.endGesture()

    expect(getTile(s.room, 'main', 4, 5)).toBe(1)
    s.undo()
    // All ten tiles must come back at once. Undoing a drag one tile at a time
    // is the single most common defect in hand-rolled editors.
    for (let tx = 0; tx < 10; tx++) expect(getTile(s.room, 'main', tx, 5)).toBe(0)
    expect(s.canUndo).toBe(false)
  })

  it('redoes what it undid', () => {
    const s = fresh()
    s.beginGesture()
    s.paint(1, 1, 3)
    s.paint(2, 1, 3)
    s.endGesture()
    s.undo()
    s.redo()
    expect(getTile(s.room, 'main', 1, 1)).toBe(3)
    expect(getTile(s.room, 'main', 2, 1)).toBe(3)
  })

  it('clears the redo stack once a new edit lands', () => {
    const s = fresh()
    s.beginGesture(); s.paint(1, 1, 1); s.endGesture()
    s.undo()
    expect(s.canRedo).toBe(true)
    s.beginGesture(); s.paint(2, 2, 2); s.endGesture()
    expect(s.canRedo).toBe(false)
  })

  it('undoes a flood fill as one action', () => {
    const s = fresh()
    s.fill(0, 0, 4)
    expect(getTile(s.room, 'main', 10, 10)).toBe(4)
    s.undo()
    expect(getTile(s.room, 'main', 10, 10)).toBe(0)
  })

  it('undoes entity placement, movement and deletion', () => {
    const s = fresh()
    s.brushEntity = 'save'
    s.addEntity(100, 100)
    expect(s.room.entities.length).toBe(1)

    const before = structuredClone(s.room.entities[0]!)
    s.moveEntity(0, 200, 200, before)
    expect(s.room.entities[0]!.x).toBe(208)

    s.undo()
    expect(s.room.entities[0]!.x).toBe(96)
    s.undo()
    expect(s.room.entities.length).toBe(0)
  })

  it('snaps a placed entity to its declared grid', () => {
    const s = fresh()
    s.brushEntity = 'fallblock' // snap 32
    s.addEntity(100, 100)
    expect(s.room.entities[0]!.x % 32).toBe(0)
    s.brushEntity = 'cherry' // snap 8
    s.addEntity(101, 101)
    expect(s.room.entities[1]!.x % 8).toBe(0)
  })

  it('carries entity properties when picking one up as a brush', () => {
    const s = fresh()
    s.brushEntity = 'turret'
    s.brushEntityProps = { rate: 12 }
    s.addEntity(TILE * 3, TILE * 3)
    s.brushEntity = null
    s.brushEntityProps = {}
    s.pick(3, 3)
    expect(s.brushEntity).toBe('turret')
    expect(s.brushEntityProps).toEqual({ rate: 12 })
  })

  it('copies and pastes a block of tiles with its entities', () => {
    const s = fresh()
    s.beginGesture()
    s.paintRect(0, 0, 2, 2, 5, false)
    s.endGesture()
    s.brushEntity = 'save'
    s.addEntity(16, 16)
    s.selection = { tx0: 0, ty0: 0, tx1: 2, ty1: 2 }
    s.copySelection()
    s.paste(10, 10)
    expect(getTile(s.room, 'main', 11, 11)).toBe(5)
    expect(s.room.entities.length).toBe(2)
    expect(s.room.entities[1]!.x).toBe(16 + 10 * TILE)
  })

  it('adds and removes rooms reversibly', () => {
    const s = fresh()
    expect(s.addRoom(1, 0)).toBe(true)
    expect(s.level.rooms.length).toBe(2)
    expect(s.addRoom(1, 0)).toBe(false) // occupied
    s.removeRoom(1)
    expect(s.level.rooms.length).toBe(1)
    s.undo()
    expect(s.level.rooms.length).toBe(2)
  })

  it('keeps the room index in range after a structural undo', () => {
    const s = fresh()
    s.addRoom(1, 0)
    s.roomIndex = 1
    s.removeRoom(1)
    expect(s.roomIndex).toBeLessThan(s.level.rooms.length)
  })
})

describe('editor painting', () => {
  it('paints a rectangle outline without filling it', () => {
    const s = fresh()
    s.paintRect(2, 2, 6, 6, 1, true)
    expect(getTile(s.room, 'main', 2, 2)).toBe(1)
    expect(getTile(s.room, 'main', 4, 2)).toBe(1)
    expect(getTile(s.room, 'main', 4, 4)).toBe(0)
  })

  it('paints on the selected layer only', () => {
    const s = fresh()
    s.layer = 'bg'
    s.paint(3, 3, 7)
    expect(getTile(s.room, 'bg', 3, 3)).toBe(7)
    expect(getTile(s.room, 'main', 3, 3)).toBe(0)
  })

  it('ignores paints outside the room', () => {
    const s = fresh()
    s.paint(-1, 5, 1)
    s.paint(ROOM_W + 4, 5, 1)
    expect(s.canUndo).toBe(false)
  })
})
