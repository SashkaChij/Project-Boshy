# I WANNA BE THE FOX / Я ХОЧУ БЫТЬ ЛИСОЙ

Жестокий браузерный платформер в духе фангеймов жанра IWBTG. Играется на компьютере и на
телефоне, интерфейс на русском и английском, со встроенным редактором уровней.

*A brutally hard browser platformer in the IWBTG fangame tradition. Plays on desktop and phone,
speaks Russian and English, ships with a level editor. English section below.*

> Вдохновлено жанром фангеймов IWBTG. Вся графика, музыка, уровни и персонажи — оригинальные.
> Механики и физические константы жанра воспроизведены заново; ни один чужой ассет не использован.

---

## Быстрый старт

```bash
npm install
npm run dev      # http://localhost:5173 — с телефона в той же сети по адресу из вывода
npm test         # физика, формат уровней, реплеи, undo редактора, локализация
npm run build    # статическая сборка в dist/
```

Игра — статический сайт без бэкенда. Пуш в ветку публикует её на GitHub Pages
(`.github/workflows/deploy.yml`). Один раз нужно включить Pages в настройках репозитория:
**Settings → Pages → Source: GitHub Actions**.

## Управление

| | Клавиатура | Телефон |
|---|---|---|
| Движение | ←/→ или A/D | две смежные кнопки слева, **без зазора** между ними |
| Прыжок / двойной прыжок | Shift, Space или Z | самая крупная кнопка справа |
| Выстрел | X или Ctrl | рядом с прыжком |
| Рестарт с сейва | R | маленькая кнопка, специально подальше |
| Сдаться | Q | — |
| Пауза | Esc или P | — |

В ландшафте кнопки стоят **в чёрных полях по бокам**, а не поверх игры: поле 800×608 при
соотношении 1.32 оставляет на телефоне (2.16) примерно по 165 px с каждой стороны. Палец никогда
не закрывает шипы.

## Физика

Числа взяты из документированного поведения эталонных движков жанра и проверены юнит-тестами.
Механики и константы не охраняются авторским правом — переписаны с нуля на TypeScript.

| Константа | Значение |
|---|---|
| Частота симуляции | 50 Гц (тик ровно 20 мс) |
| Гравитация | 0.4 px/тик², **после** клэмпа скорости, **до** движения |
| Прыжок / двойной | −8.5 / −7 px/тик |
| Обрезка прыжка | `vspeed *= 0.45` при отпускании на подъёме |
| Скорость бега | 3 px/тик, мгновенно, без разгона и трения |
| Предел падения | 9 px/тик |
| Хитбокс | 11 × 21 px |
| Тайл / комната | 32 px / 25 × 19 тайлов = 800 × 608 |

Отсюда следует язык дизайна уровней: одиночный прыжок поднимает на **86.1 px = 2.69 тайла**
(три тайла НЕ перепрыгиваются), двойной — на **143.9 px = 4.5 тайла**. Эти три числа
зафиксированы в `tests/physics.spec.ts`, потому что ошибка в порядке тика сдвигает вообще все
прыжки в игре.

Сложность меняет **только количество сейв-поинтов**, никогда физику: Средне 1–3 на комнату,
Сложно 0–2, Очень сложно 1 на мир, Невозможно 0. Режим помощи имеет право только
переинтерпретировать ввод (буфер прыжка, койот-тайм) и никогда не трогает хитбоксы.

## Редактор уровней

Открывается из главного меню. Шесть инструментов: карандаш, прямоугольник, заливка, ластик,
пипетка, выделение — плюс режим объектов.

- **Оверлей дуги прыжка** (клавиша J) считается прогоном настоящей физики, а не приближённой
  формулой, поэтому не может разойтись с игрой. Видно сразу, перепрыгивается ли разрыв.
- **Undo коалесится по жесту**: протяжка на 40 тайлов отменяется одним действием.
- **Карта комнат** (Tab) — уровень это сетка экранов, а не бесконечное полотно.
- **Плейтест** (P) прогоняет уровень через настоящий сериализатор, поэтому баги формата вылезают
  сразу, а не у того, кому вы отправите уровень.

Горячие клавиши: `B` карандаш, `R` прямоугольник, `G` заливка, `E` ластик, `I` пипетка,
`M` выделение, `N` объекты, `Ctrl+Z`/`Ctrl+Shift+Z` отмена/возврат, `Ctrl+C`/`Ctrl+V`,
`Tab` карта, `P` плейтест, `F` вписать, `Delete` удалить.
На тач-экране: один палец — инструмент, два — панорама, щипок — зум, долгое нажатие — свойства.
Курсор смещён на 24 px выше пальца, иначе ставить тайлы приходится вслепую.

### Как поделиться уровнем

Кнопка «Скопировать код» сжимает уровень (`deflate-raw` → `base64url`) и кладёт его во **фрагмент**
ссылки — фрагмент не уходит на сервер, поэтому лимиты прокси не действуют и всё работает на
статике. Порядка 10 комнат помещается в ссылку; что больше — копируется как код или
экспортируется в `.json`.

**Экспорт в файл — это настоящий бэкап, а не опция.** На iOS браузер удаляет данные сайта после
7 дней без визитов.

## Что проверяется автоматически, а что нет

```bash
npm test          # 130 тестов
npm run typecheck
npm run lint
npm run build
npm run smoke        # прогон собранного сайта в реальном Chromium (нужен запущенный preview)
npm run spritesheet  # контактный лист всех 54 спрайтов
npm run levelsheet   # все комнаты всех миров одной картинкой
```

Тесты закрывают: таблицу физики (апексы 86.1 / 143.9 / 22.9 px), коллизии и попиксельные шипы,
смерть и респавн, формат уровня с миграциями, коды уровней, реплеи, стек undo редактора,
чистоту ядра (ни `Date`, ни `Math.random`, ни тригонометрии), покрытие глифов обеими локалями,
три русские формы множественного числа, и структуру миров.

**Честно о границах:** автоматика проверяет, что комната не запечатана глухой стеной, что спавн
не в шипе и что все объекты внутри комнаты. Она **не** доказывает, что уровень проходим — для
этого нужен человек либо записанный реплей автора. Именно поэтому «Проверен» ставится только
после того, как движок headless воспроизвёл ваше прохождение и получил тот же результат.

## Архитектура

```
src/core/       чистая симуляция: ни DOM, ни Date, ни Math.random, ни тригонометрии
src/platform/   рендер, звук, ввод, хранилище, коды уровней
src/game/       цикл, сцены, HUD
src/editor/     редактор (ленивый чанк)
src/content/    официальные миры, комнаты как ASCII-арт
```

Ноль runtime-зависимостей — CI падает, если в `package.json` появится ключ `dependencies`.

Чистота ядра защищена механически, а не дисциплиной: `tsconfig.core.json` не подключает
библиотеку DOM, ESLint запрещает `Date` / `Math.random` / `Math.sin`, а `tests/purity.spec.ts`
проверяет это в CI. Всё ценное — golden-реплеи как регресс-тесты, проверка проходимости уровня,
оверлей дуги прыжка — держится на том, что `step(world, input)` остаётся чистой функцией.

Комнаты авторятся ASCII-артом (`src/content/build.ts`): 19 строк по 25 символов. Правка уровня
читается в диффе как правка уровня, а не как стена сдвинутых чисел.

---

## English

A hard-as-nails browser platformer in the IWBTG fangame tradition, playable with a keyboard or
with thumbs, in Russian or English, with a real level editor.

**Inspired by the IWBTG fangame genre. All art, music, levels and characters are original.** The
genre's mechanics and physics constants are reimplemented from scratch; no third-party asset is
used. Mechanics and rules are not copyrightable — expression is, and none of it is borrowed.

### Run it

```bash
npm install && npm run dev
npm test          # physics, level format, replays, editor undo, locales
npm run build     # static site in dist/
```

Pushing to the branch deploys to GitHub Pages. Enable it once under
**Settings → Pages → Source: GitHub Actions**.

### What is interesting about it

- **Engine-accurate feel.** 50 Hz fixed timestep, gravity applied after the velocity clamp and
  before the move, `vspeed *= 0.45` on jump release. The three derived numbers that govern every
  level — 86.1 px single jump, 143.9 px double, 22.9 px minimum hop — are pinned by tests.
- **Deterministic core.** `step(world, input)` is a pure function of plain data. That buys replay
  verification (a level ships proof it is completable), golden-replay regression tests, and an
  editor overlay that draws jump arcs by running the real physics.
- **Per-pixel spike collision** generated from the same masks the renderer paints, so the shape
  you see and the shape that kills you cannot drift apart.
- **Touch controls in the letterbox margins**, not over the play area, so a thumb never covers a
  spike. Two adjacent direction buttons with no dead zone between them.
- **Russian is a first-class language**, not a string swap: three plural categories via
  `Intl.PluralRules`, a hand-drawn bitmap font with full Cyrillic coverage, and a CI test that
  fails if any character used by either locale lacks a glyph.

### Controls

Arrows or WASD to move, Shift/Space/Z to jump (press again in the air for the double jump, release
early to cut it short), X to shoot, R to restart from your last save, Q to give up, Esc to pause.

### Verification

`npm test` runs 130 tests; `npm run smoke` drives the built site in a real browser at desktop and
phone sizes; `npm run levelsheet` renders every room of every world onto one image so the level
design can actually be looked at.

What the tests do NOT do is prove a level is clearable. That needs a human, or the author's own
replay - which is why the "verified" badge is granted only after the engine has re-run the
recorded input headlessly and reproduced the clear.

### Licence

Code and assets in this repository are original work. The game is a homage to a genre, not a port
of any specific game.
