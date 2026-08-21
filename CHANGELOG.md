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

- Export videozáznamu WebM do kompatibilního MP4 (H.264/AAC) přímo z historie nahrávek, včetně průběhu, zrušení a bezpečného přegenerování bez změny původního WebM
- Export přednostně používá kompatibilní systémový FFmpeg; pokud chybí, nabídne jednorázové stažení ověřené GPL podpory do aplikačních dat bez zvětšení instalátoru
- Přepracované nastavení MCP nabízí kopírování URL, bezpečnější jednorázové zobrazení tokenu, oprávnění po úrovních čtení / běžný zápis / destruktivní zápis a roztahovatelné okno.

## [8.23.0-m1.3.0-beta.4] - 2026-08-21

### Added

- Přeposlání a kopírování zpráv s kontextem původního autora a času; kontextové přeposlání má odlišenou ikonu i titulek dialogu.
- Nastavení AI: **styl shrnutí** — Stručný (výchozí), Detailní, Smart nebo Vlastní instrukce; lze zobrazit náhled system promptu. Platí pro chaty i hovory. Ve **Přepisy** lze hotové shrnutí **přegenerovat** aktuálním stylem.

### Fixed

- Lokální AI (Gemma): aktualizace `node-llama-cpp` 3.19.0 → 3.19.1 — oprava pádu při uvolnění kontextu modelu a okrajových případů při posunu kontextu.

## [8.23.0-m1.3.0-beta.3] - 2026-08-20

### Added

- Lokální MCP server a webhooková automatizace se samostatným nastavením, řízením dostupných nástrojů a bezpečným tokenem
- Nastavitelný seznam povolených MCP hostů umožňuje připojení z Docker Desktop přes `host.docker.internal`; HTTP originy se odvozují automaticky a server stále vyžaduje token
- MCP vyhledávání zpráv vrací nejnovější výsledky jako první, podporuje autora, směr, časový rozsah, textový filtr, hluboké stránkování a načtení jedné zprávy s okolním kontextem
- MCP umí bezpečně stáhnout i odeslat přílohy, číst a měnit reakce a spravovat nebo trvale ukončit Signal Group V2
- Lokální LLM vytváří shrnutí hovorů bez cloudového API klíče a umožňuje nastavit velikost kontextu i reasoning režim
- Dialogy Minutes lze přesouvat myší i klávesnicí a jejich pozice se zachová při opětovném otevření

### Fixed

- Aktivní Signal hovor se při pouhém zamknutí obrazovky nepovažuje za uspání aplikace a neukončí se
- Lokální LLM serializuje načítání modelu, přizpůsobuje dlouhé prompty skutečnému kontextu a odmítne prázdný výstup
- Dlouhé PCM sidecary se pro Whisper čtou a převzorkují po blocích místo načtení celé 48kHz nahrávky do paměti

## [8.23.0-m1.3.0-beta.2] - 2026-08-20

### Added

- (doplňte před příštím release)

### Fixed

- RingRTC addon je sestavený proti produkční konfiguraci WebRTC i po spuštění testu nahrávacích tapů; přímé hovory proto používají stejné DTLS/SDP chování jako oficiální Signal Desktop 8.23.

## [8.23.0-m1.3.0-beta.1] - 2026-08-18

### Added

- Samostatné nahrávání sdíleného videa hovoru do WebM: ukládá pouze prezentaci přenášenou přes Signal (nikdy kamery ani UI); vlastní sdílení čte přímo z odchozího RingRTC video streamu bez dalšího snímání obrazovky, při absenci sdílení používá černý obraz a zvuk přímo z RingRTC; podporuje pause/resume a automatické uložení při konci hovoru
- Přepis a volitelné AI shrnutí videonahrávek: WebM používá průběžně ukládaný RingRTC PCM sidecar a stejné přiřazení řečníků, frontu, Whisper a sumarizační pipeline jako MP3
- MCP zprávy obsahují reakce včetně emoji, autora a času; nový nástroj `set_message_reaction` umí reakci přidat, nahradit i odstranit přes standardní Signal frontu

### Fixed

- Samostatné MP3 nahrávání nyní čte lokální odchozí i vzdálený zvuk přímo z RingRTC stejně jako WebM; neotevírá vlastní mikrofon ani macOS/Windows loopback a respektuje ztlumení mikrofonu v Signalu
- RingRTC audio zdroje se po dočasném výpadku znovu připojí k časové ose nahrávky
- Nahrávání sdíleného videa a zpracovaného zvuku hovoru používá Minutes RingRTC tapy kompatibilní se Signal Desktop 8.23 (`2.70.2-minutes.2`).

## [8.23.0-m1.2.1-beta.1] - 2026-08-17

### Changed

- merge Signal Desktop v8.23.0 while preserving Minutes branding and features
- make the upstream sync workflow resolve known conflicts and update the Signal base automatically
- publish Minutes Beta for both Windows and macOS with an explicit, isolated beta runtime and update channel
- use a dedicated `Minutes-Beta-mac-arm64.dmg` asset so beta updates cannot overwrite or install the stable macOS build

### Added

- (doplňte před příštím release)

## [8.21.0-m1.2.1] - 2026-08-10

### Fixed

- Oprava přepisu AI: když model vrátí odmítnutí, shrnutí nebo moc krátký text, Minutes ponechá původní Whisper přepis (nesmaže ho)

## [8.21.0-m1.2.0] - 2026-08-10

### Fixed

- pin Python 3.12 for macOS release native rebuilds

## [8.21.0-m1.1.0] - 2026-08-10

### Added

- Nastavení AI: u Google Gemini nové modely **gemini-3.5-flash-lite** a **gemini-3.6-flash**; seznam modelů lze **obnovit z API** podle dostupného klíče
- Nastavení přepisů: při více grafických kartách lze **zvolit GPU** pro akceleraci Whisperu (dříve se používala jen první)

### Changed

- Skupinové hovory: Minutes povoluje zvonění i ve skupinách s více než 15 členy (Signal to standardně vypíná od 16). Funguje spolehlivě, pokud mají Minutes i příjemci.
- Doporučený levný Gemini model: `gemini-3.5-flash-lite` (místo `gemini-3.1-flash-lite`)

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
