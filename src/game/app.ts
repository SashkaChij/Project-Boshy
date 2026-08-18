import { TICK_MS, TILE, VIEW_H, VIEW_W } from '../core/constants.js'
import { material } from '../core/registry/tileMaterials.js'
import { validateLevel } from '../core/level.js'
import { ReplayRecorder, verifyReplay } from '../core/replay.js'
import { createWorld, respawn } from '../core/sim/world.js'
import { step } from '../core/sim/step.js'
import { DIFF_IMPOSSIBLE, DIFF_MEDIUM, type LevelData, type World } from '../core/types.js'
import { WORLDS, type CampaignWorld } from '../content/index.js'
import { formatTicks, getLocale, setLocale, t, tp } from '../i18n/index.js'
import { buildAtlas, type Atlas } from '../platform/atlas.js'
import { initAudio, playMusic, playSfx, setMusicVolume, setSfxVolume, stopMusic, type TrackName } from '../platform/audio/index.js'
import { createDisplay, type Display } from '../platform/display.js'
import { decodeLevelCode } from '../platform/share.js'
import { attachKeyboard } from '../platform/input/keyboard.js'
import { InputAccumulator } from '../platform/input/state.js'
import { attachTouch, type TouchController } from '../platform/input/touch.js'
import { ParticleField } from '../platform/particles.js'
import { createRenderer, type Renderer } from '../platform/renderer2d.js'
import { getSettings, listLevels, loadSettings, putLevel, recordClear, saveSettings } from '../platform/storage.js'
import { drawText, measureText, textHeight } from '../platform/text.js'
import { drawHud } from './hud.js'
import { DEFAULT_THEME, Menu, drawBar, type MenuItem } from './ui.js'

/** Rows that are solid edge to edge can be hidden without hiding anything. */
function computeSafeCrop(w: World): { top: number; bottom: number } {
  const cols = VIEW_W / TILE
  const rowSolid = (ty: number): boolean => {
    for (let tx = 0; tx < cols; tx++) {
      if (!material(w.main[ty * cols + tx] ?? 0).solid) return false
    }
    return true
  }
  const rows = VIEW_H / TILE
  let top = 0
  while (top < 2 && rowSolid(top)) top++
  let bottom = 0
  while (bottom < 2 && rowSolid(rows - 1 - bottom)) bottom++
  return { top: top * TILE, bottom: bottom * TILE }
}

export type SceneId = 'title' | 'difficulty' | 'worldmap' | 'play' | 'pause' | 'win' | 'options' | 'gallery'

/** Where the player came from, so Back always goes somewhere sensible. */
interface PlaySession {
  level: LevelData
  worldId: string | null
  returnTo: SceneId
  recorder: ReplayRecorder
}

const MAX_CATCHUP_STEPS = 5

export class App {
  readonly display: Display
  readonly atlas: Atlas
  readonly renderer: Renderer
  readonly particles = new ParticleField()
  readonly input = new InputAccumulator()

  private touch: TouchController | null = null
  private detachKeyboard: (() => void) | null = null
  private scene: SceneId = 'title'
  private world: World | null = null
  private session: PlaySession | null = null
  private menus = new Map<SceneId, Menu>()
  private accumulator = 0
  private lastTime = 0
  private running = false
  private toast = ''
  private toastUntil = 0
  private currentTrack: TrackName | null = null
  private galleryLevels: { id: string; title: string; data: LevelData }[] = []
  private onOpenEditor: ((level?: LevelData) => void) | null = null
  private sawTouch = false
  private cropKey = ''
  private cropCache = { top: 0, bottom: 0 }

  constructor(canvas: HTMLCanvasElement, host: HTMLElement) {
    loadSettings()
    this.display = createDisplay(canvas)
    this.atlas = buildAtlas()
    this.renderer = createRenderer(this.display.ctx, this.atlas)

    this.detachKeyboard = attachKeyboard(this.input)
    this.touch = attachTouch(this.input, host)
    this.display.onResize((m) => {
      this.touch?.layout({
        gameX: m.gameX, gameY: m.gameY, gameW: m.gameW, gameH: m.gameH,
        viewW: m.viewW, viewH: m.viewH,
      })
    })

    this.buildMenus()
    this.attachUiEvents(canvas)
    this.applyVolumes()
  }

  setEditorOpener(fn: (level?: LevelData) => void): void {
    this.onOpenEditor = fn
  }

  // ------------------------------------------------------------- lifecycle --

  start(): void {
    if (this.running) return
    this.running = true
    this.lastTime = performance.now()
    requestAnimationFrame(this.frame)
    this.setScene('title')
  }

  stop(): void {
    this.running = false
  }

  /** Called when the editor hands control back. */
  resume(): void {
    this.running = true
    this.lastTime = performance.now()
    this.accumulator = 0
    requestAnimationFrame(this.frame)
    this.setScene(this.scene)
  }

  private frame = (now: number): void => {
    if (!this.running) return
    requestAnimationFrame(this.frame)

    let dt = now - this.lastTime
    this.lastTime = now
    // A backgrounded tab, a paused debugger, or a phone that slept produces a
    // gigantic dt. Forfeit it rather than simulating minutes in one frame.
    if (dt > 250) dt = TICK_MS
    this.accumulator += dt

    let steps = 0
    while (this.accumulator >= TICK_MS && steps < MAX_CATCHUP_STEPS) {
      this.tick()
      this.accumulator -= TICK_MS
      steps++
    }
    if (steps === MAX_CATCHUP_STEPS) this.accumulator = 0

    this.render()
    this.display.present()
  }

  private tick(): void {
    if (this.scene !== 'play') {
      // Menus still drain the accumulator so a held key does not queue up and
      // fire a burst of selections the moment gameplay starts.
      this.input.snapshot()
      return
    }
    const w = this.world
    if (!w) return

    const frame = this.input.snapshot()
    this.session?.recorder.push(frame)
    step(w, frame)

    for (const ev of w.events) {
      switch (ev.k) {
        case 'jump': playSfx('jump'); break
        case 'djump': playSfx('djump'); break
        case 'shoot': playSfx('shoot'); break
        case 'land': playSfx('land'); break
        case 'save': playSfx('save'); this.particles.spark(ev.x, ev.y, '#ffd23f', 14, 3); break
        case 'death':
          playSfx('death')
          this.particles.burst(ev.x, ev.y)
          navigator.vibrate?.(12)
          break
        case 'blockbreak': playSfx('blockbreak'); this.particles.spark(ev.x, ev.y, '#b9a888', 10, 3); break
        case 'bosshit': playSfx('bosshit'); this.particles.spark(ev.x, ev.y, '#ff6b6b', 6, 2); break
        case 'bossdie': playSfx('bossdie'); this.particles.burst(ev.x, ev.y); break
        case 'room': this.particles.clear(); break
        case 'win': this.onWin(); break
      }
    }
    w.events.length = 0
    this.particles.update(w.main, VIEW_W / 32, VIEW_H / 32)
  }

  private onWin(): void {
    const w = this.world
    const s = this.session
    if (!w || !s) return
    playSfx('win')
    this.playTrack('victory')
    if (s.worldId) recordClear(s.worldId, w.tick, w.deaths, w.assist)
    else void this.storeVerifiedClear(w, s)
    this.setScene('win')
  }

  /**
   * A cleared custom level gets its clear recorded and re-verified.
   *
   * The replay is replayed headlessly against the same level before the badge
   * is granted, so "verified" means the run reproduces, not that the player
   * claims it happened. Strict and assist clears are stored separately because
   * they are not the same achievement.
   */
  private async storeVerifiedClear(w: World, s: PlaySession): Promise<void> {
    try {
      const replay = s.recorder.finish(s.level, w.difficulty, w.assist, 0x1337c0de)
      const result = verifyReplay(s.level, replay)
      if (!result.ok) return

      if (w.assist) s.level.meta.verifiedAssist = true
      else s.level.meta.verifiedStrict = true
      s.level.meta.clearMs = Math.round((w.tick * 1000) / 50)
      await putLevel(s.level, replay)
      this.showToast(t(w.assist ? 'win.assistNote' : 'gallery.verified'))
    } catch {
      // A failed verification is not worth interrupting a win screen over.
    }
  }

  // ----------------------------------------------------------------- scenes --

  private setScene(id: SceneId): void {
    this.scene = id
    const menu = this.menus.get(id)
    if (menu) menu.index = 0
    if (id === 'gallery') void this.refreshGallery()
    this.syncDeck()
    // Menu confirm shares keys with jump (Space / Shift / Z). Without this the
    // keystroke that started or resumed a level would also be consumed as a
    // jump on the very first tick.
    if (id === 'play') this.input.clear()

    if (id === 'play') {
      const world = this.session?.worldId
      this.playTrack(world === 'w2' ? 'factory' : world === 'w3' ? 'void' : 'trial')
    } else if (id === 'win') {
      /* victory fanfare already started */
    } else if (id !== 'pause') {
      this.playTrack('title')
    }
  }

  private playTrack(track: TrackName): void {
    if (this.currentTrack === track) return
    this.currentTrack = track
    playMusic(track)
  }

  private startLevel(level: LevelData, worldId: string | null, returnTo: SceneId): void {
    const s = getSettings()
    const { errors } = validateLevel(level)
    if (errors.length > 0) {
      this.showToast(t('editor.errorCount', { n: errors.length }))
      playSfx('error')
      return
    }
    this.world = createWorld(level, { difficulty: s.difficulty, assist: s.assist })
    this.session = { level, worldId, returnTo, recorder: new ReplayRecorder() }
    this.particles.clear()
    this.renderer.invalidate()
    this.input.clear()
    this.setScene('play')
  }

  playCustomLevel(level: LevelData, returnTo: SceneId = 'gallery'): void {
    this.startLevel(level, null, returnTo)
  }

  private quitToTitle(): void {
    this.world = null
    this.session = null
    this.particles.clear()
    this.setScene('title')
  }

  // ------------------------------------------------------------------ menus --

  private buildMenus(): void {
    const s = () => getSettings()

    this.menus.set('title', new Menu([
      { label: () => t('menu.play'), action: () => this.setScene('difficulty') },
      { label: () => t('menu.editor'), action: () => this.onOpenEditor?.() },
      { label: () => t('menu.gallery'), action: () => this.setScene('gallery') },
      { label: () => t('menu.options'), action: () => this.setScene('options') },
    ]))

    const diffItem = (value: number, key: string): MenuItem => ({
      label: () => t(key),
      hint: () => t(`${key}.desc`),
      action: () => {
        saveSettings({ difficulty: value })
        this.setScene('worldmap')
      },
    })

    this.menus.set('difficulty', new Menu([
      diffItem(DIFF_MEDIUM, 'diff.medium'),
      diffItem(1, 'diff.hard'),
      diffItem(2, 'diff.vhard'),
      diffItem(DIFF_IMPOSSIBLE, 'diff.impossible'),
      {
        label: () => t('diff.assist'),
        hint: () => t('diff.assist.desc'),
        value: () => (s().assist ? t('common.on') : t('common.off')),
        action: () => saveSettings({ assist: !s().assist }),
        onLeft: () => saveSettings({ assist: false }),
        onRight: () => saveSettings({ assist: true }),
      },
      { label: () => t('menu.back'), action: () => this.setScene('title') },
    ]))

    this.menus.set('options', new Menu([
      {
        label: () => t('options.language'),
        value: () => (getLocale() === 'ru' ? 'Русский' : 'English'),
        action: () => setLocale(getLocale() === 'ru' ? 'en' : 'ru'),
        onLeft: () => setLocale('en'),
        onRight: () => setLocale('ru'),
      },
      {
        label: () => t('options.music'),
        value: () => `${Math.round(s().musicVolume * 100)}%`,
        action: () => this.bumpVolume('musicVolume', 0.1),
        onLeft: () => this.bumpVolume('musicVolume', -0.1),
        onRight: () => this.bumpVolume('musicVolume', 0.1),
      },
      {
        label: () => t('options.sfx'),
        value: () => `${Math.round(s().sfxVolume * 100)}%`,
        action: () => this.bumpVolume('sfxVolume', 0.1),
        onLeft: () => this.bumpVolume('sfxVolume', -0.1),
        onRight: () => this.bumpVolume('sfxVolume', 0.1),
      },
      {
        label: () => t('options.touchDeck'),
        value: () => t(`options.touch${s().touchMode === 'auto' ? 'Auto' : s().touchMode === 'on' ? 'On' : 'Off'}`),
        action: () => this.cycleTouchMode(),
        onLeft: () => this.cycleTouchMode(-1),
        onRight: () => this.cycleTouchMode(1),
      },
      { label: () => t('menu.back'), action: () => this.setScene('title') },
    ]))

    this.menus.set('pause', new Menu([
      { label: () => t('pause.resume'), action: () => this.setScene('play') },
      {
        label: () => t('pause.restart'),
        action: () => {
          if (this.world) respawn(this.world)
          this.setScene('play')
        },
      },
      { label: () => t('pause.quit'), action: () => this.quitToTitle() },
    ]))

    this.menus.set('win', new Menu([
      { label: () => t('win.continue'), action: () => this.setScene(this.session?.returnTo ?? 'title') },
      { label: () => t('menu.quit'), action: () => this.quitToTitle() },
    ]))

    this.rebuildWorldMenu()
    this.menus.set('gallery', new Menu([]))
  }

  private rebuildWorldMenu(): void {
    const items: MenuItem[] = WORLDS.map((cw: CampaignWorld) => ({
      label: () => t(cw.nameKey),
      value: () => {
        const p = getSettings().progress[cw.id]
        return p?.cleared ? t('worldmap.cleared') : ''
      },
      hint: () => {
        const p = getSettings().progress[cw.id]
        if (!p?.cleared) return ''
        return t('worldmap.best', { time: formatTicks(p.bestTicks), deaths: String(p.bestDeaths) })
      },
      action: () => this.startLevel(cw.level, cw.id, 'worldmap'),
    }))
    items.push({ label: () => t('menu.back'), action: () => this.setScene('title') })
    this.menus.set('worldmap', new Menu(items))
  }

  private async refreshGallery(): Promise<void> {
    const stored = await listLevels()
    this.galleryLevels = stored.map((s) => ({ id: s.id, title: s.title, data: s.data }))
    const items: MenuItem[] = this.galleryLevels.map((lv) => ({
      label: () => lv.title || t('editor.untitled'),
      action: () => this.playCustomLevel(lv.data, 'gallery'),
      value: () => (lv.data.meta.verifiedStrict ? '✓' : ''),
      hint: () =>
        lv.data.meta.verifiedStrict
          ? `${t('gallery.verified')} — ${formatTicks(Math.round((lv.data.meta.clearMs * 50) / 1000))}`
          : t('gallery.unverified'),
    }))
    // Codes arrive by chat as often as by link, and a player who is handed one
    // otherwise has nowhere to put it outside the editor.
    items.push({ label: () => t('editor.pasteCode'), action: () => void this.promptLevelCode() })
    items.push({ label: () => t('menu.editor'), action: () => this.onOpenEditor?.() })
    items.push({ label: () => t('menu.back'), action: () => this.setScene('title') })
    this.menus.set('gallery', new Menu(items))
  }

  private async promptLevelCode(): Promise<void> {
    const input = prompt(t('editor.codePasteTitle'))
    if (!input) return
    try {
      const level = await decodeLevelCode(input)
      this.playCustomLevel(level, 'gallery')
    } catch {
      playSfx('error')
      this.showToast(t('editor.importFailed'))
    }
  }

  private bumpVolume(key: 'musicVolume' | 'sfxVolume', delta: number): void {
    const s = getSettings()
    const next = Math.max(0, Math.min(1, Number((s[key] + delta).toFixed(2))))
    saveSettings({ [key]: next } as never)
    this.applyVolumes()
    playSfx('menu')
  }

  private cycleTouchMode(dir = 1): void {
    const order: ('auto' | 'on' | 'off')[] = ['auto', 'on', 'off']
    const cur = order.indexOf(getSettings().touchMode)
    const next = order[(cur + dir + order.length) % order.length] ?? 'auto'
    saveSettings({ touchMode: next })
    this.applyTouchMode()
  }

  private applyVolumes(): void {
    const s = getSettings()
    setMusicVolume(s.musicVolume)
    setSfxVolume(s.sfxVolume)
  }

  private applyTouchMode(): void {
    this.syncDeck()
  }

  // ------------------------------------------------------------------ input --

  private attachUiEvents(canvas: HTMLCanvasElement): void {
    window.addEventListener('keydown', (e) => {
      if (this.handleMenuKey(e.code)) e.preventDefault()
    })

    canvas.addEventListener('pointerdown', (e) => {
      void initAudio()
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        if (!this.sawTouch) { this.sawTouch = true; this.syncDeck() }
      }
      if (this.scene === 'play') return
      const menu = this.menus.get(this.scene)
      if (!menu) return
      const p = this.display.toGame(e.clientX, e.clientY)
      const hit = menu.hitTest(p.x, p.y)
      if (hit >= 0) {
        menu.index = hit
        playSfx('select')
        menu.activate()
      }
    })

    window.addEventListener('blur', () => this.input.clear())
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.input.clear()
        this.accumulator = 0
      } else {
        this.lastTime = performance.now()
      }
    })
  }

  private handleMenuKey(code: string): boolean {
    void initAudio()

    if (this.scene === 'play') {
      if (code === 'Escape' || code === 'KeyP') {
        this.setScene('pause')
        return true
      }
      return false
    }

    const menu = this.menus.get(this.scene)
    if (!menu) return false

    switch (code) {
      case 'ArrowUp': case 'KeyW':
        if (menu.moveBy(-1)) playSfx('menu')
        return true
      case 'ArrowDown': case 'KeyS':
        if (menu.moveBy(1)) playSfx('menu')
        return true
      case 'ArrowLeft': case 'KeyA':
        if (menu.nudge(-1)) { playSfx('menu'); this.applyVolumes() }
        return true
      case 'ArrowRight': case 'KeyD':
        if (menu.nudge(1)) { playSfx('menu'); this.applyVolumes() }
        return true
      case 'Enter': case 'Space': case 'KeyZ': case 'ShiftLeft': case 'ShiftRight':
        playSfx('select')
        menu.activate()
        return true
      case 'KeyL':
        // Reachable from every menu, not buried in options: a Russian player
        // landing on an English title screen should not have to navigate it.
        setLocale(getLocale() === 'ru' ? 'en' : 'ru')
        playSfx('select')
        return true
      case 'Escape':
        if (this.scene === 'pause') this.setScene('play')
        else if (this.scene !== 'title') this.setScene('title')
        return true
      default:
        return false
    }
  }

  /**
   * The deck is shown only during play.
   *
   * Menus are tapped directly -- the hit test on the canvas already handles
   * that -- so leaving five buttons floating over the title screen would just
   * cover it for no gain.
   */
  private wantDeck(): boolean {
    if (this.scene !== 'play') return false
    const mode = getSettings().touchMode
    if (mode === 'off') return false
    if (mode === 'on') return true
    return this.sawTouch || (window.matchMedia?.('(pointer: coarse)').matches ?? false)
  }

  private syncDeck(): void {
    this.touch?.setVisible(this.wantDeck())
  }

  showToast(msg: string): void {
    this.toast = msg
    this.toastUntil = performance.now() + 2600
  }

  // ----------------------------------------------------------------- render --

  private render(): void {
    const ctx = this.display.ctx
    ctx.imageSmoothingEnabled = false

    switch (this.scene) {
      case 'play': this.renderPlay(); break
      case 'pause': this.renderPlay(); this.renderOverlayMenu(t('pause.title')); break
      case 'win': this.renderPlay(); this.renderWin(); break
      case 'title': this.renderTitle(); break
      case 'difficulty': this.renderMenuScreen(t('diff.title'), t('diff.note')); break
      case 'worldmap': this.renderMenuScreen(t('worldmap.title')); break
      case 'options': this.renderOptions(); break
      case 'gallery': this.renderMenuScreen(t('gallery.title'), this.galleryLevels.length ? '' : t('gallery.empty')); break
    }

    this.renderToast()
  }

  private renderPlay(): void {
    const w = this.world
    const ctx = this.display.ctx
    if (!w) {
      ctx.fillStyle = '#07070c'
      ctx.fillRect(0, 0, VIEW_W, VIEW_H)
      return
    }
    this.applyCrop(w)
    this.renderer.drawWorld(w, this.particles, (i) => t(`taunt.${i}`))
    drawHud(ctx, w, this.display.crop)
  }

  /**
   * Crop rows that are solid all the way across, and only on screens short
   * enough to need it. A room's top row is wall in every authored room, and the
   * floor slab underneath is never anything else -- so hiding them costs the
   * player nothing and buys about a fifth of the playfield area back on a
   * phone. It is recomputed per room because a player-made level may well put
   * something in row 0.
   */
  private applyCrop(w: World): void {
    const m = this.display.metrics()
    const wantCrop = m.viewH < 520
    if (!wantCrop) {
      this.display.setCrop({ top: 0, bottom: 0 })
      return
    }
    const key = `${w.room}:${w.level.id}`
    if (key !== this.cropKey) {
      this.cropKey = key
      this.cropCache = computeSafeCrop(w)
    }
    this.display.setCrop(this.cropCache)
  }

  private renderBackdrop(): void {
    const ctx = this.display.ctx
    ctx.fillStyle = '#07070c'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    // Cheap starfield so the menus are not a flat void.
    ctx.fillStyle = '#15151f'
    for (let i = 0; i < 60; i++) {
      const x = (i * 137) % VIEW_W
      const y = (i * 89) % VIEW_H
      ctx.fillRect(x, y, 2, 2)
    }
  }

  private renderTitle(): void {
    const ctx = this.display.ctx
    this.renderBackdrop()
    drawText(ctx, t('app.title'), VIEW_W / 2, 70, {
      scale: 5, align: 'center', color: '#ffcf4a', shadow: '#3a2400',
    })
    drawText(ctx, t('app.tagline'), VIEW_W / 2, 130, {
      scale: 2, align: 'center', color: '#9a9384',
    })
    this.menus.get('title')?.draw(ctx, VIEW_W / 2, 220)
    drawText(ctx, t('app.credit'), VIEW_W / 2, VIEW_H - 34, {
      scale: 1, align: 'center', color: '#4c4a44',
    })
    drawText(ctx, getLocale() === 'ru' ? 'EN / [РУ]' : '[EN] / РУ', VIEW_W - 12, 12, {
      scale: 2, align: 'right', color: '#6a6558',
    })
  }

  private renderMenuScreen(title: string, note = ''): void {
    const ctx = this.display.ctx
    this.renderBackdrop()
    drawText(ctx, title, VIEW_W / 2, 60, { scale: 4, align: 'center', color: '#ffcf4a', shadow: '#3a2400' })
    const end = this.menus.get(this.scene)?.draw(ctx, VIEW_W / 2, 150) ?? 150
    if (note) {
      drawText(ctx, note, VIEW_W / 2, Math.min(end + 20, VIEW_H - 40), {
        scale: 2, align: 'center', color: '#6a6558',
      })
    }
  }

  private renderOptions(): void {
    const ctx = this.display.ctx
    this.renderBackdrop()
    drawText(ctx, t('options.title'), VIEW_W / 2, 60, {
      scale: 4, align: 'center', color: '#ffcf4a', shadow: '#3a2400',
    })
    this.menus.get('options')?.draw(ctx, VIEW_W / 2, 160)
    const s = getSettings()
    drawBar(ctx, VIEW_W / 2 + 200, 205, s.musicVolume, 140)
    drawBar(ctx, VIEW_W / 2 + 200, 253, s.sfxVolume, 140)
  }

  private renderOverlayMenu(title: string): void {
    const ctx = this.display.ctx
    ctx.fillStyle = 'rgba(5,5,10,0.82)'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    drawText(ctx, title, VIEW_W / 2, 130, { scale: 4, align: 'center', color: '#ffcf4a', shadow: '#000' })
    this.menus.get(this.scene)?.draw(ctx, VIEW_W / 2, 230)
  }

  private renderWin(): void {
    const ctx = this.display.ctx
    const w = this.world
    ctx.fillStyle = 'rgba(5,5,10,0.86)'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    drawText(ctx, t('win.title'), VIEW_W / 2, 100, {
      scale: 6, align: 'center', color: '#ffcf4a', shadow: '#3a2400',
    })
    if (w) {
      const rows = [
        `${t('win.time')}  ${formatTicks(w.tick)}`,
        tp('hud.deaths', w.deaths),
      ]
      rows.forEach((r, i) => {
        drawText(ctx, r, VIEW_W / 2, 190 + i * 34, { scale: 3, align: 'center', color: '#e8e2d4' })
      })
      if (w.assist) {
        drawText(ctx, t('win.assistNote'), VIEW_W / 2, 270, {
          scale: 2, align: 'center', color: '#6fd3ff',
        })
      }
    }
    this.menus.get('win')?.draw(ctx, VIEW_W / 2, 330)
  }

  private renderToast(): void {
    if (!this.toast || performance.now() > this.toastUntil) return
    const ctx = this.display.ctx
    const w = measureText(this.toast, { scale: 2 }) + 32
    const h = textHeight({ scale: 2 }) + 20
    const x = VIEW_W / 2 - w / 2
    const y = VIEW_H - h - 24
    ctx.fillStyle = 'rgba(0,0,0,0.85)'
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = '#ffcf4a'
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
    drawText(ctx, this.toast, VIEW_W / 2, y + 10, { scale: 2, align: 'center', color: '#ffcf4a' })
  }

  destroy(): void {
    this.running = false
    this.detachKeyboard?.()
    this.touch?.destroy()
    this.display.destroy()
    stopMusic()
  }

  get currentScene(): SceneId {
    return this.scene
  }

  refreshMenus(): void {
    this.rebuildWorldMenu()
  }

  get theme() {
    return DEFAULT_THEME
  }
}
