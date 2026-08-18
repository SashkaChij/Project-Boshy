/**
 * Editor chrome styles, injected by the editor module so there is no separate
 * stylesheet to keep in sync.
 *
 * Two constraints drive most of this: Russian labels run 30-40% wider than
 * English ones ("Undo" -> "Отменить", "Save" -> "Сохранить"), so nothing gets a
 * fixed width; and every control is at least 44 px so it is usable with a thumb.
 */
export const EDITOR_CSS = `
.fx-shell {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-rows: auto 1fr auto;
  background: #0b0b12;
  color: #e8e2d4;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
  touch-action: none;
  overflow: hidden;
}

.fx-topbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: #14141d;
  border-bottom: 1px solid #23232f;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}

.fx-title {
  flex: 1 1 140px;
  min-width: 120px;
  background: #0f0f17;
  border: 1px solid #2a2a38;
  border-radius: 6px;
  color: #ffcf4a;
  padding: 8px 10px;
  font: inherit;
  font-weight: 600;
  min-height: 40px;
}

.fx-body {
  display: grid;
  grid-template-columns: auto 1fr auto;
  min-height: 0;
}

.fx-tools {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  background: #14141d;
  border-right: 1px solid #23232f;
  overflow-y: auto;
}

.fx-canvas-wrap { position: relative; min-width: 0; min-height: 0; background: #07070c; }
.fx-canvas { display: block; width: 100%; height: 100%; touch-action: none; image-rendering: pixelated; }

.fx-side {
  width: 250px;
  background: #14141d;
  border-left: 1px solid #23232f;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fx-status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  background: #14141d;
  border-top: 1px solid #23232f;
  min-height: 40px;
}
.fx-status-text { flex: 1; color: #9a9384; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fx-status-room { color: #6a6558; white-space: nowrap; }

.fx-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  /* min-width, never width: Russian labels are far longer than English ones. */
  min-width: 44px;
  min-height: 44px;
  padding: 6px 10px;
  background: #1d1d29;
  color: #cfc9bb;
  border: 1px solid #2a2a38;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
  line-height: 1.15;
  white-space: nowrap;
  flex: 0 0 auto;
}
.fx-btn:hover { background: #262636; }
.fx-btn.on { background: #3a2f10; border-color: #ffcf4a; color: #ffcf4a; }
.fx-btn[disabled] { opacity: .35; cursor: default; }
.fx-btn.fx-danger { border-color: #7a2630; color: #ff8f8f; width: 100%; margin-top: 8px; }
.fx-ico { font-size: 16px; line-height: 1; }
.fx-lbl { display: none; }
.fx-topbar .fx-btn .fx-lbl { display: none; }

.fx-sep { height: 1px; background: #2a2a38; margin: 6px 2px; }

.fx-section {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: #6a6558;
  margin-top: 4px;
}

.fx-palette { display: flex; flex-direction: column; gap: 4px; }
.fx-cat { font-size: 12px; color: #9a9384; margin-top: 6px; }
.fx-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(48px, 1fr)); gap: 4px; }

.fx-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: #10101a;
  border: 1px solid #24242f;
  border-radius: 6px;
  cursor: pointer;
  min-height: 48px;
  overflow: hidden;
}
.fx-cell:hover { border-color: #4a4a5e; }
.fx-cell.on { border-color: #ffcf4a; background: #2a2210; }
.fx-thumb { width: 32px; height: 32px; image-rendering: pixelated; }
.fx-cap {
  font-size: 9px;
  color: #7a7568;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fx-props { display: flex; flex-direction: column; gap: 6px; }
.fx-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 36px; }
.fx-row-name { color: #b8b2a4; flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.fx-num, .fx-sel {
  flex: 0 0 84px;
  min-height: 34px;
  background: #0f0f17;
  border: 1px solid #2a2a38;
  border-radius: 6px;
  color: #e8e2d4;
  padding: 4px 6px;
  font: inherit;
}
.fx-empty, .fx-note { color: #6a6558; font-size: 12px; padding: 6px 0; }

/* Phones: the palette becomes a bottom sheet and the tool rail goes horizontal,
   because a 250px sidebar eats a landscape phone alive. */
@media (max-width: 820px) {
  .fx-body { grid-template-columns: auto 1fr; grid-template-rows: 1fr auto; }
  .fx-tools { flex-direction: column; }
  .fx-side {
    grid-column: 1 / -1;
    width: auto;
    max-height: 38vh;
    border-left: none;
    border-top: 1px solid #23232f;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .fx-palette { flex: 1 1 60%; min-width: 200px; }
  .fx-props { flex: 1 1 35%; min-width: 160px; }
  .fx-section { width: 100%; }
}

@media (max-width: 520px) {
  .fx-topbar { gap: 4px; padding: 4px; }
  .fx-btn { min-width: 44px; padding: 4px 6px; }
  .fx-title { flex-basis: 100px; }
}
`
