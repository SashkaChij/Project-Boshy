import { MAX_ROOMS, ROOM_H, ROOM_W, TILE, VIEW_H, VIEW_W } from '../core/constants.js'
import { emptyLevel, parseLevel, serializeLevelPretty, validateLevel } from '../core/level.js'
import { ENTITY_DEFS, entityDef, prop, type FieldDef } from '../core/registry/entityDefs.js'
import { TILE_COUNT, material } from '../core/registry/tileMaterials.js'
import { loadRoom } from '../core/sim/world.js'
import { createWorld } from '../core/sim/world.js'
import { step } from '../core/sim/step.js'
import { IN_JUMP, IN_LEFT, IN_RIGHT, type EntitySpawn, type LevelData } from '../core/types.js'
import { t } from '../i18n/index.js'
import { buildAtlas } from '../platform/atlas.js'
import { playSfx } from '../platform/audio/index.js'
import {
  URL_CODE_LIMIT, URL_CODE_WARN, copyToClipboard, decodeLevelCode, downloadLevel,
  encodeLevelCode, shareUrl,
} from '../platform/share.js'
import { newLevelId, listLevels, putLevel } from '../platform/storage.js'
import { EditorState, type LayerName, type ToolId } from './state.js'
import { EDITOR_CSS } from './styles.js'

export interface EditorOptions {
  root: HTMLElement
  onExit: () => void
  onPlaytest: (level: LevelData) => void
}

export interface EditorApi {
  open: (level?: LevelData) => void
  close: () => void
}

const TOOLS: { id: ToolId; icon: string; key: string }[] = [
  { id: 'pencil', icon: '✎', key: 'KeyB' },
  { id: 'rect', icon: '▭', key: 'KeyR' },
  { id: 'fill', icon: '▨', key: 'KeyG' },
  { id: 'eraser', icon: '⌫', key: 'KeyE' },
  { id: 'picker', icon: '⊙', key: 'KeyI' },
  { id: 'select', icon: '⬚', key: 'KeyM' },
  { id: 'entity', icon: '★', key: 'KeyN' },
]

const LAYERS: LayerName[] = ['bg', 'main', 'fg']
const CATEGORY_ORDER = ['system', 'hazard', 'block', 'help', 'boss'] as const

export function createEditor(opts: EditorOptions): EditorApi {
  const { root } = opts
  const atlas = buildAtlas()
  let state = new EditorState(emptyLevel(newLevelId(), t('editor.untitled')))
  let unsubscribe: (() => void) | null = null
  let mapMode = false

  // -------------------------------------------------------------------- DOM --
  root.innerHTML = ''
  const style = document.createElement('style')
  style.textContent = EDITOR_CSS
  root.appendChild(style)

  const shell = el('div', 'fx-shell')
  const topbar = el('div', 'fx-topbar')
  const body = el('div', 'fx-body')
  const leftbar = el('div', 'fx-tools')
  const canvasWrap = el('div', 'fx-canvas-wrap')
  const sidebar = el('div', 'fx-side')
  const statusbar = el('div', 'fx-status')
  const canvas = document.createElement('canvas')
  canvas.className = 'fx-canvas'
  canvasWrap.appendChild(canvas)
  body.append(leftbar, canvasWrap, sidebar)
  shell.append(topbar, body, statusbar)
  root.appendChild(shell)

  const canvasCtx = canvas.getContext('2d')
  if (!canvasCtx) throw new Error('Canvas2D unavailable')
  // Bound to a non-nullable local: TypeScript drops the null narrowing the
  // moment this is captured by the draw closures below.
  const ctx: CanvasRenderingContext2D = canvasCtx

  const titleInput = document.createElement('input')
  titleInput.className = 'fx-title'
  titleInput.spellcheck = false

  const paletteHost = el('div', 'fx-palette')
  const propsHost = el('div', 'fx-props')
  sidebar.append(sectionLabel('editor.palette'), paletteHost, sectionLabel('editor.properties'), propsHost)

  // --------------------------------------------------------------- top bar --
  const btnBack = button('←', 'menu.back', () => {
    if (state.dirty && !confirm(t('editor.unsaved'))) return
    void save().then(() => opts.onExit())
  })
  const btnSave = button('💾', 'editor.save', () => void save(true))
  const btnTest = button('▶', 'editor.playtest', () => playtest())
  const btnMap = button('▦', 'editor.worldmap', () => { mapMode = !mapMode; draw(); syncUi() })
  const btnUndo = button('↶', 'editor.undo', () => { state.undo(); draw() })
  const btnRedo = button('↷', 'editor.redo', () => { state.redo(); draw() })
  const btnCode = button('⧉', 'editor.copyCode', () => void copyCode())
  const btnPaste = button('⇥', 'editor.pasteCode', () => void pasteCode())
  const btnExport = button('⭳', 'editor.export', () => exportFile())
  const btnImport = button('⭱', 'editor.import', () => importFile())
  const btnCheck = button('✓', 'editor.validate', () => runValidate())
  const btnOpen = button('📂', 'editor.open', () => void openPicker())
  const btnNew = button('✚', 'editor.new', () => void newLevel())

  topbar.append(btnBack, titleInput, btnNew, btnOpen, btnSave, btnTest, btnMap,
    btnUndo, btnRedo, btnCheck, btnCode, btnPaste, btnExport, btnImport)

  // -------------------------------------------------------------- left bar --
  for (const tool of TOOLS) {
    const b = button(tool.icon, `editor.tool.${tool.id}`, () => {
      state.tool = tool.id
      syncUi()
    })
    b.dataset['tool'] = tool.id
    leftbar.appendChild(b)
  }
  leftbar.appendChild(el('div', 'fx-sep'))
  for (const layer of LAYERS) {
    const b = button(layer === 'bg' ? '▁' : layer === 'main' ? '■' : '▔', `editor.layer.${layer}`, () => {
      state.layer = layer
      syncUi()
      draw()
    })
    b.dataset['layer'] = layer
    leftbar.appendChild(b)
  }
  leftbar.appendChild(el('div', 'fx-sep'))
  const btnGrid = button('#', 'editor.grid', () => { state.showGrid = !state.showGrid; draw(); syncUi() })
  const btnColl = button('◫', 'editor.collision', () => { state.showCollision = !state.showCollision; draw(); syncUi() })
  const btnArc = button('⤴', 'editor.jumpArc', () => { state.showJumpArc = !state.showJumpArc; draw(); syncUi() })
  const btnCross = button('✛', 'editor.crosshair', () => { state.crosshair = !state.crosshair; draw(); syncUi() })
  leftbar.append(btnGrid, btnColl, btnArc, btnCross)

  // ------------------------------------------------------------ status bar --
  const statusText = el('span', 'fx-status-text')
  const roomText = el('span', 'fx-status-room')
  const btnAddRoom = button('＋', 'editor.addRoom', () => addRoomNextTo())
  const btnDelRoom = button('－', 'editor.deleteRoom', () => {
    if (state.level.rooms.length <= 1) return
    state.removeRoom(state.roomIndex)
    draw(); syncUi()
  })
  statusbar.append(statusText, roomText, btnAddRoom, btnDelRoom)

  // ------------------------------------------------------------- helpers ----
  function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] {
    const n = document.createElement(tag)
    n.className = cls
    return n
  }

  function sectionLabel(key: string): HTMLElement {
    const n = el('div', 'fx-section')
    n.dataset['i18n'] = key
    n.textContent = t(key)
    return n
  }

  function button(icon: string, key: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button')
    b.className = 'fx-btn'
    b.type = 'button'
    b.innerHTML = `<span class="fx-ico">${icon}</span><span class="fx-lbl"></span>`
    b.dataset['i18n'] = key
    b.addEventListener('click', (e) => { e.preventDefault(); onClick() })
    return b
  }

  function relabel(): void {
    for (const node of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
      const key = node.dataset['i18n'] as string
      const lbl = node.querySelector<HTMLElement>('.fx-lbl')
      if (lbl) { lbl.textContent = t(key); node.title = t(key) }
      else node.textContent = t(key)
    }
  }

  // --------------------------------------------------------------- palette --
  function buildPalette(): void {
    paletteHost.innerHTML = ''
    if (state.tool === 'entity') {
      for (const cat of CATEGORY_ORDER) {
        const ids = Object.entries(ENTITY_DEFS).filter(([, d]) => d.category === cat).map(([id]) => id)
        if (!ids.length) continue
        const head = el('div', 'fx-cat')
        head.textContent = t(`cat.${cat}`)
        paletteHost.appendChild(head)
        const grid = el('div', 'fx-grid')
        for (const id of ids) {
          const cell = el('button', 'fx-cell')
          cell.title = t(`ent.${id}`)
          cell.appendChild(entityThumb(id))
          const cap = el('span', 'fx-cap')
          cap.textContent = t(`ent.${id}`)
          cell.appendChild(cap)
          cell.addEventListener('click', () => {
            state.brushEntity = id
            state.brushEntityProps = {}
            state.brushEntityDir = 0
            syncUi()
          })
          if (state.brushEntity === id) cell.classList.add('on')
          grid.appendChild(cell)
        }
        paletteHost.appendChild(grid)
      }
      return
    }

    const grid = el('div', 'fx-grid')
    for (let id = 0; id < TILE_COUNT; id++) {
      const cell = el('button', 'fx-cell')
      cell.title = tileName(id)
      cell.appendChild(tileThumb(id))
      cell.addEventListener('click', () => { state.brushTile = id; syncUi() })
      if (state.brushTile === id) cell.classList.add('on')
      grid.appendChild(cell)
    }
    paletteHost.appendChild(grid)
  }

  function tileName(id: number): string {
    if (id === 0) return t('tile.empty')
    const m = material(id)
    if (m.hazard) return t('tile.spike')
    if (m.oneway) return t('tile.platform')
    if (m.climb) return t('tile.vine')
    if (m.water) return t('tile.water')
    if (m.slip) return t('tile.ice')
    if (m.conveyor) return t('tile.conveyor')
    if (m.solid) return t('tile.solid')
    return t('tile.deco')
  }

  function tileThumb(id: number): HTMLCanvasElement {
    const c = document.createElement('canvas')
    c.width = c.height = TILE
    c.className = 'fx-thumb'
    const cc = c.getContext('2d')
    if (cc) {
      cc.imageSmoothingEnabled = false
      if (id === 0) {
        cc.fillStyle = '#20202c'
        cc.fillRect(0, 0, TILE, TILE)
        cc.strokeStyle = '#3a3a4a'
        cc.beginPath(); cc.moveTo(4, 4); cc.lineTo(TILE - 4, TILE - 4); cc.stroke()
      } else atlas.drawTile(cc, id, 0, 0)
    }
    return c
  }

  function entityThumb(id: string): HTMLCanvasElement {
    const c = document.createElement('canvas')
    c.width = c.height = 32
    c.className = 'fx-thumb'
    const cc = c.getContext('2d')
    const def = entityDef(id)
    if (cc && def) {
      cc.imageSmoothingEnabled = false
      cc.save()
      const s = Math.min(1, 32 / Math.max(def.w, def.h))
      cc.translate(16, 16)
      cc.scale(s, s)
      cc.translate(-16, -16)
      drawEntitySprite(cc, id, 16, 16, 0, 1)
      cc.restore()
    }
    return c
  }

  // ------------------------------------------------------------ properties --
  function buildProps(): void {
    propsHost.innerHTML = ''
    const idx = state.selectedEntity
    const usingBrush = idx === null && state.tool === 'entity' && state.brushEntity

    const type = idx !== null ? state.room.entities[idx]?.t : state.brushEntity
    if (!type) {
      const p = el('div', 'fx-empty')
      p.textContent = t('editor.noSelection')
      propsHost.appendChild(p)
      return
    }
    const def = entityDef(type)
    if (!def) return

    const head = el('div', 'fx-cat')
    head.textContent = t(`ent.${type}`)
    propsHost.appendChild(head)

    const readValue = (key: string): number => {
      if (idx !== null) return state.entityProp(idx, key)
      if (key === 'd') return state.brushEntityDir
      return prop(def, state.brushEntityProps, key)
    }
    const writeValue = (key: string, value: number): void => {
      if (idx !== null) state.setEntityProp(idx, key, value)
      else if (key === 'd') state.brushEntityDir = value
      else state.brushEntityProps[key] = value
      draw()
    }

    if (def.dirs && def.dirs.length > 1) {
      propsHost.appendChild(
        enumRow(t('prop.direction'), def.dirs.map((d) => ({
          value: d,
          label: t(['dir.right', 'dir.down', 'dir.left', 'dir.up'][((d % 4) + 4) % 4] as string),
        })), readValue('d'), (v) => writeValue('d', v)),
      )
    }
    for (const f of def.fields) {
      propsHost.appendChild(fieldRow(f, readValue(f.key), (v) => writeValue(f.key, v)))
    }
    if (usingBrush) {
      const note = el('div', 'fx-note')
      note.textContent = t('editor.tool.entity')
      propsHost.appendChild(note)
    }
    if (idx !== null) {
      const del = document.createElement('button')
      del.className = 'fx-btn fx-danger'
      del.textContent = t('editor.delete')
      del.addEventListener('click', () => {
        state.removeEntity(idx)
        syncUi(); draw()
      })
      propsHost.appendChild(del)
    }
  }

  function fieldRow(f: FieldDef, value: number, onChange: (v: number) => void): HTMLElement {
    const row = el('label', 'fx-row')
    const name = el('span', 'fx-row-name')
    name.textContent = t(`prop.${f.key}`)
    row.appendChild(name)

    if (f.type === 'bool') {
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = value !== 0
      cb.addEventListener('change', () => onChange(cb.checked ? 1 : 0))
      row.appendChild(cb)
      return row
    }
    if (f.type === 'enum' && f.values) {
      return enumRow(t(`prop.${f.key}`), f.values.map((v) => ({ value: v, label: String(v) })), value, onChange)
    }
    const input = document.createElement('input')
    input.type = 'number'
    input.className = 'fx-num'
    input.value = String(value)
    if (f.min !== undefined) input.min = String(f.min)
    if (f.max !== undefined) input.max = String(f.max)
    input.step = String(f.step ?? (f.type === 'int' ? 1 : 0.5))
    input.addEventListener('change', () => {
      let v = Number(input.value)
      if (!Number.isFinite(v)) v = f.def
      if (f.min !== undefined) v = Math.max(f.min, v)
      if (f.max !== undefined) v = Math.min(f.max, v)
      if (f.type === 'int') v = Math.round(v)
      input.value = String(v)
      onChange(v)
    })
    row.appendChild(input)
    return row
  }

  function enumRow(
    label: string,
    options: { value: number; label: string }[],
    value: number,
    onChange: (v: number) => void,
  ): HTMLElement {
    const row = el('label', 'fx-row')
    const name = el('span', 'fx-row-name')
    name.textContent = label
    const sel = document.createElement('select')
    sel.className = 'fx-sel'
    for (const o of options) {
      const opt = document.createElement('option')
      opt.value = String(o.value)
      opt.textContent = o.label
      sel.appendChild(opt)
    }
    sel.value = String(value)
    sel.addEventListener('change', () => onChange(Number(sel.value)))
    row.append(name, sel)
    return row
  }

  // ------------------------------------------------------------- rendering --
  function fitCamera(): void {
    const rect = canvasWrap.getBoundingClientRect()
    const zoom = Math.max(0.25, Math.min(4, Math.min(rect.width / VIEW_W, rect.height / VIEW_H)))
    state.camera.zoom = zoom >= 1 ? Math.floor(zoom) : zoom
    state.camera.x = (rect.width - VIEW_W * state.camera.zoom) / 2
    state.camera.y = (rect.height - VIEW_H * state.camera.zoom) / 2
  }

  function resizeCanvas(): void {
    const rect = canvasWrap.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.max(1, Math.round(rect.width * dpr))
    canvas.height = Math.max(1, Math.round(rect.height * dpr))
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false
  }

  function drawEntitySprite(
    c: CanvasRenderingContext2D,
    type: string,
    x: number,
    y: number,
    d: number,
    look = 1,
  ): void {
    const SPRITE: Record<string, string> = {
      spawn: 'foxIdle0', save: 'save', goal: 'goal', warp: 'warp', sign: 'sign',
      cherry: 'cherry', cherrySine: 'cherry', cherryHome: 'cherry', cherryBounce: 'cherry',
      minispike: 'minispike', turret: 'turret', fan: 'fan', laser: 'laserEmitter',
      fallblock: 'fallblock', riseblock: 'riseblock', fakeblock: 'fakeblock',
      invisblock: 'invisblock', breakblock: 'breakblock', platform: 'platformEnt',
      crusher: 'crusher', refresher: 'refresher', spring: 'spring', gravflip: 'gravflip',
      boss: 'boss0',
    }
    if (type === 'fakeblock' || type === 'invisblock') {
      // Same reasoning as the game renderer: draw the tile it imitates, so the
      // editor shows the author exactly what the player will see.
      atlas.drawTile(c, Math.max(1, Math.min(6, look)), Math.round(x - 16), Math.round(y - 16))
      if (type === 'invisblock') {
        c.strokeStyle = '#7fd7ff'
        c.setLineDash([4, 3])
        c.strokeRect(x - 16, y - 16, 32, 32)
        c.setLineDash([])
      }
      return
    }
    const key = SPRITE[type]
    if (!key || !atlas.has(key)) {
      const def = entityDef(type)
      c.fillStyle = '#ff00ff'
      c.fillRect(x - (def?.w ?? 32) / 2, y - (def?.h ?? 32) / 2, def?.w ?? 32, def?.h ?? 32)
      return
    }
    if (d) {
      c.save()
      c.translate(x, y)
      c.rotate((d * Math.PI) / 2)
      c.translate(-x, -y)
      atlas.draw(c, key, x, y)
      c.restore()
      return
    }
    atlas.draw(c, key, x, y)
  }

  function draw(): void {
    resizeCanvas()
    const rect = canvasWrap.getBoundingClientRect()
    ctx.fillStyle = '#0b0b12'
    ctx.fillRect(0, 0, rect.width, rect.height)
    if (mapMode) { drawRoomMap(rect.width, rect.height); return }

    const { x: ox, y: oy, zoom } = state.camera
    ctx.save()
    ctx.translate(ox, oy)
    ctx.scale(zoom, zoom)

    const room = state.room
    ctx.fillStyle = room.bg.color
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)

    for (const layer of LAYERS) {
      const dim = layer !== state.layer
      ctx.globalAlpha = dim ? 0.35 : 1
      for (let ty = 0; ty < ROOM_H; ty++) {
        for (let tx = 0; tx < ROOM_W; tx++) {
          atlas.drawTile(ctx, room.layers[layer][ty * ROOM_W + tx] ?? 0, tx * TILE, ty * TILE)
        }
      }
      if (layer === 'main') drawEntities()
    }
    ctx.globalAlpha = 1

    if (state.showCollision) drawCollisionOverlay()
    if (state.showGrid) drawGrid()
    if (state.showJumpArc) drawJumpArc()
    drawSelection()
    drawGhost()

    ctx.restore()
  }

  function drawEntities(): void {
    const room = state.room
    room.entities.forEach((e, i) => {
      drawEntitySprite(ctx, e.t, e.x, e.y, e.d ?? 0, prop(entityDef(e.t), e.p ?? {}, 'look'))
      if (i === state.selectedEntity) {
        const def = entityDef(e.t)
        ctx.strokeStyle = '#ffcf4a'
        ctx.lineWidth = 2 / state.camera.zoom
        ctx.strokeRect(e.x - (def?.w ?? 32) / 2, e.y - (def?.h ?? 32) / 2, def?.w ?? 32, def?.h ?? 32)
        ctx.lineWidth = 1
      }
    })
  }

  function drawGrid(): void {
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'
    ctx.lineWidth = 1 / state.camera.zoom
    ctx.beginPath()
    for (let tx = 0; tx <= ROOM_W; tx++) { ctx.moveTo(tx * TILE, 0); ctx.lineTo(tx * TILE, VIEW_H) }
    for (let ty = 0; ty <= ROOM_H; ty++) { ctx.moveTo(0, ty * TILE); ctx.lineTo(VIEW_W, ty * TILE) }
    ctx.stroke()
    ctx.lineWidth = 1
  }

  function drawCollisionOverlay(): void {
    const room = state.room
    for (let ty = 0; ty < ROOM_H; ty++) {
      for (let tx = 0; tx < ROOM_W; tx++) {
        const m = material(room.layers.main[ty * ROOM_W + tx] ?? 0)
        if (m.solid) ctx.fillStyle = 'rgba(80,160,255,0.30)'
        else if (m.hazard) ctx.fillStyle = 'rgba(255,60,60,0.35)'
        else if (m.oneway) ctx.fillStyle = 'rgba(120,255,140,0.28)'
        else if (m.water) ctx.fillStyle = 'rgba(60,120,255,0.22)'
        else continue
        ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE)
      }
    }
  }

  /**
   * Jump-arc overlay.
   *
   * The arc is produced by running the REAL step() with synthetic input, not by
   * an approximating formula. That is the whole point: an author can see
   * whether a gap is clearable without launching a playtest, and the preview
   * physically cannot disagree with the game.
   */
  function drawJumpArc(): void {
    const start = hover.tx >= 0 ? { x: hover.tx * TILE + TILE / 2, y: hover.ty * TILE + TILE / 2 } : null
    if (!start) return
    for (const dir of [IN_RIGHT, IN_LEFT] as const) {
      ctx.strokeStyle = dir === IN_RIGHT ? 'rgba(255,207,74,0.85)' : 'rgba(110,200,255,0.7)'
      ctx.lineWidth = 2 / state.camera.zoom
      for (const doubleJump of [false, true]) {
        const path = simulateArc(start.x, start.y, dir, doubleJump)
        if (path.length < 2) continue
        ctx.setLineDash(doubleJump ? [] : [6 / state.camera.zoom, 4 / state.camera.zoom])
        ctx.beginPath()
        ctx.moveTo(path[0]!.x, path[0]!.y)
        for (const p of path) ctx.lineTo(p.x, p.y)
        ctx.stroke()
      }
    }
    ctx.setLineDash([])
    ctx.lineWidth = 1
  }

  function simulateArc(x: number, y: number, dirBit: number, doubleJump: boolean): { x: number; y: number }[] {
    const w = createWorld(state.level, { difficulty: 0 })
    loadRoom(w, state.roomIndex)
    // Strip entities: this is a geometry preview, not a playtest, and a cherry
    // killing the ghost mid-arc would be actively misleading.
    w.entities = []
    w.player.x = x
    w.player.y = y
    w.player.vspeed = 0
    w.player.jumps = 1
    const out: { x: number; y: number }[] = []
    const apex = 21
    for (let i = 0; i < 90; i++) {
      const pressJump = i === 0 || (doubleJump && i === apex)
      step(w, {
        held: dirBit | IN_JUMP,
        pressed: pressJump ? IN_JUMP : 0,
        released: 0,
      })
      if (w.player.dead) break
      out.push({ x: w.player.x, y: w.player.y })
      if (w.player.onGround && i > 4) break
    }
    return out
  }

  function drawSelection(): void {
    const s = state.selection
    if (!s) return
    ctx.strokeStyle = '#ffcf4a'
    ctx.setLineDash([5 / state.camera.zoom, 4 / state.camera.zoom])
    ctx.lineWidth = 2 / state.camera.zoom
    ctx.strokeRect(s.tx0 * TILE, s.ty0 * TILE, (s.tx1 - s.tx0 + 1) * TILE, (s.ty1 - s.ty0 + 1) * TILE)
    ctx.setLineDash([])
    ctx.lineWidth = 1
  }

  /**
   * A live ghost of what is about to be placed, drawn ABOVE the pointer on
   * touch. On a phone the finger covers the target cell entirely, so without
   * an offset preview you are placing tiles blind.
   */
  function drawGhost(): void {
    if (hover.tx < 0) return
    if (state.tool === 'entity' && state.brushEntity) {
      ctx.globalAlpha = 0.55
      drawEntitySprite(
        ctx, state.brushEntity, hover.px, hover.py, state.brushEntityDir,
        prop(entityDef(state.brushEntity), state.brushEntityProps, 'look'),
      )
      ctx.globalAlpha = 1
      return
    }
    if (state.tool === 'pencil' || state.tool === 'rect' || state.tool === 'fill') {
      ctx.globalAlpha = 0.55
      atlas.drawTile(ctx, state.brushTile, hover.tx * TILE, hover.ty * TILE)
      ctx.globalAlpha = 1
    }
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1 / state.camera.zoom
    ctx.strokeRect(hover.tx * TILE, hover.ty * TILE, TILE, TILE)
    ctx.lineWidth = 1
  }

  function drawRoomMap(width: number, height: number): void {
    const rooms = state.level.rooms
    let minX = 0, minY = 0, maxX = 0, maxY = 0
    rooms.forEach((r, i) => {
      if (i === 0) { minX = maxX = r.x; minY = maxY = r.y; return }
      minX = Math.min(minX, r.x); maxX = Math.max(maxX, r.x)
      minY = Math.min(minY, r.y); maxY = Math.max(maxY, r.y)
    })
    const cols = maxX - minX + 1
    const rows = maxY - minY + 1
    const cell = Math.max(40, Math.min((width - 40) / cols, (height - 40) / rows))
    const ox = (width - cols * cell) / 2
    const oy = (height - rows * cell) / 2
    mapCells = []

    rooms.forEach((r, i) => {
      const x = ox + (r.x - minX) * cell
      const y = oy + (r.y - minY) * cell
      mapCells.push({ i, x, y, w: cell, h: cell })
      ctx.fillStyle = i === state.roomIndex ? '#2a2a3c' : '#16161f'
      ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4)
      // Thumbnail: solid tiles only, enough to recognise a room's shape.
      const sx = (cell - 8) / ROOM_W
      const sy = (cell - 8) / ROOM_H
      ctx.fillStyle = '#5b6b86'
      for (let ty = 0; ty < ROOM_H; ty++) {
        for (let tx = 0; tx < ROOM_W; tx++) {
          const m = material(r.layers.main[ty * ROOM_W + tx] ?? 0)
          if (!m.solid && !m.hazard) continue
          ctx.fillStyle = m.hazard ? '#c04040' : '#5b6b86'
          ctx.fillRect(x + 4 + tx * sx, y + 4 + ty * sy, Math.max(1, sx), Math.max(1, sy))
        }
      }
      ctx.strokeStyle = i === state.level.start.room ? '#ffcf4a' : '#3a3a4a'
      ctx.lineWidth = i === state.roomIndex ? 3 : 1
      ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4)
      ctx.lineWidth = 1
      ctx.fillStyle = '#8d8d9e'
      ctx.font = '12px system-ui, sans-serif'
      ctx.fillText(`${i}`, x + 8, y + 18)
    })
  }

  let mapCells: { i: number; x: number; y: number; w: number; h: number }[] = []

  // ----------------------------------------------------------------- input --
  const hover = { tx: -1, ty: -1, px: 0, py: 0 }
  const pointers = new Map<number, { x: number; y: number }>()
  let dragMode: 'none' | 'paint' | 'rect' | 'select' | 'entity' | 'pan' | 'pinch' = 'none'
  let dragStart = { tx: 0, ty: 0 }
  let dragEntity: { index: number; from: EntitySpawn } | null = null
  let pinchStart = 0
  let pinchZoom = 1
  let longPressTimer = 0

  function toRoom(clientX: number, clientY: number): { px: number; py: number; tx: number; ty: number } {
    const rect = canvas.getBoundingClientRect()
    const zoom = state.camera.zoom
    const px = (clientX - rect.left - state.camera.x) / zoom
    let py = (clientY - rect.top - state.camera.y) / zoom
    // Touch: shift the effective point above the fingertip so the target cell
    // is visible while you place it.
    if (touchActive && !state.crosshair) py -= 24 / zoom
    return { px, py, tx: Math.floor(px / TILE), ty: Math.floor(py / TILE) }
  }

  let touchActive = false

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId)
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (e.pointerType === 'touch') touchActive = true

    if (pointers.size === 2) {
      dragMode = 'pinch'
      const [a, b] = [...pointers.values()]
      pinchStart = Math.hypot((a!.x - b!.x), (a!.y - b!.y))
      pinchZoom = state.camera.zoom
      return
    }
    if (e.button === 1 || e.shiftKey) { dragMode = 'pan'; return }

    if (mapMode) {
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const hit = mapCells.find((c) => mx >= c.x && mx < c.x + c.w && my >= c.y && my < c.y + c.h)
      if (hit) { state.roomIndex = hit.i; mapMode = false; fitCamera(); draw(); syncUi() }
      return
    }

    const p = toRoom(e.clientX, e.clientY)
    hover.tx = p.tx; hover.ty = p.ty; hover.px = p.px; hover.py = p.py

    // Long press opens properties on touch, mirroring right-click on desktop.
    if (e.pointerType === 'touch') {
      window.clearTimeout(longPressTimer)
      longPressTimer = window.setTimeout(() => {
        const idx = state.entityAt(p.px, p.py)
        if (idx !== null) { state.selectedEntity = idx; state.tool = 'entity'; syncUi(); draw() }
        else { state.pick(p.tx, p.ty); syncUi(); draw() }
        dragMode = 'none'
      }, 450)
    }

    state.beginGesture()
    switch (state.tool) {
      case 'pencil': dragMode = 'paint'; state.paint(p.tx, p.ty, state.brushTile); break
      case 'eraser': dragMode = 'paint'; state.paint(p.tx, p.ty, 0); break
      case 'fill': state.fill(p.tx, p.ty, state.brushTile); state.endGesture(); break
      case 'picker': state.pick(p.tx, p.ty); state.endGesture(); break
      case 'rect': dragMode = 'rect'; dragStart = { tx: p.tx, ty: p.ty }; break
      case 'select': dragMode = 'select'; dragStart = { tx: p.tx, ty: p.ty }; break
      case 'entity': {
        const idx = state.entityAt(p.px, p.py)
        if (idx !== null) {
          state.selectedEntity = idx
          const from = structuredClone(state.room.entities[idx] as EntitySpawn)
          dragEntity = { index: idx, from }
          dragMode = 'entity'
        } else if (state.addEntity(p.px, p.py)) {
          playSfx('select')
        }
        break
      }
    }
    syncUi()
    draw()
  })

  canvas.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const p = toRoom(e.clientX, e.clientY)
    const moved = p.tx !== hover.tx || p.ty !== hover.ty
    hover.tx = p.tx; hover.ty = p.ty; hover.px = p.px; hover.py = p.py
    if (moved) window.clearTimeout(longPressTimer)

    if (dragMode === 'pinch' && pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y)
      const z = Math.max(0.25, Math.min(4, (pinchZoom * d) / (pinchStart || 1)))
      state.camera.zoom = z >= 1 ? Math.round(z) : z
      draw()
      return
    }
    if (dragMode === 'pan') {
      state.camera.x += e.movementX
      state.camera.y += e.movementY
      draw()
      return
    }
    if (dragMode === 'paint' && moved) {
      state.paint(p.tx, p.ty, state.tool === 'eraser' ? 0 : state.brushTile)
    } else if (dragMode === 'entity' && dragEntity) {
      const e2 = state.room.entities[dragEntity.index]
      if (e2) {
        const def = entityDef(e2.t)
        const snap = def?.snap || 1
        e2.x = Math.round(p.px / snap) * snap
        e2.y = Math.round(p.py / snap) * snap
      }
    } else if (dragMode === 'select' || dragMode === 'rect') {
      state.selection = {
        tx0: Math.max(0, Math.min(dragStart.tx, p.tx)),
        ty0: Math.max(0, Math.min(dragStart.ty, p.ty)),
        tx1: Math.min(ROOM_W - 1, Math.max(dragStart.tx, p.tx)),
        ty1: Math.min(ROOM_H - 1, Math.max(dragStart.ty, p.ty)),
      }
    }
    draw()
  })

  const endPointer = (e: PointerEvent): void => {
    window.clearTimeout(longPressTimer)
    pointers.delete(e.pointerId)
    const p = toRoom(e.clientX, e.clientY)

    if (dragMode === 'rect' && state.selection) {
      const s = state.selection
      state.paintRect(s.tx0, s.ty0, s.tx1, s.ty1, state.brushTile, false)
      state.selection = null
    }
    if (dragMode === 'entity' && dragEntity) {
      state.moveEntity(dragEntity.index, p.px, p.py, dragEntity.from)
      dragEntity = null
    }
    state.endGesture()
    dragMode = pointers.size > 0 ? dragMode : 'none'
    syncUi()
    draw()
  }
  canvas.addEventListener('pointerup', endPointer)
  canvas.addEventListener('pointercancel', endPointer)

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const before = state.camera.zoom
    let z = before * (e.deltaY < 0 ? 1.15 : 1 / 1.15)
    z = Math.max(0.25, Math.min(4, z))
    // Snap to integers at 1x and above: a fractional zoom shimmers pixel art
    // and puts the grid overlay a half-pixel out of true.
    if (z >= 1) z = Math.round(z)
    state.camera.x = mx - ((mx - state.camera.x) * z) / before
    state.camera.y = my - ((my - state.camera.y) * z) / before
    state.camera.zoom = z
    draw()
  }, { passive: false })

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    const p = toRoom(e.clientX, e.clientY)
    const idx = state.entityAt(p.px, p.py)
    if (idx !== null) { state.selectedEntity = idx; state.tool = 'entity' }
    else state.pick(p.tx, p.ty)
    syncUi(); draw()
  })

  function onKey(e: KeyboardEvent): void {
    if (root.style.display === 'none' || !root.classList.contains('active')) return
    const target = e.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return

    const tool = TOOLS.find((t2) => t2.key === e.code)
    if (tool && !e.ctrlKey && !e.metaKey) { state.tool = tool.id; syncUi(); return }

    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
      e.preventDefault()
      if (e.shiftKey) state.redo(); else state.undo()
      draw(); syncUi(); return
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); state.redo(); draw(); return }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') { state.copySelection(); return }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') { state.paste(hover.tx, hover.ty); draw(); return }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); void save(true); return }

    switch (e.code) {
      case 'Delete': case 'Backspace':
        if (state.selectedEntity !== null) state.removeEntity(state.selectedEntity)
        else state.clearSelection()
        draw(); syncUi(); break
      case 'KeyP': e.preventDefault(); playtest(); break
      case 'Tab': e.preventDefault(); mapMode = !mapMode; draw(); syncUi(); break
      case 'Escape': state.selection = null; state.selectedEntity = null; draw(); syncUi(); break
      case 'KeyF': fitCamera(); draw(); break
      default: break
    }
  }
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', () => { draw() })

  // --------------------------------------------------------------- actions --
  function addRoomNextTo(): void {
    const cur = state.room
    const candidates = [[cur.x + 1, cur.y], [cur.x - 1, cur.y], [cur.x, cur.y + 1], [cur.x, cur.y - 1]]
    for (const [gx, gy] of candidates) {
      if (state.addRoom(gx as number, gy as number)) { draw(); syncUi(); return }
    }
    setStatus(t('editor.limitReached', { what: t('editor.roomCount', { n: state.level.rooms.length, max: MAX_ROOMS }) }))
  }

  async function save(explicit = false): Promise<void> {
    state.level.meta.title = titleInput.value || t('editor.untitled')
    try {
      await putLevel(state.level)
      state.markSaved()
      if (explicit) setStatus(t('editor.save'))
    } catch {
      setStatus(t('editor.importFailed'))
    }
  }

  function playtest(): void {
    const { errors } = validateLevel(state.level)
    if (errors.length) { runValidate(); playSfx('error'); return }
    void save()
    // Round-trip through the real serializer even though the object is right
    // here: it costs under a millisecond and it means every playtest exercises
    // the actual load path, so format bugs surface now instead of on someone
    // else's machine.
    const clone = parseLevel(serializeLevelPretty(state.level))
    opts.onPlaytest(clone)
  }

  function runValidate(): void {
    const { errors, warnings } = validateLevel(state.level)
    if (!errors.length && !warnings.length) { setStatus(t('editor.validOk')); return }
    const parts: string[] = []
    if (errors.length) parts.push(`${t('editor.errorCount', { n: errors.length })}: ${errors.map((i) => t(i.key, { detail: i.detail ?? '' })).join(' | ')}`)
    if (warnings.length) parts.push(`${t('editor.warningCount', { n: warnings.length })}`)
    setStatus(parts.join('  —  '))
  }

  async function copyCode(): Promise<void> {
    const code = await encodeLevelCode(state.level)
    if (code.length > URL_CODE_LIMIT) {
      await copyToClipboard(code)
      setStatus(t('editor.codeTooLong'))
      return
    }
    const ok = await copyToClipboard(shareUrl(code))
    setStatus(ok ? `${t('editor.codeCopied')} (${code.length}${code.length > URL_CODE_WARN ? ' ⚠' : ''})` : t('editor.importFailed'))
  }

  async function pasteCode(): Promise<void> {
    const input = prompt(t('editor.codePasteTitle'))
    if (!input) return
    try {
      const level = await decodeLevelCode(input)
      level.id = newLevelId()
      loadLevel(level)
      setStatus(t('editor.open'))
    } catch {
      setStatus(t('editor.importFailed'))
      playSfx('error')
    }
  }

  function exportFile(): void {
    state.level.meta.title = titleInput.value || t('editor.untitled')
    downloadLevel(state.level, serializeLevelPretty(state.level))
  }

  function importFile(): void {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) return
      void file.text().then((text) => {
        try {
          const level = parseLevel(text)
          level.id = newLevelId()
          loadLevel(level)
        } catch {
          setStatus(t('editor.importFailed'))
        }
      })
    })
    input.click()
  }

  async function openPicker(): Promise<void> {
    const stored = await listLevels()
    if (!stored.length) { setStatus(t('gallery.empty')); return }
    const choice = prompt(
      `${t('editor.open')}:\n${stored.map((s, i) => `${i + 1}. ${s.title}`).join('\n')}`,
      '1',
    )
    if (!choice) return
    const idx = Number(choice) - 1
    const picked = stored[idx]
    if (picked) loadLevel(picked.data)
  }

  async function newLevel(): Promise<void> {
    if (state.dirty) await save()
    loadLevel(emptyLevel(newLevelId(), t('editor.untitled')))
  }

  function loadLevel(level: LevelData): void {
    unsubscribe?.()
    state = new EditorState(level)
    unsubscribe = state.onChange(() => syncUi())
    titleInput.value = level.meta.title
    fitCamera()
    syncUi()
    draw()
  }

  function setStatus(msg: string): void {
    statusText.textContent = msg
  }

  function syncUi(): void {
    for (const b of leftbar.querySelectorAll<HTMLElement>('[data-tool]')) {
      b.classList.toggle('on', b.dataset['tool'] === state.tool)
    }
    for (const b of leftbar.querySelectorAll<HTMLElement>('[data-layer]')) {
      b.classList.toggle('on', b.dataset['layer'] === state.layer)
    }
    btnGrid.classList.toggle('on', state.showGrid)
    btnColl.classList.toggle('on', state.showCollision)
    btnArc.classList.toggle('on', state.showJumpArc)
    btnCross.classList.toggle('on', state.crosshair)
    btnMap.classList.toggle('on', mapMode)
    btnUndo.toggleAttribute('disabled', !state.canUndo)
    btnRedo.toggleAttribute('disabled', !state.canRedo)
    roomText.textContent = t('editor.roomCount', { n: state.level.rooms.length, max: MAX_ROOMS })
    buildPalette()
    buildProps()
    relabel()
  }

  titleInput.addEventListener('change', () => {
    state.level.meta.title = titleInput.value
    state.dirty = true
  })

  // ------------------------------------------------------------------- api --
  return {
    open(level?: LevelData) {
      loadLevel(level ?? state.level)
      requestAnimationFrame(() => { fitCamera(); draw() })
    },
    close() {
      window.removeEventListener('keydown', onKey)
      unsubscribe?.()
    },
  }
}

