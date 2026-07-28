# minutes — doteky upstream Signal Desktop

> **Klíčové pravidlo:** viz [`FORK-MAINTENANCE.md`](./FORK-MAINTENANCE.md)

## Povolené modifikace upstream (aktuální stav)

| Soubor | Co | Hook |
|--------|-----|------|
| `package.json` | productName, skripty, Minutes RingRTC tarball + ověřený root instalátor, závislost `@minutes/mac-audio-tap` + její `.node` v `build.files` | branding + 4 řádky |
| `scripts/utils/parseVersion.mjs` | Minutes `-m` verze pro build skripty | regex větev |
| `pnpm-workspace.yaml` | dependency install skript Minutes RingRTC je zakázaný; prebuild stahuje ověřený root instalátor | 1 řádek |
| `rolldown.config.ts` | `@minutes/mac-audio-tap` v `external` (native modul) | 1 řádek |
| `app/user_config.main.ts` | `minutes-*` userData | 1 řádek |
| `app/startup_config.main.ts` | minutes AUMID + název aplikace | pár řádků |
| `app/WindowsNotifications.main.ts` | fallback toast + log AUMID | minutes |
| `app/minutes_readme.main.ts` | načtení příručky z disku |
| `app/main.main.ts` | IPC init, menu akce, minutes ikona, test pipeline hook (`MINUTES_TEST_PIPELINE=1`) | registrace |
| `app/SystemTrayService.main.ts` | tray ikona + tooltip minutes | 2 volání |
| `app/menu.std.ts` | submenu minutes + Příručka | menu |
| `ts/types/menu.std.ts` | typy menu akcí | menu |
| `ts/services/calling.preload.ts` | `onCallEnded` při konci hovoru; `enableMacCallVoiceProcessing()` po `RingRTC.setConfig` (macOS Mic Modes) | 3 volání |
| `ts/conversations/isConversationTooBigToRing.dom.ts` | Minutes ignoruje Signal limit zvonění (≥16 členů) | import + early return |
| `ts/background.preload.ts` | init + IPC summarize, build expiration | bootstrap |
| `ts/components/CallScreen.dom.tsx` | `<MinutesCallRecordingControls />` | 1 komponenta |
| `ts/components/ChatsTab.dom.tsx` | minutes uvítací obrazovka | 1 komponenta |
| `ts/components/App.dom.tsx` | minutes host komponenty | +TranscriptionQueueHost, bez update banneru |
| `ts/components/conversation/MessageContextMenu.dom.tsx` | `onBookmarkMessage`, `onMarkUnreadFromHere`, `onAskAiOpinion` | props + items |
| `ts/components/conversation/TimelineMessage.dom.tsx` | callback záložky, nepřečteno, názor AI | callbacks |
| `app/startup_config.main.ts` | AUMID + název Minutes / Minutes Beta | releaseChannel |
| `app/user_config.main.ts` | `%APPDATA%\Minutes` vs `Minutes-Beta` | releaseChannel |
| `electron-builder.minutes.mjs` | prod vs beta instalátor | MINUTES_RELEASE_CHANNEL |
| `ts/minutes/bookmarks.std.ts` | typy záložek |
| `ts/minutes/bookmarks.main.ts` | persist JSON |
| `ts/minutes/bookmarksService.preload.ts` | add/list/navigate |
| `ts/minutes/sendAiOpinionToChat.preload.ts` | odeslání názoru AI do chatu / sobě |
| `ts/minutes/askAiOpinionService.preload.ts` | názor AI na zprávu → banner |
| `ts/minutes/aiOpinionPrompts.std.ts` | prompty pro názor AI |
| `ts/minutes/aiSummaryPrompts.std.ts` | prompty + sanitizace shrnutí chatu |
| `ts/minutes/releaseChannel.std.ts` | prod/beta kanál, data dir, updaty |
| `config/minutes-beta.json` | konfigurace profilu minutes-beta |
| `ts/minutes/components/MinutesBookmarksModal.dom.tsx` | dialog Záložky |
| `stylesheets/components/MinutesBookmarks.scss` | styly záložek |
| `ts/minutes/buildExpiration.preload.ts` | vypnutí expirace buildu |
| `ts/minutes/welcomeContent.std.ts` | texty uvítací obrazovky + dlaždice |
| `ts/minutes/components/MinutesWelcomeSplash.dom.tsx` | uvítání + 4 dlaždice |
| `ts/minutes/readmeService.preload.ts` | otevření modalu příručky |
| `ts/minutes/components/MinutesReadmeModal.dom.tsx` | modal příručky (Markdown) |
| `ts/minutes/components/MinutesMarkdown.dom.tsx` | render Markdown |
| `stylesheets/components/MinutesReadme.scss` | styly příručky |
| `stylesheets/components/MinutesStartupSplash.scss` | logo při startu aplikace |
| `images/minutes/prirucka.md` | uživatelská příručka (součást balíčku) |
| `background.html` | preload + title Minutes | startup logo |
| `loading.html` | preload ikony Minutes | migrace |

## Nové soubory (ne upstream)

| Cesta | Účel |
|-------|------|
| `ts/minutes/**` | business logika, UI komponenty |
| `ts/minutes/groupCallRing.std.ts` | override limitu zvonění skupinového hovoru |
| `app/minutes_channel.main.ts` | main-process IPC |
| `app/minutes_runtime.main.ts` | výchozí `NODE_CONFIG_ENV=minutes` pro balíček |
| `electron-builder.minutes.mjs` | NSIS profil (sloučení s package.json#build); `mac`/`dmg` bloky — arm64-only, unsigned (`identity: null`, `hardenedRuntime: false`), `afterPack` → ad-hoc podpis |
| `scripts/minutes-after-pack.mjs` | wrapper nad Signal `after-pack.mjs` — po přehození fuses ad-hoc podepíše `.app` (`codesign --force --deep --sign -`), jinak macOS zabije nepodepsaný build při startu (Code Signature Invalid) |
| `scripts/install-minutes-ringrtc.mjs` + `scripts/utils/minutesRingRtcInstall.mjs` | ověří přesný Minutes RingRTC package/version/API a teprve potom stáhne prebuild s kontrolou SHA-256 |
| `scripts/build-minutes-installer.mjs` | build instalátoru — Windows NSIS (`.exe`), macOS DMG arm64 (`.dmg`) podle `process.platform` |
| `scripts/patch-electron-icon.mjs` | ikona electron.exe pro dev na Windows |
| `ts/minutes/aiSettings.std.ts` | typy + výchozí model |
| `ts/minutes/aiSettings.main.ts` | uložení klíče (safeStorage) |
| `ts/minutes/branding.std.ts` | zobrazovaný název Minutes (centrální branding) |
| `ts/minutes/aiSummaryService.main.ts` | směrování AI sumarizace podle poskytovatele |
| `ts/minutes/localLlmSettings.std.ts` | katalog GGUF modelů Gemma |
| `ts/minutes/localLlmExtension.*` | stažení + inference lokálního LLM |
| `ts/minutes/localLlmInference.main.ts` | node-llama-cpp chat session |
| `ts/minutes/components/MinutesLocalLlmPanel.dom.tsx` | panel instalace v Nastavení AI |
| `package.json` + `rolldown.config.ts` | závislost `node-llama-cpp` (native, external); `asarUnpack` + `sleep-promise/build`; FileSet pro `build/*.json` |
| `ts/minutes/perplexitySummary.main.ts` | Perplexity API (bez web search) |
| `ts/minutes/anthropicSummary.main.ts` | Anthropic Claude API |
| `ts/minutes/aiSettingsService.preload.ts` | preload IPC wrapper |
| `ts/minutes/components/MinutesSettingsModal.dom.tsx` | dialog AI nastavení |
| `ts/minutes/components/MinutesSummaryStyleFields.dom.tsx` | styl shrnutí (Stručný / Detailní / Smart / Vlastní) + náhled promptu |
| `ts/minutes/appUpdate.*` | kontrola GitHub Releases, stažení, pending update; platform-aware asset (Windows `.exe` / macOS `Minutes-mac-arm64.dmg`, na macOS instalace = otevření dmg + quit) |
| `ts/minutes/callRecordingService.preload.ts`, `callRecordingServiceCore.std.ts` | MP3 lifecycle nad jediným RingRTC audio trackem; žádný samostatný mikrofon ani systémový loopback |
| `ts/minutes/captureCoordinator.std.ts` | vzájemné vyloučení audio/video nahrávání a společná finalizace |
| `ts/minutes/presentationSource*.ts`, `presentationAuthority.std.ts`, `usePresentationAuthority.std.ts` | bezpečný výběr pouze Signal prezentace; lokální autorita používá výhradně RingRTC tap canvas |
| `ts/minutes/screenShareCompositor.dom.ts` | černý 1920×1080/15 fps compositor s aspect-fit prezentací |
| `ts/minutes/ringRtcAudio*.ts`, `ringRtcRenderedPcmProgress.std.ts` | čtení lokálního/remote RingRTC PCM, timeline, mix a AudioWorklet track |
| `ts/minutes/ringRtcVideoTapApi.std.ts`, `ringRtcOutgoingVideoSource.preload.ts`, `ringRtcScreenShareCompositor.preload.ts` | validace API a čtení odchozího RingRTC screen-share videa |
| `ts/minutes/videoRecording*.ts` | video lifecycle, MediaRecorder, streamovaný IPC writer, stav UI a speaker-activity logger |
| `app/minutes_video_recording_channel.main.ts` | sekvenční `.webm.partial` writer + atomická finalizace videa, metadat a `.speaker-activity.json` |
| `ts/minutes/macCallVoiceProcessing.preload.ts` | macOS: zapne RingRTC VoiceProcessingIO, aby šly během hovoru měnit Mic Modes |
| `ts/minutes/unreadSummaryService.preload.ts` | přehled nepřečtených chatů → Poznámky |
| `ts/minutes/markUnreadFromMessage.preload.ts` | Nepřečteno odsud v kontextovém menu zprávy |
| `ts/sql/Server.node.ts` | `markMessagesUnreadFromAnchor` — SQL UPDATE readStatus/seenStatus |
| `ts/sql/Interface.std.ts` | typ pro `markMessagesUnreadFromAnchor` |
| `ts/minutes/components/MinutesAppUpdateBannerHost.dom.tsx` | banner aktualizace při startu |
| `ts/minutes/components/MinutesVersionFooter.dom.tsx` | patička verze na domovské obrazovce |
| `ts/minutes/components/MinutesSummaryToastHost.dom.tsx` | toast + odeslání do chatu |
| `stylesheets/components/MinutesSummaryToast.scss` | styly toastu |
| `stylesheets/manifest.scss` | import SCSS | 1 řádek |
| `ts/minutes/callSummaryExtension.std.ts` | typy rozšíření Sumarizace hovoru |
| `ts/minutes/callSummaryExtension.main.ts` | stažení modelu, přepis, uložení |
| `ts/minutes/whisperSettings.std.ts` | jazyk cs, prompt, výchozí Whisper model |
| `ts/minutes/audioPcm.dom.ts` | MP3 → PCM přes Web Audio (bez ffmpeg) |
| `ts/minutes/callSummaryExtensionService.preload.ts` | stav rozšíření + instalace |
| `ts/minutes/callTranscriptionService.preload.ts` | pipeline po uložení nahrávky |
| `ts/minutes/components/MinutesCallSummaryExtensionModal.dom.tsx` | dialog instalace |
| `stylesheets/components/MinutesCallSummaryExtension.scss` | styly dialogu |
| `app/minutes_icon.main.ts` | cesta k minutes ikoně |
| `app/minutes_tray.main.ts` | tray ikona + tooltip minutes |
| `images/minutes/app-icon-source.png` | zdrojová ikona Minutes (M + skupina) |
| `scripts/generate-minutes-icons.mjs` | generuje .ico + PNG velikosti; na macOS navíc `.icns` přes `iconutil` (`build/icons/minutes/mac/icon.icns`) |
| `packages/mac-audio-tap/**` | native workspace balíček — ScreenCaptureKit binding pro systémové audio na macOS (13+) |
| `ts/minutes/macLoopbackAudio.preload.ts` | renderer wrapper nad `@minutes/mac-audio-tap` (loopback MediaStream) |
| `setup-minutes.sh`, `start-minutes.sh`, `start-minutes-quick.sh`, `minutes-quality-gate.sh`, `test-call-pipeline.sh`, `prepare-minutes-release.sh`, `build-minutes-release.sh` | macOS obdoby `.bat` skriptů (Xcode Command Line Tools místo Visual Studio) |
| `scripts/minutes-ensure-pnpm.sh`, `minutes-control/_ensure-pnpm.bat` | kontrola pinu pnpm (`packageManager`, teď 11.5.2) — novější globální pnpm v tomto repo spadne |
| `scripts/generate-minutes-tray-icons.mjs` | tray ikony (base + badge) |
| `images/tray-icons/base/minutes-tray-icon-*` | vygenerované tray ikony |
| `images/tray-icons/alert/minutes-tray-icon-*` | tray ikony s počtem nepřečtených |
| `build/icons/minutes/**` | vygenerované ikony (gitignore volitelně) |
| `.github/workflows/minutes-ci.yml` | CI: generate + check:types (jen PR / ruční spuštění) |
| `.github/workflows/minutes-release.yml` | release instalátoru + GitHub Release; job `release-macos` (po `release-windows`, `macos-latest`) přidá `Minutes-<verze>-mac-arm64.dmg` + stabilní `Minutes-mac-arm64.dmg` |
| `.github/workflows/minutes-merge-upstream.yml` | merge Signal upstream → PR; týdenní check nového stabilního tagu (`scripts/check-signal-upstream.mjs`) |
| `scripts/resolve-upstream-conflicts.mjs` + `scripts/utils/mergePackageJson.mjs` | konzervativní automatické řešení pouze známých upstream konfliktů |
| `scripts/update-minutes-signal-base.mjs` | aktualizace package verze a obou konstant Signal base po merge |
| `scripts/extract-changelog-release.mjs` | release notes z CHANGELOG.md |
| `CHANGELOG.md` | uživatelský changelog verzí |
| `CONTRIBUTING-MINUTES.md` | pravidla pro PR do Minutes |
| `.github/ISSUE_TEMPLATE/config.yml` | Minutes issue odkazy (místo Signal) |
| `.github/ISSUE_TEMPLATE/bug_report_minutes.yaml` | šablona bug reportu |
| `.github/ISSUE_TEMPLATE/feature_request_minutes.yaml` | šablona feature requestu |
