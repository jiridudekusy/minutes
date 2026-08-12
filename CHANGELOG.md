# Changelog

Všechny významné změny v **Minutes** (fork Signal Desktop) jsou zdokumentovány zde.

Formát vychází z [Keep a Changelog](https://keepachangelog.com/cs/1.1.0/).
Verze produktu odpovídají `package.json` a GitHub Releases ve tvaru **`{Signal}-m{Meetup}`**
(např. `8.21.0-m1.0.1` — Signal Desktop base + Meetup semver za `-m`).
Po merge upstream Signal aktualizuj `MINUTES_SIGNAL_BASE_VERSION` v `ts/minutes/version.std.ts`.

Před release doplňte sekci **[Unreleased]** (Added / Changed / Fixed). Agent / vývojář spustí
`pnpm run release:minutes:metadata`, commitne `package.json` + `CHANGELOG.md` a pushne na `main`.
GitHub Actions pak automaticky sestaví instalátor a vytvoří Release s patch notes z verzované sekce CHANGELOG.

## [Unreleased]

### Added
- (doplňte před příštím release)

## [8.21.0-m1.0.15] - 2026-08-12

### Added
- expand MCP message and group automation
- add explicit webhook controls
- add local MCP automation and group management
- make Minutes windows draggable
- configure local LLM call summaries
- transcribe and summarize video recordings
- store recordings in Documents
- record shared Signal video and RingRTC audio
- add dry_run checkbox to Merge Signal upstream workflow
- weekly Signal Desktop upstream version check with auto sync PR

### Changed
- describe MCP and Linux release support
- add Linux x64 AppImage packaging
- document Minutes release touchpoints
- remove unused macOS audio tap
- Dependabot only Minutes deps (llama, whisper, resedit)

### Fixed
- tolerate one-sided RingRTC audio startup
- harden Minutes automation runtime
- stop draggable surfaces on lost pointer input
- fit local LLM prompts to runtime context
- clean up stale video recording partials
- store recording PCM outside Documents
- gate MCP resources with tool controls
- make MCP message sends idempotent
- serialize MCP runtime reconciliation
- confine MCP group avatar files
- serialize webhook outbox delivery
- recover from RingRTC video sequence resets
- keep RingRTC recording audio synchronized
- serialize local LLM model lifecycle
- fall back when Documents recordings are unavailable
- keep Minutes calls active on screen lock

## [8.21.0-m1.0.14] - 2026-08-05

### Added

- Lokální Linux x64 AppImage build přes `pnpm run build:minutes:appimage` s Minutes brandingem.
- Nastavitelný seznam povolených MCP hostů umožňuje bezpečné připojení z Docker Desktop přes `host.docker.internal`; HTTP originy se odvozují automaticky, server zůstává navázaný jen na `127.0.0.1` a vyžaduje token.
- (doplňte před příštím release)

## [8.21.0-m1.0.13] - 2026-08-05

### Added

- MCP vyhledávání zpráv vrací nejnovější výsledky jako první, podporuje autora, směr, časový rozsah, textový filtr, hluboké stránkování a načtení jedné zprávy s okolním kontextem; výsledky obsahují identitu autora.
- MCP nástroj `terminate_group` umí jako administrátor trvale ukončit Signal Group V2 pro všechny členy, odděleně od pouhého `leave_group`.

## [8.21.0-m1.0.12] - 2026-08-04

### Added

- Samostatné nahrávání sdíleného videa hovoru do WebM: ukládá pouze prezentaci přenášenou přes Signal (nikdy kamery ani UI); vlastní sdílení čte přímo z odchozího RingRTC video streamu bez dalšího snímání obrazovky, při absenci sdílení používá černý obraz a zvuk přímo z RingRTC; podporuje pause/resume a automatické uložení při konci hovoru
- Přepis a volitelné AI shrnutí videonahrávek: WebM používá průběžně ukládaný RingRTC PCM sidecar a stejné přiřazení řečníků, frontu, Whisper a sumarizační pipeline jako MP3
- MCP zprávy obsahují reakce včetně emoji, autora a času; nový nástroj `set_message_reaction` umí reakci přidat, nahradit i odstranit přes standardní Signal frontu
- MCP umí přes `download_attachment` bezpečně stáhnout přílohu zprávy a `send_message` umí odeslat text, přílohy nebo obojí přes standardní Signal attachment pipeline
- Lokální MCP server s volitelnými nástroji pro nahrávky, přepisy, zprávy, hovory a správu skupin; webhooky mají samostatný opt-in přepínač, filtr událostí a HMAC podpis
- Nastavení velikosti kontextu a reasoning režimu lokálního LLM; dlouhý vstup se ve skutečném runtime kontextu zkrátí s viditelnou značkou místo tichého odříznutí začátku
- Přesouvatelné dialogy Minutes včetně ovládání klávesnicí

### Fixed

- Samostatné MP3 nahrávání nyní čte lokální odchozí i vzdálený zvuk přímo z RingRTC stejně jako WebM; neotevírá vlastní mikrofon ani macOS/Windows loopback a respektuje ztlumení mikrofonu v Signalu
- MCP odeslání zprávy se při opakované inicializaci rendereru již nenásobí; Minutes registruje automation listenery jednou a souběžně duplicitní request ID provede jedinou mutaci
- Nahrávky se ukládají do `~/Documents/Minutes` s automatickou migrací; velké pracovní PCM sidecary zůstávají v privátním aplikačním úložišti
- Aktivní hovor se při pouhém zamknutí obrazovky macOS neukončí
- Lokální AI shrnutí funguje bez vzdáleného API klíče a respektuje nastavený lokální model
- Opraveny souběhy RingRTC audia/videa, reset video sekvence, přepnutí zdroje během nahrávání a úklid starých `.partial` souborů
- MCP odesílání zpráv podporuje idempotency klíč, webhook doručování je serializované a citlivé MCP resources respektují vypnuté nástroje

## [8.21.0-m1.0.11] - 2026-07-19

### Added

- Podpora macOS (Apple Silicon): nahrávání hovoru včetně systémového zvuku přes nový nativní balíček `@minutes/mac-audio-tap` (ScreenCaptureKit, macOS 13+) — vyžaduje oprávnění Screen Recording (po prvním povolení nutný restart aplikace) a Microphone; do té doby se nahrává jen mikrofon
- Build a distribuce na macOS: `.dmg` instalátor (arm64, unsigned), `pnpm run build:minutes:installer` na macOS spouští `electron-builder --mac dmg --arm64`; nový CI job `release-macos` publikuje `Minutes-mac-arm64.dmg` k releasu
- Auto-update je platform-aware — na macOS stáhne `Minutes-mac-arm64.dmg` a po instalaci otevře image (drag-and-drop do Applications) místo spuštění `.exe`
- Shell skripty (`setup-minutes.sh`, `start-minutes.sh`, `start-minutes-quick.sh`, `minutes-quality-gate.sh`, `test-call-pipeline.sh`, `prepare-minutes-release.sh`, `build-minutes-release.sh`) jako macOS obdoba stávajících `.bat` skriptů

### Fixed

- macOS `.dmg` nešel spustit (macOS ho zabil při startu — „Code Signature Invalid“): po přehození Electron fuses se nepodepsaný build znovu ad-hoc podepíše (`scripts/minutes-after-pack.mjs`), `hardenedRuntime` vypnut
- macOS build nezabaloval nativní modul `@minutes/mac-audio-tap` (systémový zvuk tiše chyběl — nahrával se jen mikrofon); `.node` doplněn do `build.files`
- Lokální AI model: stahování končilo HTTP 404 a model nešel spustit — přechod na Gemma 4 (node-llama-cpp 3.19.0 / llama.cpp b9842 s podporou architektury `gemma4`). Katalog nabízí **Gemma 4 12B** (doporučený) a **Gemma 4 E4B** (menší) z distribuce unsloth (Q4_K_M)

## [8.21.0-m1.0.10] - 2026-07-19

### Changed

- Tlačítko Přepisy je výš, aby nepřekrývalo ovládání chatu
- Během přepisu se místo délky nahrávky zobrazují procenta dokončení a odhad zbývajícího času

### Added

- (doplňte před příštím release)

## [8.21.0-m1.0.9] - 2026-07-16

### Fixed

- Instalátor znovu obsahuje `build/available-locales.json` a další build assety (oprava pádu při startu po 1.0.8)

### Added

- (doplňte před příštím release)

## [8.21.0-m1.0.8] - 2026-07-16

### Fixed

- Lokální LLM (Gemma): stažení modelu v instalované aplikaci znovu funguje (do balíčku se znovu zahrnuje závislost `sleep-promise` a binárky `node-llama-cpp`)

### Added

- (doplňte před příštím release)

## [8.21.0-m1.0.7] - 2026-07-12

### Added

- Nastavení přepisů: indikátor **Akcelerace přepisu** (GPU / CPU) podle dostupné grafiky
- Domovská stránka **O Minutes**: odkaz **Připojit se do skupiny** (veřejná Signal skupina)

### Changed

- Whisper: doporučený model **Large v3 Turbo** místo Medium
- Whisper: při zapnutém GPU se používá Flash Attention pro rychlejší přepis
- Whisper: režim Smart rychlejší — vyvážený profil do 25 min, pak rychlý (bez pomalého „kvalitního“ profilu)

## [8.21.0-m1.0.6] - 2026-07-11

### Added

- **Minutes Beta** — samostatný instalátor a aplikace vedle prod (paralelní ladění); data v `%APPDATA%\Minutes-Beta`
- Beta auto-update kontroluje jen GitHub pre-release buildy (prod a beta se neporovnávají)
- Kontextové menu zprávy: **Minutes: Zeptat se na názor AI**

### Changed

- Beta release asset: `Minutes-Beta-setup-windows-x64.exe`, zástupce **Minutes Beta**
- Dev: `pnpm run start:minutes:beta` spouští **Minutes Beta** s vlastním userData
- Názor AI: horní lišta **Odeslat do chatu** / **Poslat sobě** (jako u sumarizace), ne auto-odeslání

### Fixed

- Menu: **Sumarizovat nepřečtené** (dříve „Sesumarizovat nepřečtené“)
- Shrnutí chatu: sjednocené prompty pro všechny AI, max 6 úkolů, bez halucinovaných „Zajistit, že…“

## [8.21.0-m1.0.5] - 2026-07-11

### Added

- beta/prod staging, confirmed-issue flow, and -beta.N versions

### Changed

- skill minutes-promote-beta-to-prod — merge, prod release, close issues
- beta flow skill — všechna issues, release trigger, label to-retest

### Fixed

- commit verze před buildem, stash před rebase
- rebase před push verze v Release Minutes workflow
- gh skripty najdou GitHub CLI i mimo PATH na Windows
- Perplexity test respektuje min. 16 tokenů API (closes #8)
- zobrazit výsledek testu AI v patičce dialogu (closes #7)
- use ASCII GitHub label potvrzeno-k-oprave

## [8.21.0-m1.0.4-beta.1] - 2026-07-11

### Added

- (doplňte před příštím release)

### Fixed

- Nastavení AI: výsledek testu poskytovatele je vidět hned pod tlačítky (bez scrollování v dialogu)
- Nastavení AI: test Perplexity respektuje minimální limit tokenů API (min. 16)

## [8.21.0-m1.0.4] - 2026-07-11

### Changed

- Release 8.21.0-m1.0.4 (viz git historie od v8.21.0-m1.0.3).

## [8.21.0-m1.0.3] - 2026-07-11

### Changed

- Show app update UI only in home footer, remove top banner.

## [8.21.0-m1.0.2] - 2026-07-10

### Changed

- Beta/prod staging: branch `beta`, verze `8.21.0-m1.0.x-beta.N`, skill `minutes-fix-confirmed-issue`, workflow Release Minutes (pre-release vs latest)
- Aktualizace: stav jen ve footeru domovské obrazovky (bez horní modré/zelené lišty); po kontrole tlačítko Stáhnout, ne auto-download
- Verze produktu: formát `8.21.0-m1.0.1` (Signal base + `-m` + Meetup semver); UI zobrazuje celý tag
- Migrace z alpha buildů a starého Meetup semver (`1.0.x`): nový formát se správně detekuje jako novější

### Fixed

- CI build: `parseVersion` rozpozná verzi `8.21.0-m1.0.1` (skript `get-expire-time`)

## [1.0.1] - 2026-07-10

### Changed

- Ctrl+Shift+M otevře Přepisy (Minutes) místo Signálu „Všechna média“; zkratka pro log odstraněna
- Aktualizace: po kontrole se nová verze jen zobrazí, stažení až po kliknutí na Stáhnout
- Sumáře v Signal chatu: nativní formát místo markdown (`**`, `##`)
- AI prompty generují prostý text vhodný pro Signal
- Label verze: `Meetup X.Y.Z (Signal Desktop 8.21.0)`

### Fixed

- Migrace z alpha buildů: starší `8.21.0-alpha.N` správně nabídne Meetup 1.x jako novější

## [8.21.0-alpha.9] - 2026-07-10

### Changed

- Release 8.21.0-alpha.9 (viz git historie od v8.21.0-alpha.8).

## [8.21.0-alpha.8] - 2026-07-10

### Changed

- Release 8.21.0-alpha.8 (viz git historie od v8.21.0-alpha.7).

## [8.21.0-alpha.7] - 2026-07-10

### Added

- Cursor rule: agent udržuje CHANGELOG [Unreleased] při user-facing změnách
- `release:minutes:metadata` — bump verze + přesun changelog před push na main
- Release workflow se spouští automaticky po pushi s novou verzí (bez ručního Actions)

### Changed

- Release se spouští automaticky po pushi s novou verzí (bez ručního GitHub Actions)

### Fixed

- Kontrola aktualizací nerozpoznávala novější alpha verze (semver.parse místo coerce)
- TypeScript chyby v modulu přepisu hovorů

## [8.21.0-alpha.1]

Základní release na Signal Desktop 8.21.

### Added

- Nahrávání skupinových hovorů → MP3 (Record / Pause / Stop)
- Sumarizace chatu (1h / 8h / 24h, „Summarize from here“) s filtrem podle `sent_at`
- AI shrnutí: OpenAI, Gemini, Anthropic Claude, Perplexity (vlastní API klíče, safeStorage)
- Whisper přepis hovorů (lokální model, nastavitelné parametry)
- Záložky zpráv, export sumářů do chatu (toast)
- Příručka v aplikaci (`prirucka.md`), uvítací obrazovka
- GitHub Actions: release instalátoru, merge upstream Signálu
- Oddělený userData profil `%APPDATA%\Minutes`

### Changed

- Branding Minutes (ikony, menu, startup splash)
- Architektura: veškerá logika v `ts/minutes/`, tenké hooky v upstream

### Known limitations

- Pouze Windows instalátor (NSIS), bez code signing
- Auto-update vypnuto — nová verze ručně z GitHub Releases
