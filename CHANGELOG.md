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

### Fixed

- **MCP zprávy**: `get_messages`, `get_message` a `search_messages` vracejí textové zmínky jako čitelná jména kontaktů místo prázdných zástupných znaků

## [8.26.0-m1.6.3-beta.3] - 2026-10-11

### Added

- (doplňte před příštím release)

### Changed

- **Volání a nahrávání**: beta používá Minutes RingRTC `2.71.0-minutes.1`, založené na Signal RingRTC 2.71.0, se zachovanými audio a video tapy pro nahrávání

## [8.26.0-m1.6.3-beta.2] - 2026-10-09

### Added

- **MCP hlasování**: nástroj `create_poll` vytvoří Signal anketu se 2–10 možnostmi a volitelným vícenásobným výběrem; `vote_poll` odešle, změní nebo odebere vlastní hlas a `get_poll_results` průběžně vrací počty hlasů, procenta, hlasující a stav ukončení. Výsledky ankety jsou také součástí `get_message`

## [8.26.0-m1.6.3-beta.1] - 2026-10-05

### Added

- **Shrnutí nahrávky**: tlačítko **Kopírovat** vloží text do schránky i s formátováním (tučně, odrážky, nadpisy). Stejně se chová označení a **Ctrl+C**, takže shrnutí jde vložit třeba do dokumentu v Plus4U

### Fixed

- **Aktualizace**: **Restartovat a nainstalovat** už nespadne s chybou Spawn UNKNOWN. Instalátor se otevře přes Windows (SmartScreen, případné potvrzení). Poškozený nebo zastaralý soubor po smazaném release se zahodí a nabídne se nové stažení

## [8.26.0-m1.6.3] - 2026-10-02

### Fixed

- **Nahrávka hovoru už neutichne až do konce po krátkém zaseknutí** ([#55](https://github.com/zmitko-uni/minutes/issues/55)) — když se nahrávání pod zátěží počítače zpozdilo o víc než sekundu, zbytek hovoru se uložil jako digitální ticho a přepis pokryl jen začátek. Nahrávání se teď po zaseknutí vrátí k aktuálnímu zvuku — chybí jen těch pár sekund, kdy bylo zaseknuté, zbytek hovoru se nahraje a zůstane časově přesný (sedí řečníci v přepisu i zvuk k obrazu u videa). Varování o poškozené nahrávce v přepisu už neodkazuje jen na minimalizované okno

### Removed

- **Plus4U, Vizitky a zápis ke schůzce** v aplikaci nejsou — ani v menu, ani v nastavení, ani u nahrávky. Uložené přístupové údaje se při startu smažou

## [8.26.0-m1.6.0-beta.5] - 2026-10-02

### Fixed

- **Nahrávka hovoru už neutichne až do konce po krátkém zaseknutí** ([#55](https://github.com/zmitko-uni/minutes/issues/55)) — když se nahrávání pod zátěží počítače zpozdilo o víc než sekundu, zbytek hovoru se uložil jako digitální ticho a přepis pokryl jen začátek. Nahrávání se teď po zaseknutí vrátí k aktuálnímu zvuku — chybí jen těch pár sekund, kdy bylo zaseknuté, zbytek hovoru se nahraje a zůstane časově přesný (sedí řečníci v přepisu i zvuk k obrazu u videa). Varování o poškozené nahrávce v přepisu už neodkazuje jen na minimalizované okno

### Removed

- **Plus4U, Vizitky a zápis ke schůzce** v aplikaci nejsou — ani v menu, ani v nastavení, ani u nahrávky. Uložené přístupové údaje se při startu smažou

## [8.26.0-m1.6.0-beta.4] - 2026-10-02

### Fixed

- **Nahrávka hovoru už neutichne až do konce po krátkém zaseknutí** ([#55](https://github.com/zmitko-uni/minutes/issues/55)) — když se nahrávání pod zátěží počítače zpozdilo o víc než sekundu, zbytek hovoru se uložil jako digitální ticho a přepis pokryl jen začátek. Nahrávání se teď po zaseknutí vrátí k aktuálnímu zvuku — chybí jen těch pár sekund, kdy bylo zaseknuté, zbytek hovoru se nahraje a zůstane časově přesný (sedí řečníci v přepisu i zvuk k obrazu u videa). Varování o poškozené nahrávce v přepisu už neodkazuje jen na minimalizované okno

### Removed

- **Plus4U** je v této verzi vypnuté — přístupové kódy ani přihlášení přes prohlížeč se nenastavují a uložená tajemství se při startu smažou. Zmizely **Vizitky**, záložka **Schůzka** u nahrávky a zápis shrnutí ke schůzce

## [8.26.0-m1.6.2] - 2026-10-02

### Fixed

- **Nahrávka hovoru už neutichne až do konce po krátkém zaseknutí** ([#55](https://github.com/zmitko-uni/minutes/issues/55)) — když se nahrávání pod zátěží počítače zpozdilo o víc než sekundu, zbytek hovoru se uložil jako digitální ticho a přepis pokryl jen začátek. Nahrávání se teď po zaseknutí vrátí k aktuálnímu zvuku — chybí jen těch pár sekund, kdy bylo zaseknuté, zbytek hovoru se nahraje a zůstane časově přesný (sedí řečníci v přepisu i zvuk k obrazu u videa). Varování o poškozené nahrávce v přepisu už neodkazuje jen na minimalizované okno

### Removed

- **Plus4U** je v této verzi vypnuté — přístupové kódy ani přihlášení přes prohlížeč se nenastavují a uložená tajemství se při startu smažou. Zmizely **Vizitky**, záložka **Schůzka** u nahrávky a zápis shrnutí ke schůzce

## [8.26.0-m1.6.0-beta.3] - 2026-09-24

### Added

- **MCP**: nový nástroj `add_contact` vyhledá registrovaný Signal kontakt podle přesného telefonního čísla v mezinárodním formátu E.164 nebo podle Signal username a přidá ho do lokálního seznamu konverzací

## [8.26.0-m1.6.1] - 2026-09-18

### Added

- **MCP**: nový nástroj `add_contact` vyhledá registrovaný Signal kontakt podle přesného telefonního čísla v mezinárodním formátu E.164 nebo podle Signal username a přidá ho do lokálního seznamu konverzací

## [8.26.0-m1.6.0-beta.2] - 2026-09-17

### Added

- **Nahrávání zvuku**: po pádu nebo vynuceném ukončení Minutes se při dalším startu pokusí dokončit rozepsanou nahrávku (bez rozlišení mluvčích, pokud se nepodařilo uložit log řečníků)
- **Plus4U integrace**: přihlášení přes prohlížeč s 2FA jako fallback, když přístupové kódy nestačí — automaticky při **Otestovat připojení** a při prvním použití Plus4U (vizitky, schůzky, zápis)
- **Plus4U přihlášení**: než se otevře prohlížeč, Minutes se zeptá dialogem **Otevřít prohlížeč / Zrušit**
- **Stahování modelů**: v **Nastavení AI** (lokální Gemma) a **Nastavení přepisů** (Whisper) uvidíte při stahování průběh — kolik už je staženo z celkové velikosti, rychlost a odhad zbývajícího času

### Fixed

- **Dlouhé nahrávání zvuku** (hodiny) už nespadne kvůli nedostatku paměti — MP3 a PCM se průběžně zapisují na disk místo držení celé nahrávky v paměti okna
- **Plus4U přihlášení**: dialog **Otevřít prohlížeč / Zrušit** se objeví jen jednou. Dřív vyskočil zvlášť pro každý paralelní požadavek (typicky při otevření **Vizitek**, kde se fotka načítá pro každou osobu samostatně)
- **Nastavení AI** a **Nastavení přepisů**: rozbalovací nabídky (model, GPU, režim přepisu…) jsou v tmavém režimu znovu čitelné; vstupní pole mají správné pozadí a ohraničení
- **Nastavení přepisů**: dialog se při vyšším zoomu nebo DPI vejde do okna — tlačítka dole zůstávají vidět a obsah se scrolluje uvnitř dialogu

### Changed

- **Nastavení AI → Plus4U**: jen **Otestovat připojení** (uloží kódy, ověří přístup, při 2FA otevře prohlížeč); integrace funguje i s browser relací bez access codes
- **Plus4U v aplikaci**: místo technické chyby IPC rozumná hláška; při potřebě přihlášení se otevře prohlížeč (vizitky, kalendář, zápis)
- **Plus4U přihlášení přes prohlížeč**: po dokončení v prohlížeči stejná stránka **showAuthorizationCode** jako u Init Data Loaderu (místo prostého textu na localhostu)

## [8.26.0-m1.6.0-beta.1] - 2026-09-16

### Added

- **Vizitky**: hledá se nově i v **Plus4U People**, ne jen v uuBEM. Osobu, kterou vrátí oba zdroje, Minutes spojí podle uuIdentity do jedné vizitky a v detailu ukáže údaje z obou — u každého telefonu a e-mailu je štítek, odkud pochází; stejná hodnota z obou zdrojů je v seznamu jen jednou
- **Vizitky**: když se Signal kontakty nebo telefony obou zdrojů liší, místo jednoho tlačítka **Napsat zprávu** se nabídne tlačítko za každý kontakt (s popiskem zdroje), ať si vyberete, kterému zkusit napsat. Bez vyplněného Signal kontaktu Minutes nabídne telefonní čísla
- **Vizitky**: nad hledáním je **Vaše vizitka** s fotkou — kliknutím zobrazíte svůj vlastní detail stejně jako u kohokoliv jiného
- **Vizitky**: když jeden ze zdrojů neodpoví, hledání i detail běží dál s druhým a nad seznamem (resp. v detailu) je o tom poznámka
- **Vizitky**: pod hledáním jsou přepínače zdrojů **uuBEM** a **Plus4U People** (oba zapnuté). Vypnutý zdroj se vůbec nedotazuje, takže filtr hledání i zrychlí; v detailu se ale vždy ukáže všechno, co se o osobě ví
- **Vizitky**: seznam ukazuje prvních 50 osob a napíše, kolik jich dotazu odpovídá celkem — Plus4U People na obecné jméno vrací i stovky lidí

### Changed

- **Vizitky**: pole hledání se jmenuje **Hledat osobu v uuBEM a Plus4U People** a položka v menu Minutes **Vizitky (uuBEM + Plus4U People)** — obojí kvůli druhému zdroji
- **Vizitky**: v seznamu výsledků je u každé osoby štítek zdroje (uuBEM / Plus4U People)

## [8.26.0-m1.5.0-beta.2] - 2026-09-15

### Fixed

- **Nahrávání hovoru na pozadí už nepřichází o zvuk** — pokud bylo okno Minutes během hovoru minimalizované, Windows/Chromium zpomalil vnitřní časovač aplikace a do nahrávky se zapsalo jen asi 10 % zvuku, zbytek bylo digitální ticho (delší hovory někdy utichly úplně). Nahrávka i přepis jsou teď kompletní i při minimalizovaném okně; stejná příčina postihovala i nahrávání sdíleného videa
- Poškozenou nahrávku už poznáte na první pohled: pokud se část zvuku nezachytila, přepis začíná varováním s údajem, kolik procent nahrávky chybí

## [8.26.0-m1.5.0-beta.1] - 2026-09-13

### Added

- **Vizitky (uuBEM)**: nový tab v levé navigaci a položka **Vizitky (uuBEM)** v menu Minutes (pod **Záložky**) — hledání osob v uuBEM, po kliknutí na výsledek se zobrazí vizitka s telefony, e-maily a adresami
- **Vizitky (uuBEM)**: má-li vizitka vyplněný Signal kontakt, je nahoře tlačítko **Napsat zprávu**, které rovnou otevře chat s danou osobou (rozpozná Signal username, telefon i odkaz signal.me)
- **Vizitky (uuBEM)**: u osob se načítá **fotka z Plus4U** — v seznamu výsledků i v detailu vizitky; kdo fotku nemá, má dál kolečko s iniciálami
- **Vizitky (uuBEM)**: tlačítko **Sdílet vizitku** — vyjede pole, ve kterém najdete svůj Signal kontakt, a vizitka se mu pošle do chatu jako přehledný text (jméno, uuIdentity, telefony, e-maily, adresy, Signal kontakt a odkaz do uuBEM)
- **Vizitky (uuBEM)**: v detailu je tlačítko **Otevřít v uuBEM**, které vizitku ukáže ve prohlížeči (tam se dají údaje i doplnit)
- **Vizitky (uuBEM)**: u vizitky bez kontaktů detail rovnou napíše, že uuBEM o osobě víc než jméno a uuIdentity nevede
- **Vizitky (uuBEM)**: sekce se ukazuje jen se zapnutou integrací Plus4U (access code 1 a 2 v **Nastavení AI**)

## [8.26.0-m1.4.0-beta.1] - 2026-09-13

### Added

- **Přepisy**: v seznamu nahrávek je nový štítek **Schůzka** u nahrávek, které už mají zápis v Plus4U
- **Přepisy**: nález hledání pod nahrávkou jde **rozkliknout** — detail se otevře na správné záložce (**Shrnutí** nebo **Přepis**), nález se zvýrazní a stránka na něj doskroluje
- **Přepisy**: když je v jedné nahrávce nálezů víc, je pod úryvkem počítadlo **1 z 3 nálezů** se šipkami pro listování mezi nimi
- **Přepisy → Schůzka**: tlačítko **Zapsat ke schůzce Plus4U** je teď i v tabu **Schůzka** (u nahrávky, která zápis už má, jako **Zapsat k jiné schůzce**)

### Changed

- **Přepisy**: tab **Schůzka** je vidět vždy — u nahrávky bez zápisu vysvětlí, co se stane, a nabídne zápis založit
- **Přepisy**: z hlavičky detailu zmizel odznak **Schůzka ✓** — totéž je vidět ze štítku v seznamu a z tabu **Schůzka**

### Fixed

- **Přepisy**: text přepisu, shrnutí i textů schůzky jde označit myší a zkopírovat (**Ctrl+C**) — dosud to blokovalo globální nastavení vzhledu aplikace

## [8.26.0-m1.3.1-beta.3] - 2026-09-12

### Added

- **Záložky**: po najetí na položku v seznamu se vpravo objeví dvě tlačítka — **Otevřít v chatu** a **Odebrat záložku**
- **Přepisy → Shrnutí**: pod ikonou voleb si můžete pro jedno přegenerování vybrat **jiný AI model** (z těch, co máte nastavené) a **jiný styl** (Stručný, Detailní, Smart, Vlastní), aniž byste měnili Nastavení AI
- **Přepisy → Shrnutí**: tlačítko pro **úpravu textu shrnutí** — jednoduchý editor s tučně, kurzívou, odrážkami, číslováním a odkazy; uloží se zpátky do souboru shrnutí u nahrávky
- **Přepisy → Přepis**: pod ikonou voleb se dá vybrat **konkrétní stažený model přepisu**; když není stažený žádný, je ikona zašedlá a tooltip řekne, kde ho v nastavení přidat
- **Přepisy → Přepis**: přepis se zobrazuje jako dialog — každý **řečník má svou barvu**, nad textem je legenda a `**text**` se vykreslí tučně
- **Přepisy**: nové tlačítko **koše** smaže nahrávku včetně všech souborů (zvuk/video, přepis, shrnutí, MP4, metadata) — vždy se nejdřív zeptá
- **Přepisy**: po zápisu ke schůzce se v detailu objeví tab **Schůzka** se základními informacemi (den, čas, místo, organizátor, kdy se zápis vložil) a odkazem do prohlížeče; informace jdou znovu načíst z Plus4U
- **Chat**: v hlavičce každého chatu je nové tlačítko **M**, které otevře **Přepisy** zúžené jen na nahrávky z toho chatu (jeden chat jich může mít víc); zúžení se zruší tlačítkem **Zobrazit vše**
- **Přepisy**: po najetí na nahrávku v seznamu se vpravo objeví tlačítko **Otevřít chat této nahrávky**
- **Přepisy → Schůzka**: tlačítko **Nasdílet zápis do chatu** pošle zápis do chatu, ze kterého nahrávka je
- **Přepisy → Schůzka**: pokud máte schůzku vyřešit vy (v Plus4U je na vás nevyřešená aktivita), je tam zelené tlačítko **Potvrdit zápis ze schůzky** — po potvrzení se schůzka v Plus4U označí za vyřešenou
- **Přepisy → Schůzka**: tlačítko **Navrhnout úkoly** — AI projde zápis a navrhne, jaké úkoly z něj komu vyplývají. Návrhy jde upravit, smazat i přidat vlastní, ke každému vybrat příjemce a poslat mu ho jako formální zprávu do chatu; u jednoho člověka se dají poslat i všechny jeho úkoly naráz

### Changed

- Nastavení AI: sekce **uuBT — odeslání zápisu do schůzky** se jmenuje **Plus4U integrace**; hlášky napříč aplikací mluví o Plus4U místo uuBT
- **Přepisy**: **Zapsat ke schůzce Plus4U** (dřív „Zápis do schůzky v uuBT") je samostatné tlačítko v tabu **Shrnutí** před **Přegenerovat shrnutí**, ne položka v nabídce **Sdílet**. Aktivní je jen se zapnutou Plus4U integrací a **oběma** uloženými přístupovými kódy
- **Přepisy**: akce se přesunuly k obsahu, ke kterému patří — **Přegenerovat shrnutí** je v tabu **Shrnutí** a **Přepsat znovu** v tabu **Přepis**; v hlavičce zůstalo sdílení, soubory a mazání
- **Záložky**: odebrání záložky se teď ptá na potvrzení — u tlačítka v seznamu i u tlačítka v náhledu zprávy
- **Záložky**: tlačítka v náhledu zprávy vypadají stejně jako v Přepisech a jsou **nahoře pod názvem**, ne dole — **Otevřít chat této zprávy** vlevo, ikona koše vpravo
- **Přepisy**: volby přegenerování shrnutí rovnou ukazují **konkrétní model a styl** z Nastavení AI místo neurčité položky „Podle Nastavení AI"
- **Přepisy**: sdílení se přesunulo z hlavičky do jednotlivých tabů — ikona **sdílení** v tabu **Shrnutí** pošle shrnutí, v tabu **Přepis** přepis, u obou na výběr **Do chatu** nebo **Sobě**
- **Přepisy**: z hlavičky detailu zmizely štítky **Přepis** a **Shrnutí** — totéž je vidět z tabů
- **Přepisy**: nabídka **Soubory** se přesunula do řady záložek (za **Nahrávka**) — vypadá jako záložka, ale rozbalí nabídku
- **Přepisy**: v seznamu nahrávek je na hover i **ikona koše** (s potvrzením), stejně jako v Záložkách; nadpis panelu se přejmenoval z **Přepisy** na **Minutes**
- **Schůzka**: tab načítá i **Přípravu**, **Zápis ze schůzky** a **Účastníky** z Plus4U
- **Schůzka**: řádek **Zápis provede** ukazuje, kdo má schůzku uzavřít; když jste to vy, přidá se k tomu vysvětlení u zeleného tlačítka **Potvrdit zápis ze schůzky**
- **Schůzka**: sdílení je pod **ikonou sdílení** a umí poslat **zápis i přípravu**, do chatu i sobě
- **Schůzka**: **Otevřít schůzku v prohlížeči** a **Aktualizovat informace** jsou ikony, **Navrhnout úkoly** má ikonu AI

### Fixed

- **Přepisy**: nahrávka, která se zpracovává, je v seznamu skutečně modře zvýrazněná a chyba přepisu červeně — kvůli chybě ve skládání CSS třídy se zvýraznění dřív nezobrazovalo
- **Přepisy**: panel s volbami modelu (v tabu Shrnutí i Přepis) byl průhledný a nešlo v něm nic přečíst — používal neexistující barvu tématu
- **Přepisy → Shrnutí**: v editoru shrnutí nefungovalo tučně, kurzíva ani odrážky — kliknutí na lištu vzalo editoru výběr textu a celý Signal navíc drží editovatelná pole v režimu bez formátování
- **Přepisy → Shrnutí**: odrážky a číslování nebyly vidět (ani v hotovém shrnutí, ani v editoru) a odkaz se nevložil, dokud nebyl označený text

## [8.26.0-m1.3.1-beta.2] - 2026-09-12

### Added

- Levá navigace: nové taby **Přepisy** (ikona M) a **Záložky** (ikona záložky) hned za Hovory — otevřou se na celé hlavní obrazovce, ne v malém dialogu
- **Přepisy** mají nově dvousloupcový layout jako Chaty a Hovory: vlevo jeden seznam všech nahrávek (co se zpracovává, je nahoře, modře zvýrazněné a s ukazatelem průběhu), vpravo detail vybrané nahrávky
- **Přepisy**: vyhledávání hledá i **uvnitř přepisů a shrnutí**, ne jen v názvech — u nalezené nahrávky se rovnou ukáže úryvek s hledaným výrazem
- **Přepisy**: rychlé filtry **Vše / Zpracovává se / Video / Bez přepisu** nad seznamem
- **Přepisy**: detail nahrávky má záložky **Shrnutí** (formátovaný text), **Přepis** (celý text) a **Nahrávka** — audio i video se dá přehrát rovnou v aplikaci, včetně posunu v čase (u videa po vytvoření MP4)
- **Záložky** mají nově sloupec se seznamem a vyhledáváním (hledá v názvu chatu i v textu zprávy) a vpravo náhled celé zprávy s autorem, časem a tlačítky **Otevřít v chatu** / **Odebrat záložku**
- Odeslání zápisu do uuBT: v panelu **Přepisy** přibylo u hotového shrnutí tlačítko **U→**, které nabídne schůzky z vašeho kalendáře pro daný den a vloží AI shrnutí na konec sekce Zápis vybrané schůzky. Přihlášení přístupovými kódy se nastavuje v **Nastavení AI**; kódy se ukládají šifrovaně přes safeStorage operačního systému.

### Changed

- **Přepisy** se otevírají jako tab v levé navigaci (menu i **Ctrl+Shift+M** vedou tam). Plovoucí okno zmizelo; během přepisu zůstává vpravo dole jen malá pilulka s průběhem, kliknutím přepne na tab
- **Přepisy**: ovládání nahrávky je přehlednější — místo řady zkratkových tlačítek (P→, S↩, U→) jsou nahoře v detailu akce **Spustit přepis** / **Vygenerovat shrnutí** a rozbalovací nabídky **Sdílet** (přepis i shrnutí do chatu, sobě, nebo zápis do uuBT) a **Soubory** (otevřít nahrávku, přepis, shrnutí, MP4, složku)
- **Přepisy**: zmizelo oddělené přepínání _Fronta_ / _Historie nahrávek_ — všechno je v jednom seznamu, ovládání fronty (pozastavit, zrušit) se ukáže jen když se něco zpracovává
- **Záložky** se otevírají jako tab (menu i **Ctrl+Shift+B**) místo dialogu
- Menu **Minutes**: **Nastavení Přepisů (Minutes)** je nově hned pod **Nastavení AI**, **Nastavení MCP** je až poslední z nastavení
- Nastavení AI: test poskytovatele se přesunul ze spodní lišty dialogu přímo do sekce **Aktivní poskytovatel pro sumarizaci** a jmenuje se **Otestovat summarizaci**
- Nastavení AI: u uuBT jsou nově dvě tlačítka — **Uložit kódy** a **Otestovat připojení** (dřív jedno společné)
- Nastavení AI: **Otestovat summarizaci** místo nicneříkajícího „Připojení OK (OK)“ hlásí poskytovatele, model a dobu odezvy

### Fixed

- Chybové hlášky jsou srozumitelné a na jednom místě: místo technického výpisu (`Error invoking remote method '…'`) se ukáže, co se stalo a co udělat — např. vyčerpaný kredit u AI, neplatný API klíč, vypnutý model, chybějící soubor nebo plný disk. Původní text zůstává pod odkazem **Technické podrobnosti**
- **Přepisy**: v seznamu vlevo už chybová hláška nezaplaví celý řádek — je tam jen **Přepis selhal** / **Shrnutí selhalo** a podrobnosti se ukážou v detailu vpravo
- **Záložky**: dlouhé odkazy ve zprávách už nepřetékají mimo okno, náhled se zalomí a zkrátí
- Nastavení AI: aktualizovaný seznam modelů u **Anthropic (Claude)** — `claude-haiku-4-5` (nový výchozí), `claude-sonnet-5`, `claude-sonnet-4-6`, `claude-opus-5`. Dosavadní Claude 3.5 modely už Anthropic API nenabízí; kdo je měl uložené, přepne se automaticky na Haiku 4.5

## [8.26.0-m1.3.1-beta.1] - 2026-09-10

### Changed

- Základ aplikace: Signal Desktop **8.26.0** — ve vyhledávání členů skupiny se vlastní účet zobrazuje jako **Vy**
- Electron **43.5.0**, sqlcipher **4.1.0**
- Lokální AI (Gemma): `node-llama-cpp` 3.19.1 → **3.20.0** (novější llama.cpp, oprava uvolnění kontextu)
- Windows ikony: `resedit` 3.0.2 → **3.1.0**
- CI: `pnpm/action-setup` 6.1.0, `actions/setup-python` 7.0.0

## [8.25.0-m1.3.1] - 2026-09-10

### Added

- Nahrávání **sdíleného videa** hovoru do WebM: ukládá jen prezentaci přenášenou přes Signal (ne kamery ani UI); vlastní sdílení jde z odchozího RingRTC streamu; pause/resume a automatické uložení na konci hovoru
- Přepis a volitelné AI shrnutí **videonahrávek** (stejná Whisper a sumarizační pipeline jako u MP3)
- Export videa WebM do kompatibilního **MP4** (H.264/AAC) z historie nahrávek, včetně průběhu, zrušení a přegenerování; přednostně systémový FFmpeg, jinak jednorázové stažení podpory
- Lokální **MCP** server a webhooky: menu **Nastavení MCP**, token, oprávnění Pouze čtení / Běžné zápisy / Destruktivní zápisy a seznam povolených hostů (včetně Docker `host.docker.internal`)
- **Přeposlat s kontextem** a **Kopírovat s kontextem** — zachová autora a čas původní zprávy
- Dialogy Minutes lze přesouvat myší i klávesnicí; pozice se pamatuje
- Linux **AppImage** instalátor (x64)

### Changed

- Základ aplikace: Signal Desktop **8.25.0**
- Zvuk nahrávek (MP3 i video) jde **přímo z RingRTC** — bez vlastního mikrofonu a systémového loopbacku; respektuje ztlumení mikrofonu v Signalu
- Nahrávky se ukládají do **Dokumenty/Minutes**

### Fixed

- Aktivní hovor se při pouhém zamknutí obrazovky neukončí
- Dlouhé nahrávky: PCM sidecar pro Whisper se čte po blocích (nižší spotřeba paměti)
- RingRTC addon používá produkční konfiguraci WebRTC (stejné DTLS/SDP chování jako oficiální Signal)
- Po merge Signálu 8.25 znovu fungují startovací hooky Minutes

## [8.25.0-m1.3.0-beta.7] - 2026-09-01

### Fixed

- restore Minutes startup hooks after Signal 8.25 merge

## [8.25.0-m1.3.0-beta.6] - 2026-09-01

### Added

- Add 90% and 110% zoom level options
- Add global setting for reaction notifications
- Add backup tier code to improve debuggability
- Add backdrop blur to megaphones
- Add tooltip to group call layout button

### Changed

- 8.25.0
- Update strings
- 8.25.0-beta.2
- Use legacy fields if acisBinary set, remove from cache
- Update electron to 43.4.1
- Update sqlcipher to 4.0.5
- 8.25.0-beta.1
- Release notes for 8.25
- Revert "Add global setting for reaction notifications"
- Cleanup expired uninstalled sticker packs in storage
- Init AxoFieldList
- Update group member search add members label
- FIlter result of postBatchIdentityCheck
- Update electron to 43.4.0
- Hydrate blocked cache after ready is set to true
- Bump to libsignal v0.100.0
- Allow storybook error text to be selected
- Update DNS fallback
- Release notes for 8.24
- Improve resiliency of edit mock test
- Improve policy file generation
- Init AxoMessage and AxoExpireTimer
- Persist timestamp along with blocked contacts and groups
- Ignore extract-zip advisory to fix audit failure
- Init AxoMediaButton
- Clamp story start expiration
- Init AxoLoadingIndicator and AxoProgressIndicator
- Improve bidi isolation
- Improve validation of call link previews
- Allow missing custom color during backup export
- Patch react-popper for React 19
- Improve reliability of mock test storage service assertions
- Update symbol font and simplify symbol name types
- Additional cleanup on group/distributionList deletion
- Registration mock tests: Use event to validate SVR saves
- Simplify startup backup handling
- Fixes for group member search dialog UI
- Use high-contrast material colors for prefers-reduced-transparency
- Upgrade nanoid to fix audit
- Convert ContactModal to AxoDialog
- Improve default value handling for AttachmentPointer
- A few fixes for SVR and storage service
- Init group member search dialog
- Upgrade js-yaml to fix audit
- Update result handling for os auth prompt
- Detect excessive clock skew
- v8.25.0-alpha.1
- Release notes for 8.23
- Linkify more types of urls
- Update margin in textarea Input
- Update dependencies
- Adopt libsignal getDevices and setDeviceName APIs
- make version and environment selectable again
- Improve performance of body range processing
- Improve reaction and poll vote targeting
- Init AxoItem and AxoList
- Check that sender certificate matches type requested
- Clamp blurhash aspect ratio
- Bump to libsignal v0.99.2
- Improve handling of block state of release notes chat
- Update brace-expansion libraries
- Show tooltip on "change view" calling button
- Improve processing of sticker pack manifest
- On conversation delete, keep messageRequestResponseType
- Check group conversation acceptance state before ringing
- Check incoming group stories for author membership
- Restore default path when saving attachments
- Publish Packages
- Increase attachment download concurrency
- Update file-too-large toast message
- Use address book name instead of profile first name in delete message text
- Adopt several Libsignal backup APIs
- v8.24.0-alpha.1

### Fixed

- Fix default avatars for group member search
- Fix AxoList background color
- Fix formatting of AxoMediaButton
- Fix wasPreviouslyAMember check when processing group state
- Fix overflow behavior of link previews, quotes, and group descriptions

## [8.23.0-m1.3.0-beta.5] - 2026-08-24

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
