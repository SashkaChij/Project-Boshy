import { App } from './game/app.js'
import { initI18n, onLocaleChange, t } from './i18n/index.js'
import { codeFromLocation, decodeLevelCode } from './platform/share.js'
import { requestPersistence } from './platform/storage.js'
import type { LevelData } from './core/types.js'

/**
 * Boot.
 *
 * The order matters in one place only: the locale is resolved before the App
 * builds its menus, because every label is a function of the current locale
 * and the title screen would otherwise flash English at a Russian player.
 */
async function boot(): Promise<void> {
  initI18n()

  const canvas = document.getElementById('game') as HTMLCanvasElement | null
  const host = document.getElementById('root')
  const editorRoot = document.getElementById('editor-root')
  const splash = document.getElementById('splash')
  const splashHint = document.getElementById('splash-hint')
  if (!canvas || !host || !editorRoot) throw new Error('missing mount points')

  if (splashHint) splashHint.textContent = t('common.loading')

  const app = new App(canvas, host)

  // The editor is a lazy chunk: most sessions never open it, and it is the
  // largest subsystem in the project.
  let editorApi: { open: (level?: LevelData) => void; close: () => void } | null = null
  app.setEditorOpener(async (level?: LevelData) => {
    if (!editorApi) {
      const mod = await import('./editor/editor.js')
      editorApi = mod.createEditor({
        root: editorRoot as HTMLElement,
        onExit: () => {
          editorRoot.classList.remove('active')
          canvas.style.display = 'block'
          app.resume()
        },
        onPlaytest: (lv: LevelData) => {
          editorRoot.classList.remove('active')
          canvas.style.display = 'block'
          app.playCustomLevel(lv, 'gallery')
        },
      })
    }
    const api = editorApi
    if (!api) return
    app.stop()
    canvas.style.display = 'none'
    editorRoot.classList.add('active')
    api.open(level)
  })

  onLocaleChange(() => {
    document.title = t('app.title')
    app.refreshMenus()
  })
  document.title = t('app.title')

  app.start()
  splash?.classList.add('hidden')

  // A level arriving by link opens straight into play; nobody shares a link
  // expecting the recipient to hunt through menus for it.
  const code = codeFromLocation()
  if (code) {
    try {
      const level = await decodeLevelCode(code)
      app.playCustomLevel(level, 'title')
    } catch {
      app.showToast(t('editor.importFailed'))
    }
    history.replaceState(null, '', location.pathname + location.search)
  }

  void requestPersistence()
  registerServiceWorker()
}

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return
  window.addEventListener('load', () => {
    const url = new URL('sw.js', document.baseURI).href
    navigator.serviceWorker.register(url, { scope: new URL('.', document.baseURI).href }).catch(() => {
      /* offline support is a bonus, never a boot blocker */
    })
  })
}

boot().catch((err: unknown) => {
  const splashHint = document.getElementById('splash-hint')
  if (splashHint) {
    splashHint.textContent = String(err instanceof Error ? err.message : err)
    splashHint.style.color = '#ff6b6b'
  }
  console.error(err)
})
