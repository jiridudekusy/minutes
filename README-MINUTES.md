# minutes

Fork of [Signal Desktop](https://github.com/signalapp/Signal-Desktop) focused on **meeting minutes** — call recording, chat summaries, Whisper transcription, and AI assistance.

## Klíčové pravidlo (přečti jako první)

> **Tím, že je tento projekt fork Signálu, vše děláme tak, aby šel fork pravidelně aktualizovat o nové verze Signal Desktop bez merge konfliktů.**

- Veškerá logika → `ts/minutes/`
- Upstream Signal soubory → jen tenké hooky (import + jedno volání)
- Každý dotyk upstream → `docs/MINUTES-PATCHES.md`
- Podrobně: **[docs/FORK-MAINTENANCE.md](docs/FORK-MAINTENANCE.md)**

Signal UX and login are unchanged. Minutes extensions live in `ts/minutes/` with minimal hooks in upstream files.

## Features

| Feature                                                                                                         | Status |
| --------------------------------------------------------------------------------------------------------------- | ------ |
| Signal UI + login (production servers)                                                                          | ✅     |
| **Skupinový hovor** — Record / Pause / Resume / Stop → MP3                                                      | ✅     |
| **Sdílené video hovoru** — vzdálená Signal prezentace nebo lokální odchozí RingRTC video + RingRTC audio → WebM | ✅     |
| **Sumarizace chatu** — 1h / 8h / 24h, „Summarize from here“ (filtr podle `sent_at`)                             | ✅     |
| **Whisper přepis hovoru** — lokální model, VAD, prompt chaining, AI korekce                                     | ✅     |
| **AI shrnutí** — OpenAI, Gemini, Anthropic Claude, Perplexity (vlastní API klíče)                               | ✅     |
| **Sumarizace hovoru** — rozšíření přepisu (menu Minutes)                                                        | ✅     |
| Záložky zpráv                                                                                                   | ✅     |
| Odeslání sumáře do chatu (toast)                                                                                | ✅     |
| Příručka v aplikaci + uvítací obrazovka                                                                         | ✅     |
| GitHub Actions — CI, release, upstream merge                                                                    | ✅     |

Detailní popis: **[images/minutes/prirucka.md](images/minutes/prirucka.md)**  
Změny verzí: **[CHANGELOG.md](CHANGELOG.md)**

## Prerequisites (Windows / macOS)

### Windows

1. **Node.js** — see `.nvmrc` (use nvm-windows or install matching version)
2. **pnpm** — `npm install -g pnpm`
3. **Python 3**
4. **Visual Studio 2022** — workload _Desktop development with C++_
5. Build from **x64 Native Tools Command Prompt** or short path (avoid Windows MAX_PATH issues)

### macOS (jen Apple Silicon)

1. **Node.js** — see `.nvmrc` (nvm / fnm doporučeno)
2. **pnpm** — `npm install -g pnpm`
3. **Python 3**
4. **Xcode Command Line Tools** — `xcode-select --install` (potřeba pro native moduly, `iconutil`)
5. Pouze **Apple Silicon (arm64)** — `whisper-cpp-node` nemá prebuild pro darwin-x64, Intel Mac není podporovaný

## First-time build

```powershell
# Windows
cd c:\WORK\_TECH\AI_tools\minutes
pnpm install
pnpm run generate
pnpm run start:minutes
```

```bash
# macOS
cd ~/dev/minutes
pnpm install
pnpm run generate
pnpm run start:minutes
```

Alternativa (stejné kroky ve skriptu): `setup-minutes.bat` → `start-minutes.bat` (Windows) nebo `./setup-minutes.sh` → `./start-minutes.sh` (macOS).

`start:minutes` uses production Signal servers (`config/minutes.json`) and separate user data — `%APPDATA%\Minutes` (Windows) / `~/Library/Application Support/Minutes` (macOS).

## Development workflow

```powershell
# Terminal 1 — watch TypeScript bundles
pnpm run dev:transpile

# Terminal 2 — run app
pnpm run start:minutes
```

## CI

**GitHub Actions → Minutes CI** běží na PR do `main` (ne na každém pushi): `pnpm install` → `generate` → `check:types`.

Lokálně před commitem:

```powershell
pnpm run check:types
```

## Windows / macOS installer (pro někoho jiného)

Pro vytvoření **instalátoru**, který můžete poslat kolegovi — NSIS `.exe` na Windows, `.dmg` na macOS (arm64):

```powershell
pnpm install
pnpm run build:minutes:installer
```

Výstup: `release/minutes/Minutes-setup-<verze>.exe` (Windows) / `release/minutes/Minutes-<verze>-mac-arm64.dmg` (macOS).

Na macOS build automaticky detekuje `darwin` a spustí `electron-builder --mac dmg --arm64` (viz `scripts/build-minutes-installer.mjs`). Instalátor je **nepodepsaný** (ad-hoc, bez Apple Developer ID) — po instalaci Gatekeeper zablokuje normální dvojklik: klikněte pravým tlačítkem na `Minutes.app` → **Otevřít**, nebo spusťte `xattr -dr com.apple.quarantine /Applications/Minutes.app`.

### Release přes GitHub Actions (doporučeno)

1. Při vývoji doplňujte **`CHANGELOG.md`** → `[Unreleased]` (Cursor rule u user-facing změn)
2. **Prod:** GitHub → Actions → **Release Minutes** → `release_channel: prod` (branch `main`)
3. **Beta (testování):** opravy na branchi `beta`, release s `release_channel: beta` → verze `8.21.0-m1.0.x-beta.N`, pre-release na GitHubu

Podrobný flow issue → beta → prod: [`docs/BETA-STAGING.md`](docs/BETA-STAGING.md). Cursor skills: `minutes-fix-confirmed-issue`, `minutes-promote-beta-to-prod`.

Workflow automaticky:

- spustí typecheck
- zvedne verzi Meetup (`8.21.0-m1.0.1` → `8.21.0-m1.0.2` hotfix, volba _minor_ / _major_ v Actions; beta bump přidá `-beta.N`)
- přesune `[Unreleased]` v CHANGELOG a vytvoří GitHub Release
- commitne bump verze do aktuální branch (`main` nebo `beta`)
- job `release-macos` (běží po `release-windows` na `macos-latest`, jen pro prod) sestaví `.dmg` a přidá ho k Release jako `Minutes-<verze>-mac-arm64.dmg` a stabilní `Minutes-mac-arm64.dmg`

4. Stabilní odkazy:  
   `https://github.com/zmitko-uni/minutes/releases/latest/download/Minutes-setup-windows-x64.exe` (Windows)  
   `https://github.com/zmitko-uni/minutes/releases/latest/download/Minutes-mac-arm64.dmg` (macOS, Apple Silicon)

Volba _Skip version bump_ — přestaví stejnou verzi (např. první release nebo oprava buildu).

**Verzování:** `{SignalDesktop}-m{MeetupSemver}` — např. `8.21.0-m1.0.1` (Signal 8.21.0, Meetup 1.0.1). Beta: `-beta.N` za Meetup částí.
Bump v Actions mění jen část za `-m`. Po merge upstream Signal aktualizuj base v `ts/minutes/version.std.ts`.

Alternativa: lokálně `pnpm run release:minutes:metadata` (prod) nebo `release:minutes:beta:metadata` (beta), commit `chore(release):`, push.

### Lokální build (vývoj)

| Co             | Windows                                                                                                                                                               | macOS                                                                                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| První build    | 15–30 min (locales, emoji, native moduly)                                                                                                                             | 15–30 min (locales, emoji, native moduly)                                                                                                                                                                |
| Požadavky      | stejné jako vývoj — Node, pnpm, VS C++ workload                                                                                                                       | stejné jako vývoj — Node, pnpm, Xcode Command Line Tools; jen Apple Silicon                                                                                                                              |
| Podpis         | **bez** code signing — SmartScreen může varovat → _Více informací_ → _Přesto spustit_                                                                                 | **bez** code signing/notarizace (ad-hoc) — Gatekeeper blokuje dvojklik → pravý klik → _Otevřít_, nebo `xattr -dr com.apple.quarantine /Applications/Minutes.app`                                         |
| Data uživatele | `%APPDATA%\Minutes` — při odinstalaci se **nemazou**                                                                                                                  | `~/Library/Application Support/Minutes` — při odinstalaci (smazání `.app`) se **nemazou**                                                                                                                |
| Aktualizace    | vypnuté (`updatesEnabled: false`) — stáhněte nový `.exe` z [Releases](https://github.com/zmitko-uni/minutes/releases/latest) a nainstalujte přes existující instalaci | vypnuté (`updatesEnabled: false`) — stáhněte nový `.dmg` z [Releases](https://github.com/zmitko-uni/minutes/releases/latest); aplikace vlastní auto-update otevře `.dmg` a vy přetáhnete do Applications |

Instalátor je vhodný pro interní/ad-hoc distribuci. Pro veřejné šíření by bylo potřeba Windows code signing certifikát.

## Output locations

| Type                                  | Windows                                      | macOS                                                            |
| ------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| Call recordings (MP3 + JSON metadata) | `%APPDATA%\Minutes\minutes\recordings\`      | `~/Library/Application Support/Minutes/minutes/recordings/`      |
| Chat summaries (MD + JSON metadata)   | `%APPDATA%\Minutes\minutes\summaries\`       | `~/Library/Application Support/Minutes/minutes/summaries/`       |
| AI settings (encrypted API key)       | `%APPDATA%\Minutes\minutes\ai-settings.json` | `~/Library/Application Support/Minutes/minutes/ai-settings.json` |
| Whisper models                        | `%APPDATA%\Minutes\minutes\whisper-models\`  | `~/Library/Application Support/Minutes/minutes/whisper-models/`  |

Menu: **Minutes → Open Call Recordings / Open Chat Summaries / AI Settings… / Příručka…**

Uživatelská příručka (součást aplikace): `images/minutes/prirucka.md` — udržujte synchronní s novými funkcemi.

## Call recording behavior

- **Přímé a skupinové hovory** — v liště jsou dvě vzájemně výlučné akce:
  - **Nahrávání zvuku** — MP3 ze smíšeného RingRTC streamu (lokální odchozí vstup + vzdálený playout)
  - **Nahrávání sdíleného videa** — WebM pouze z prezentace přenášené přes Signal a audia RingRTC; vlastní sdílení se bere z odchozího RingRTC video streamu, ne z nového snímání obrazovky; bez prezentace běží černý obraz
  - **Pause / Resume / Stop** ovládají právě aktivní režim
- Při ukončení hovoru se aktivní nahrávka automaticky uloží
- Používá Signal lame MP3 encoder worklet
- Audio recorder neotevírá samostatný mikrofon ani systémový loopback; ztlumení mikrofonu v Signalu proto vytvoří v lokální větvi nahrávky ticho

> Recording laws vary by jurisdiction — ensure participants consent.

### macOS oprávnění

- Nahrávání nevyžaduje další oprávnění nad rámec samotného Signal hovoru a případného sdílení obrazovky.
- **Microphone** používá Signal pro hovor; recorder čte až RingRTC větev, kterou Signal posílá dál.
- **Screen Recording** používá Signal jen tehdy, když uživatel skutečně sdílí obrazovku; recorder žádné druhé snímání nespouští.

## Chat summary

- **Zpráva** — pravý klik → Minutes → Summarize from here
- **Chat menu** (⋯) → Minutes → Summarize last 1h / 8h / 24h
- **Levý panel** — pravý klik na konverzaci → stejné položky + Open recordings / summaries
- **Menu** → Minutes → Summarize Current Chat (`Ctrl+Shift+U`)
- Export do `%APPDATA%\Minutes\minutes\summaries\` (markdown + JSON)
- Volitelné **AI Summary** po exportu (viz Nastavení AI)

## AI & Whisper

1. **Menu → Minutes → Nastavení AI…** — API klíče (OpenAI, Gemini, Claude, Perplexity), model, jazyk; klíč šifrovaně přes OS safeStorage
2. **Menu → Minutes → Sumarizace hovoru…** — Whisper přepis, rozšíření přepisu, volitelná AI korekce
3. Data chatu/hovoru zůstávají lokálně; do cloudu jdou jen volání zvoleného AI poskytovatele (pokud je zapnuto)

## Architecture

```
ts/minutes/
  callRecorder.dom.ts              # MP3 capture
  callRecordingService.preload.ts  # MP3 lifecycle nad RingRTC audio trackem
  ringRtcAudio*.ts                 # lokální/remote PCM, timeline, mix a AudioWorklet
  chatSummaryService.preload.ts    # chat export + AI
  whisperTranscribe.main.ts        # lokální Whisper
  aiSettings*.ts / *Summary.main.ts
  components/                      # UI modaly, recording controls
  index.preload.ts                 # bootstrap

app/minutes_channel.main.ts      # IPC: ukládání MP3 a metadata

Hooks (keep small for upstream merges):
  ts/services/calling.preload.ts   # onCallEnded
  ts/background.preload.ts         # init + menu IPC
  app/main.main.ts                 # menu + IPC channel
  app/menu.std.ts                  # Minutes menu
```

## Sync with upstream Signal

Toto repo sleduje jen **[github.com/zmitko-uni/minutes](https://github.com/zmitko-uni/minutes)**.  
Upstream [signalapp/Signal-Desktop](https://github.com/signalapp/Signal-Desktop) se mergeuje **v GitHub Actions** (Actions → _Merge Signal upstream_ → PR do `main`).

**Automaticky:** každý týden (pondělí) workflow zkontroluje nejnovější **stabilní** tag Signálu proti `MINUTES_SIGNAL_BASE_VERSION`. Pokud je novější a ještě není otevřený sync PR, spustí merge a otevře PR. Ručně jde spustit i s checkboxem **dry_run** (jen check, bez PR). Dependabot (např. Electron) to nenahrazuje — to jsou jen npm závislosti.

Podrobně: [docs/FORK-MAINTENANCE.md](docs/FORK-MAINTENANCE.md)

## Contributing

Viz **[CONTRIBUTING-MINUTES.md](CONTRIBUTING-MINUTES.md)**.

## License

AGPL-3.0-only (inherited from Signal Desktop). Minutes modifications are under the same license.
