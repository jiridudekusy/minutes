# minutes — doteky upstream Signal Desktop

> **Klíčové pravidlo:** viz [`FORK-MAINTENANCE.md`](./FORK-MAINTENANCE.md)

## Povolené modifikace upstream (aktuální stav)

| Soubor | Co | Hook |
|--------|-----|------|
| `package.json` | productName, skripty, MCP SDK a Minutes RingRTC tarball + ověřený root instalátor | branding + závislosti |
| `scripts/utils/parseVersion.mjs` | Minutes `-m` verze pro build skripty | regex větev |
| `pnpm-workspace.yaml` | dependency install skript Minutes RingRTC je zakázaný; prebuild stahuje ověřený root instalátor | 1 řádek |
| `app/user_config.main.ts` | `minutes-*` userData | 1 řádek |
| `app/startup_config.main.ts` | minutes AUMID + název aplikace | pár řádků |
| `app/WindowsNotifications.main.ts` | fallback toast + log AUMID | minutes |
| `app/minutes_readme.main.ts` | načtení příručky z disku |
| `app/main.main.ts` | IPC init, menu akce, minutes ikona, test pipeline hook (`MINUTES_TEST_PIPELINE=1`), schéma `minutesmedia` v `registerSchemesAsPrivileged`, `backgroundThrottling: false` na hlavním okně (bez toho Chromium zpomalí časovač, který vyčítá RingRTC audio tap, a nahrávka hovoru na pozadí přijde o ~90 % zvuku) | registrace + 1 řádek `webPreferences` |
| `app/SystemTrayService.main.ts` | tray ikona + tooltip minutes | 2 volání |
| `app/menu.std.ts` | submenu Minutes + Příručka/MCP | menu |
| `ts/types/menu.std.ts` | typy menu akcí | menu |
| `ts/services/calling.preload.ts` | `onCallEnded` při konci hovoru; `enableMacCallVoiceProcessing()` po `RingRTC.setConfig` (macOS Mic Modes). Signal 8.26 `GroupCallSvcConfig` se nepředává — Minutes RingRTC je `2.70.2-minutes.3` (nahrávací tapy), ne stock 2.71.0. Až to bude potřeba: [`FORK-MAINTENANCE.md`](./FORK-MAINTENANCE.md) → *Minutes RingRTC vs Signal 2.71.0* | 3 volání |
| `ts/conversations/isConversationTooBigToRing.dom.ts` | Minutes ignoruje Signal limit zvonění (≥16 členů) | import + early return |
| `ts/background.preload.ts` | init Minutes služeb, automation rendereru, IPC sumarizace, build expiration a ochrana aktivního hovoru při zamknutí obrazovky | bootstrap |
| `ts/messages/saveAndNotify.preload.ts` | publikuje `message.received` do explicitně povolených webhooků | webhook hook |
| `ts/components/CallScreen.dom.tsx` | `<MinutesCallRecordingControls />` | 1 komponenta |
| `ts/components/ChatsTab.dom.tsx` | minutes uvítací obrazovka | 1 komponenta |
| `ts/components/App.dom.tsx` | minutes host komponenty | +TranscriptionQueueHost, bez update banneru |
| `ts/types/Nav.std.ts` | hodnoty `NavTab.MinutesTranscripts` a `NavTab.MinutesBookmarks` (spadnou do obecné větve `Location` bez `details`) | 2 řádky enumu |
| `ts/components/NavTabs.dom.tsx` | taby Přepisy a Záložky za Hovory — 2× `NavTabsItem` + 2× `TabPanel` + 2 render props. Popisky z `ts/minutes/navTabs.std.ts` | import + 2 položky |
| `ts/components/Inbox.dom.tsx`, `ts/state/smart/Inbox.preload.tsx`, `ts/state/smart/NavTabs.preload.tsx` | protažení render props `renderMinutesTranscriptsTab` / `renderMinutesBookmarksTab` | plumbing |
| `ts/components/NavTabs.dom.stories.tsx` | mock nových render props | 2 řádky |
| `.storybook/preview.tsx` | `withMutedUntilDialogProvider` bere `i18n` z modulu a běží až uvnitř `withAppProvider` (jinak Storybook spadne na `window.SignalContext`) | 2 řádky |
| `ts/components/conversation/ConversationHeader.dom.tsx` | `MinutesDropdownMenuItems` ve 3 variantách nabídky + `<MinutesConversationHeaderButton />` v liště akcí (tlačítko „M“ → Přepisy daného chatu) | 2 importy + 4 řádky |
| `ts/components/leftPane/LeftPaneConversationListItemContextMenu.dom.tsx` | `MinutesContextMenuItems` v kontextové nabídce chatu v levém seznamu | import + 1 řádek |
| `ts/components/conversation/MessageContextMenu.dom.tsx` | `onBookmarkMessage`, `onMarkUnreadFromHere`, `onAskAiOpinion` + kontextové copy/forward | props + items |
| `ts/components/conversation/TimelineMessage.dom.tsx` | callback záložky, nepřečteno, názor AI a kontextové copy/forward | callbacks |
| `ts/components/conversation/SelectModeActions.dom.tsx` | Minutes akce kopírování a přeposlání vybraných zpráv s autorem a časem | 1 komponenta |
| `ts/state/ducks/globalModals.preload.ts` | obecný volitelný transform draftu před otevřením forward modalu | forwarding hook |
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
| `ts/minutes/components/MinutesBookmarksTab.dom.tsx` | tab Záložky (seznam + hledání + náhled zprávy) |
| `ts/minutes/components/MinutesTranscriptsTab.dom.tsx` | tab Přepisy — seznam nahrávek s frontou, hledáním a filtry |
| `ts/minutes/components/MinutesRecordingDetail.dom.tsx` | detail nahrávky: přehled, akce, taby Shrnutí / Přepis / Nahrávka |
| `ts/minutes/components/MinutesTranscriptView.dom.tsx` | vizualizace přepisu — barvy řečníků a `**tučně**` |
| `ts/minutes/components/MinutesSummaryEditor.dom.tsx` | richtext editace shrnutí (tučně, kurzíva, odrážky, odkazy) → zpět do Markdownu |
| `ts/minutes/components/MinutesIcon.dom.tsx`, `ts/minutes/components/MinutesIconButton.dom.tsx` | inline ikony, čtverečková tlačítka a popover s volbami |
| `ts/minutes/transcriptDisplay.std.ts` | rozpad přepisu na segmenty (řečník, čas, text) a stabilní barvy řečníků |
| `ts/minutes/richTextMarkdown.dom.ts` | Markdown ↔ HTML pro `contenteditable` v editoru shrnutí |
| `ts/minutes/aiModelChoices.std.ts` | seznam nastavených AI modelů pro jednorázovou volbu při přegenerování |
| `ts/minutes/components/MinutesConfirmDialog.dom.tsx` | jedno potvrzení nevratných akcí (mazání nahrávky, odebrání záložky) |
| `ts/minutes/components/MinutesConversationHeaderButton.dom.tsx` | tlačítko „M“ v hlavičce chatu → Přepisy zúžené na daný chat |
| `ts/minutes/taskRecipients.preload.ts` | seznam chatů a párování jména na chat (dřív příjemci úkolů ze schůzky) |
| `ts/minutes/recordingFiles.main.ts`, `ts/minutes/recordingFilesService.preload.ts` | smazání nahrávky se všemi soubory, uložení upraveného shrnutí |
| `ts/minutes/components/MinutesRecordingPlayer.dom.tsx` | přehrávač audia a videa nad schématem `minutesmedia` |
| `ts/minutes/recordingsListModel.std.ts` | sloučení katalogu s běžícími joby, řazení a filtry seznamu |
| `ts/minutes/transcriptionStatusFormat.std.ts` | společné formátování stavu, ETA a délky (tab i plovoucí pilulka) |
| `ts/minutes/friendlyError.std.ts` | jedno místo pro překlad technických chyb (IPC, AI poskytovatelé, fs) na hlášky s doporučením |
| `ts/minutes/recordingMedia.std.ts`, `ts/minutes/recordingMediaProtocol.main.ts` | schéma `minutesmedia` s podporou Range; cesty jsou omezené na složku nahrávek |
| `ts/minutes/recordingsSearch.std.ts`, `ts/minutes/recordingsSearch.main.ts`, `ts/minutes/recordingsSearchService.preload.ts` | fulltext v `.transcript.md` / `.summary.md` s cache podle mtime |
| `ts/minutes/navTabs.std.ts`, `ts/minutes/navTabsService.preload.ts` | popisky tabů + přepnutí lokace z rendereru |
| `stylesheets/components/MinutesNavTabs.scss` | řádky gridu a ikony tabů; **musí se načítat za** upstream `NavTabs.scss` |
| `stylesheets/components/MinutesBookmarksTab.scss` | styly tabu Záložky |
| `stylesheets/components/MinutesTranscriptsTab.scss` | styly tabu Přepisy (seznam, detail, přehrávač, přepis, editor shrnutí) |
| `stylesheets/components/MinutesControls.scss` | ikonová tlačítka a popover s volbami (Přepisy i Záložky) |
| `ts/minutes/buildExpiration.preload.ts` | vypnutí expirace buildu |
| `ts/minutes/welcomeContent.std.ts` | texty uvítací obrazovky + dlaždice |
| `ts/minutes/components/MinutesWelcomeSplash.dom.tsx` | uvítání + 4 dlaždice |
| `ts/minutes/readmeService.preload.ts` | otevření modalu příručky |
| `ts/minutes/components/MinutesReadmeModal.dom.tsx` | modal příručky (Markdown) |
| `ts/minutes/components/MinutesMarkdown.dom.tsx` | render Markdown |
| `stylesheets/components/MinutesReadme.scss` | styly příručky |
| `stylesheets/components/MinutesStartupSplash.scss` | logo při startu aplikace |
| `images/minutes/prirucka.md` | uživatelská příručka (součást balíčku) |
| `background.html` | preload + title Minutes; `minutesmedia:` v CSP `media-src` (přehrávání nahrávek v tabu Přepisy) | startup logo |
| `loading.html` | preload ikony Minutes | migrace |

## Nové soubory (ne upstream)

| Cesta | Účel |
|-------|------|
| `ts/minutes/**` | business logika, UI komponenty |
| `ts/minutes/groupCallRing.std.ts` | override limitu zvonění skupinového hovoru |
| `app/minutes_channel.main.ts` | main-process IPC |
| `app/minutes_runtime.main.ts` | výchozí `NODE_CONFIG_ENV=minutes` pro balíček |
| `electron-builder.minutes.mjs` | NSIS profil (sloučení s package.json#build), per-user instalátor (`perMachine: false`) kvůli auto-update; `mac`/`dmg` bloky — arm64-only, unsigned (`identity: null`, `hardenedRuntime: false`), `afterPack` → ad-hoc podpis |
| `scripts/minutes-after-pack.mjs` | wrapper nad Signal `after-pack.mjs` — po přehození fuses ad-hoc podepíše `.app` (`codesign --force --deep --sign -`), jinak macOS zabije nepodepsaný build při startu (Code Signature Invalid) |
| `scripts/install-minutes-ringrtc.mjs` + `scripts/utils/minutesRingRtcInstall.mjs` | ověří přesný Minutes RingRTC package/version/API a teprve potom stáhne prebuild s kontrolou SHA-256 |
| `scripts/build-minutes-installer.mjs` | build instalátoru — Windows NSIS (`.exe`), macOS DMG arm64 (`.dmg`) podle `process.platform` |
| `scripts/check-minutes-preload.mjs`, `scripts/minutes-bundle-check.oxlintrc.json` | kontrola neexistujících generovaných module initializerů v produkčním preloadu; CI i balení instalátorů selže před publikací nefunkčního buildu |
| `config/minutes_ffmpeg_artifacts.json`, `ts/minutes/videoMp4Support.*` | systémový FFmpeg s kontrolou kodeků nebo volitelně stažená a SHA-256/nonfree ověřená GPL podpora pro macOS ARM64 / Windows x64 / Linux x64 |
| `ts/minutes/videoMp4Export.*` | bezpečný, zrušitelný a atomický export kanonického WebM do H.264/AAC MP4 s průběhem; FFmpeg není součástí instalátoru |
| `scripts/patch-electron-icon.mjs` | ikona electron.exe pro dev na Windows |
| `ts/minutes/aiSettings.std.ts` | typy + výchozí model |
| `ts/minutes/aiSettings.main.ts` | uložení klíče (safeStorage) |
| `ts/minutes/branding.std.ts` | zobrazovaný název Minutes (centrální branding) |
| `ts/minutes/aiSummaryService.main.ts` | směrování AI sumarizace podle poskytovatele |
| `ts/minutes/localLlmSettings.std.ts` | katalog GGUF modelů Gemma |
| `ts/minutes/localLlmExtension.*` | stažení + inference lokálního LLM |
| `ts/minutes/localLlmInference.main.ts` | node-llama-cpp chat session |
| `ts/minutes/localLlmContextSize.std.ts`, `localLlmReasoning.std.ts`, `callSummaryCredentials.std.ts` | kontext/reasoning lokálního LLM a shrnutí bez cloudového API klíče |
| `ts/minutes/components/MinutesLocalLlmPanel.dom.tsx` | panel instalace v Nastavení AI |
| `ts/minutes/components/MinutesDraggableSurface.dom.tsx`, `draggableSurface.std.ts` | přesouvání Minutes dialogů myší i klávesnicí |
| `ts/minutes/components/MinutesAutomationSettings*.dom.tsx`, `stylesheets/components/MinutesAutomationSettings.scss` | nastavení MCP URL, tokenu, úrovní oprávnění nástrojů a roztahovatelného dialogu |
| `ts/minutes/automation/toolCatalog.std.ts` | katalog MCP nástrojů včetně úrovně čtení / běžný zápis / destruktivní zápis |
| `ts/minutes/automation/messageMentionAutomation.std.ts` | validace MCP zmínek podle ID členů skupiny, převod UTF-16 úseků textu na nativní Signal mention body ranges; popis API v `docs/MCP-MENTIONS.md` |
| `ts/minutes/screenLockCallPolicy.std.ts` | zachování aktivního hovoru při zamknutí obrazovky |
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
| `ts/minutes/ringRtcAudio*.ts`, `ringRtcPcmChunker.std.ts`, `ringRtcRenderedPcmProgress.std.ts` | čtení lokálního/remote RingRTC PCM, timeline, mix, AudioWorklet track a streamované PCM bloky pro speaker activity i přepis videa |
| `ts/minutes/recordingsDirectory.node.ts` | centrální `~/Documents/Minutes` cesta a bezpečná migrace legacy nahrávek bez přepisování |
| `ts/minutes/ringRtcVideoTapApi.std.ts`, `ringRtcOutgoingVideoSource.preload.ts`, `ringRtcScreenShareCompositor.preload.ts` | validace API a čtení odchozího RingRTC screen-share videa |
| `ts/minutes/videoRecording*.ts` | video lifecycle, MediaRecorder, streamovaný WebM/PCM IPC writer, automatický přepis, stav UI a speaker-activity logger |
| `app/minutes_video_recording_channel.main.ts` | sekvenční `.webm.partial` + `.pcm.f32.partial` writer a atomická finalizace videa, PCM, metadat a `.speaker-activity.json` |
| `ts/minutes/recordingArtifacts.std.ts` | společné odvozování PCM, přepisu a shrnutí pro MP3 i WebM |
| `ts/minutes/recordingPcmReader.node.ts` | blokové čtení a převzorkování dlouhých PCM sidecarů pro Whisper |
| `ts/minutes/macCallVoiceProcessing.preload.ts` | macOS: zapne RingRTC VoiceProcessingIO, aby šly během hovoru měnit Mic Modes |
| `ts/minutes/unreadSummaryService.preload.ts` | přehled nepřečtených chatů → Poznámky |
| `ts/minutes/markUnreadFromMessage.preload.ts` | Nepřečteno odsud v kontextovém menu zprávy |
| `ts/minutes/contextForward.std.ts`, `contextForward.preload.ts`, `components/MinutesSelectModeContextActions.dom.tsx` | kopírování a vizuálně odlišené přeposlání zpráv se jménem a časem; kontextová varianta má vlastní titulek dialogu |
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
| `setup-minutes.sh`, `start-minutes.sh`, `start-minutes-quick.sh`, `minutes-quality-gate.sh`, `test-call-pipeline.sh`, `prepare-minutes-release.sh`, `build-minutes-release.sh` | macOS obdoby `.bat` skriptů (Xcode Command Line Tools místo Visual Studio) |
| `scripts/minutes-ensure-pnpm.sh`, `minutes-control/_ensure-pnpm.bat` | kontrola pinu pnpm (`packageManager`, teď 11.5.2) — novější globální pnpm v tomto repo spadne |
| `scripts/generate-minutes-tray-icons.mjs` | tray ikony (base + badge) |
| `images/tray-icons/base/minutes-tray-icon-*` | vygenerované tray ikony |
| `images/tray-icons/alert/minutes-tray-icon-*` | tray ikony s počtem nepřečtených |
| `build/icons/minutes/**` | vygenerované ikony (gitignore volitelně) |
| `.github/workflows/minutes-ci.yml` | CI: generate + check:types a macOS smoke test Minutes RingRTC prebildu (jen PR / ruční spuštění) |
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
