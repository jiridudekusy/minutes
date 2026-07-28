# Minutes — příručka pro uživatele

Minutes rozšiřuje Signal Desktop o **nahrávání hovorů**, **přepisy**, **AI shrnutí chatů** a **záložky** na důležité zprávy.

Vaše data (nahrávky, exporty, modely) zůstávají **primárně u vás na disku**. Cloud AI je volitelné — používáte vlastní API klíč, nebo můžete shrnovat **lokálně** bez internetu.

---

## Za 5 minut — rychlý start

### 1. Zapněte AI shrnutí (volitelné, ale doporučené)

1. Otevřete **Menu → Minutes → Nastavení AI**
2. Zapněte **Povolit AI shrnutí**
3. Nastavte v tomto pořadí:
   - **Jazyk shrnutí** — nechte `cs` pro češtinu
   - **Styl shrnutí** — nechte **Stručný**, nebo zvolte Detailní / Smart / Vlastní
   - **Poskytovatel** — vyberte, kdo bude tvořit shrnutí
   - Podle poskytovatele doplňte **model** a **API klíč**, nebo u lokálního Gemma **stáhněte model**
4. Klikněte **Otestovat aktivního**, pak **Uložit**

### 2. Sumarizujte chat

- **Ctrl+Shift+U** — shrnutí otevřeného chatu
- Nebo pravý klik na zprávu → **Minutes: Sumarizovat odtud**
- Nebo menu chatu → **Sumarizovat poslední 1 / 8 / 24 hodin**

Výsledek najdete ve složce sumarizací (menu **Otevřít sumarizace chatů**). Zelená lišta nabídne odeslání do chatu nebo sobě.

### 3. Nahrajte a přepište hovor

1. Během hovoru zvolte **nahrávání zvuku** nebo **nahrávání sdíleného videa** (vedle mute)
2. V potvrzení **Nahrávání se chystá spustit** klikněte **Spustit nahrávání** (nebo **Zrušit**, pokud nahrávat nechcete)
3. Po skončení se nahrávka uloží automaticky
4. V **Nastavení Přepisů (Minutes)** jednorázově stáhněte Whisper model **Large v3 Turbo** (doporučeno)
5. Přepis a shrnutí najdete v **Přepisy (Minutes)**

### Zvonění ve velké skupině

V běžném Signálu se u skupin **od 16 členů** zvonění vypíná (hovor jde spustit, ale ostatní nezvoní). **Minutes zvonění ve velkých skupinách ponechává** — v lobby zůstane tlačítko zvonění aktivní.

Aby ostatní opravdu slyšeli vyzvánění, musí mít také **Minutes** (stock Signal zvonění u velké skupiny potlačí).

---

## Nastavení AI — podrobný návod

Dialog **Minutes → Nastavení AI** je uspořádaný shora dolů:

| Pořadí | Co nastavíte | Popis |
|--------|--------------|-------|
| 1 | Povolit AI shrnutí | Zapne/vypne AI u chatů a hovorů |
| 2 | Opravit přepis hovoru | Po Whisperu opraví zjevné chyby v textu |
| 3 | **Jazyk shrnutí** | `cs` = čeština, `en` = angličtina |
| 4 | **Styl shrnutí** | Stručný / Detailní / Smart / Vlastní |
| 5 | **Poskytovatel** | Kdo shrnutí vytvoří |
| 6 | Model + klíč / stažení | Zobrazí se podle zvoleného poskytovatele |

### Styl shrnutí

Platí pro **sumarizaci chatů** i **AI shrnutí hovorů**. Nepřečtené zprávy mají vlastní krátký formát (TÉMA / TYP) a tento výběr je neovlivní.

| Styl | Co dostanete |
|------|----------------|
| **Stručný** *(výchozí)* | Pár vět, jen úkoly, které někdo opravdu převzal |
| **Detailní** | Delší průběh, u úkolů kdo / co / termín pokud zazněl |
| **Smart** | Délku zvolí model podle rozsahu přepisu |
| **Vlastní** | Doplníte vlastní instrukce (tón, důraz). Formát zprávy v Signalu zůstane stejný |

U každého stylu lze **zobrazit prompt** — co model vždy dostane. Tuto část nelze přepsat (drží prostý text pro Signal). U **Vlastní** se vaše instrukce přidají na konec.

Po přepisu hovoru se použije aktuálně uložený styl. V **Přepisy (Minutes)** u hotového přepisu můžete **Přegenerovat shrnutí** — stačí předtím v Nastavení AI změnit styl a uložit.

### Cloud poskytovatel (OpenAI, Gemini, Claude, Perplexity)

1. Zvolte poskytovatele
2. Vyberte **model** (levnější modely jsou v seznamu první). U **Google Gemini** lze seznam obnovit z API tlačítkem **Obnovit seznam modelů** (vyžaduje vyplněný nebo již uložený API klíč) — objeví se i novější Flash modely (např. `gemini-3.6-flash`, `gemini-3.5-flash-lite`).
3. Vložte **API klíč** — odkaz „kde klíč získat“ je přímo pod polem
4. **Otestovat aktivního** → **Uložit**

Klíče u ostatních poskytovatelů zůstávají uložené. Chcete-li později přepnout na Gemini, stačí změnit poskytovatele a doplnit jeho klíč.

| Poskytovatel | Kde získat klíč | Levný model pro start |
|--------------|-----------------|------------------------|
| OpenAI (ChatGPT) | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | `gpt-4o-mini` |
| Google Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | `gemini-3.5-flash-lite` |
| Anthropic (Claude) | [console.anthropic.com](https://console.anthropic.com/settings/keys) | `claude-3-5-haiku-latest` |
| Perplexity | [perplexity.ai → API](https://www.perplexity.ai/settings/api) | `sonar` |

> **Poznámka:** Předplatné ChatGPT Plus, Claude Pro nebo Cursor **není** totéž co API klíč. Minutes potřebuje pay-as-you-go API účet u poskytovatele.

### Lokální LLM (Gemma) — bez API klíče

1. Zvolte poskytovatele **Lokální LLM (Gemma)**
2. Vyberte model ke stažení:

| Model | RAM | Velikost | Kdy použít |
|-------|-----|----------|------------|
| **Gemma 3 4B** | od 8 GB | cca 2,5 GB | Slabší PC, rychlejší shrnutí |
| **Gemma 3 12B** | od 12 GB | cca 7,5 GB | Kompromis kvalita/rychlost |
| **Gemma 4 12B** *(doporučeno)* | od 16 GB | cca 7 GB | Nejlepší kvalita, včetně češtiny |

3. Klikněte **Stáhnout a aktivovat** (během stahování lze **Zrušit stahování**)
4. **Uložit** nastavení

Shrnutí proběhne **jen na vašem počítači** — nic se neposílá do cloudu. První shrnutí může trvat déle (načtení modelu do paměti).

---

## Sumarizace konverzací

### Co dostanete

- Soubor **Markdown** (`.md`) s přepisem zpráv
- Volitelně sekci **AI Summary** (pokud je AI zapnuté a nastavené) — podle **stylu shrnutí** v Nastavení AI
- Metadata v `.json` souboru

### Jak spustit

| Situace | Jak na to |
|---------|-----------|
| Celý otevřený chat | **Ctrl+Shift+U** nebo menu Minutes |
| Od konkrétní zprávy | Pravý klik → **Minutes: Sumarizovat odtud** |
| Poslední 1 / 8 / 24 h | Menu **⋯** v hlavičce chatu → Minutes |
| Chat v levém panelu | Pravý klik na konverzaci → sumarizace |

### Kam se ukládá

`%APPDATA%\Minutes\minutes\summaries\`

Po dokončení se zobrazí zelená lišta — můžete **odeslat do chatu**, **poslat sobě** nebo **otevřít soubor**.

### Bez AI klíče

Export proběhne vždy — uloží se přepis zpráv. Lišta upozorní, že AI shrnutí chybí nebo je vypnuté.

---

## Nahrávání a přepis hovorů

### Nahrávání během hovoru

V obrazovce hovoru (vedle mute) jsou dvě samostatné akce:

- **Nahrávání zvuku** — po potvrzení začne ukládat MP3 (funguje i bez Whisperu)
- **Nahrávání sdíleného videa** — WebM obsahující pouze obraz, který někdo sdílí přes Signal, a zvuk hovoru přímo z RingRTC; vaše vlastní sdílení se zapisuje z odchozího RingRTC video streamu, nikoli novým snímáním obrazovky
- **Pause / Resume** — pozastaví / obnoví aktivní nahrávku i log řečníků; při obnovení se potvrzení nezobrazuje
- **Stop** — ukončí a uloží aktivní nahrávku

Obě nahrávání jsou vzájemně výlučná. Video lze spustit i bez aktivního sdílení; do té doby obsahuje černý obraz se zvukem. Kamery účastníků ani okno Signalu se do videa nenahrávají. Video se nepřepisuje přes Whisper.

Po **skončení hovoru** se aktivní nahrávka uloží automaticky.

Minutes zaznamenává, **kdo mluvil** (podle aktivity mikrofonu ve skupině i u vás). To pomáhá u přepisu a shrnutí přiřadit věty správným lidem.

### Přepis (Whisper)

1. **Menu → Minutes → Nastavení Přepisů (Minutes)**
2. Stáhněte model **Large v3 Turbo** *(doporučeno)* — u češtiny nejlepší poměr přesnosti a rychlosti, zejména s GPU
3. Zkontrolujte řádek **Akcelerace přepisu** — měl by ukázat `GPU — …` (ne CPU), pokud máte zapnuté GPU v nastavení
4. Máte-li **více grafických karet**, v sekci **Výkon přepisu** zvolte **Grafická karta pro akceleraci** (typicky diskrétní NVIDIA/AMD místo integrované)
5. Po nahrání hovoru se přepis spustí sám (fronta v **Přepisy (Minutes)**)

**Tip:** Model **Medium** je menší alternativa pro slabší PC bez grafiky. **Small** je rychlejší, ale u češtiny často dělá chyby. **Large v3** je nejpřesnější, ale nejpomalejší.

Přepis probíhá **lokálně** — audio se do cloudu neposílá. Do cloudu jde až text, pokud zapnete **AI shrnutí** nebo **AI korekci přepisu**.

### AI shrnutí hovoru

Stejné nastavení jako u chatů (**Nastavení AI** včetně **stylu shrnutí**). Shrnutí vznikne nad hotovým přepisem a může obsahovat jména řečníků. Chcete-li jiný styl, změňte ho v Nastavení AI a v **Přepisy** klikněte **Přegenerovat shrnutí**.

### Kam se ukládá

`%APPDATA%\Minutes\minutes\recordings\`

Soubory: audio `.mp3`, sdílené video `.webm`, `.json` metadata, `.transcript.md` a volitelně `.summary.md` pro audio přepisy.

### Právní upozornění

Zákony o nahrávání se liší. **Informujte účastníky** a získejte souhlas tam, kde je to potřeba. Minutes na to upozorní v potvrzení před každým novým nahráváním.

### Zvuk nahrávky a oprávnění

Audio i video nahrávka používají zvuk přímo z RingRTC: vzdálený playout a lokální vstup, který Signal posílá do hovoru. Recorder neotevírá vlastní mikrofon ani systémový loopback.

1. **Microphone** je potřeba pro samotný Signal hovor. Když je mikrofon v Signalu ztlumený, lokální větev nahrávky obsahuje ticho.
2. **Screen Recording** je potřeba pouze tehdy, když přes Signal sdílíte obrazovku. Nahrávání žádné druhé snímání obrazovky nespouští.

Příchozí zvuk se bere před operačním systémovým výstupem, takže není závislý na hlasitosti reproduktorů ani na vybraném fyzickém výstupu.

### Režim mikrofonu na macOS (Izolace hlasu)

Během hovoru klikněte v řádku nabídek na **oranžovou ikonu mikrofonu** (nebo **Control Center → Mic Mode**) a zvolte:

- **Standard** — běžné zpracování hlasu
- **Izolace hlasu** (Voice Isolation) — potlačí okolní hluk; vhodné v kanceláři nebo kavárně
- **Široké spektrum** (Wide Spectrum) — zachytí i zvuky v místnosti

Režim lze změnit i uprostřed hovoru. Platí pro to, co slyší ostatní účastníci (nejen nahrávka).

---

## Záložky

Uloží odkaz na důležitou zprávu pro rychlý návrat.

1. **Přidat** — pravý klik na zprávu → **Minutes: Přidat do záložek**
2. **Seznam** — **Ctrl+Shift+B** nebo menu Minutes → Záložky
3. Klik na položku → skok do chatu na danou zprávu
4. **Odebrat** — v dialogu Záložky u konkrétní položky

---

## Menu Minutes — přehled

| Položka | Co dělá |
|---------|---------|
| Sumarizovat aktuální chat | Shrnutí otevřeného chatu (Ctrl+Shift+U) |
| Záložky | Seznam záložek (Ctrl+Shift+B) |
| Přepisy (Minutes) | Fronta přepisů, historie nahrávek (Ctrl+Shift+M) |
| Nastavení AI | Jazyk, styl shrnutí, poskytovatel, model, API klíč / lokální Gemma |
| Nastavení Přepisů (Minutes) | Stažení Whisper modelu |
| Příručka | Tato nápověda |
| O Minutes | Úvodní obrazovka s přehledem funkcí |
| Otevřít nahrávky hovorů | Složka s MP3 a WebM |
| Otevřít sumarizace chatů | Složka s exporty chatů |
| Zobrazit log | Diagnostika (jen z menu) |

---

## Klávesové zkratky

| Zkratka | Akce |
|---------|------|
| Ctrl+Shift+M | Otevřít Přepisy (Minutes) |
| Ctrl+Shift+U | Sumarizovat aktuální chat |
| Ctrl+Shift+B | Záložky |

---

## Kde jsou data

| Typ | Cesta |
|-----|--------|
| Nahrávky hovorů | `%APPDATA%\Minutes\minutes\recordings\` |
| Sumáře chatů | `%APPDATA%\Minutes\minutes\summaries\` |
| AI nastavení | `%APPDATA%\Minutes\minutes\ai-settings.json` |
| Modely Whisper | `%APPDATA%\Minutes\minutes\models\` |
| Lokální LLM (Gemma) | `%APPDATA%\Minutes\minutes\models\llm\` |
| Záložky | `%APPDATA%\Minutes\minutes\` |

Při odinstalaci se data **standardně nemazou**.

---

## Aktualizace aplikace

Minutes **automaticky kontroluje nové verze** cca 8 sekund po startu (jen u nainstalované `.exe` verze, ne ve vývoji).

### Co uvidíte

1. **Horní lišta** (banner):
   - *Je dostupná nová verze …* — nová verze na GitHubu, tlačítko **Stáhnout**
   - *Stahuji Minutes …* — probíhá stahování po kliknutí na Stáhnout
   - *Minutes X je stažen. Restartovat a nainstalovat?* — připraveno k instalaci

2. **Domovská obrazovka dole** — stav verze, **Stáhnout** / **Restartovat a nainstalovat**, Release notes

### Jak aktualizovat

| Situace | Co dělat |
|---------|----------|
| Je nová verze | Klikněte **Stáhnout** (banner nebo dole na domovské stránce) |
| Stažení právě běží | Počkejte — dokončí se samo |
| Verze je stažena | **Restartovat a nainstalovat** v banneru nebo dole na domovské stránce |
| Chcete odložit | **Později** — banner se skryje do restartu aplikace |

Instalátor se stáhne do `%APPDATA%\Minutes\minutes\updates\` a spustí se po kliknutí na instalaci. Minutes se zavře a průvodce dokončíte ručně (SmartScreen u unsigned buildu: *Více informací* → *Přesto spustit*).

**Na macOS** je postup jiný: po kliknutí na instalaci se stažený `.dmg` **otevře** a Minutes se zavře. Přetáhněte **Minutes** do složky **Applications** (přepsání předchozí verze) a aplikaci spusťte znovu. Gatekeeper u nepodepsaného buildu může vyžadovat pravý klik → **Otevřít**.

Auto-update Signalu zůstává vypnuté — Minutes používá vlastní kontrolu přes [GitHub Releases](https://github.com/zmitko-uni/minutes/releases).

### Minutes Beta (testovací build)

Pro testování oprav před vydáním do prod existuje **Minutes Beta** — jde nainstalovat **vedle** běžných Minutes:

| | Minutes (prod) | Minutes Beta |
|---|----------------|--------------|
| Zástupce | Minutes | Minutes Beta |
| Data | `%APPDATA%\Minutes` | `%APPDATA%\Minutes-Beta` |
| Release | [Latest](https://github.com/zmitko-uni/minutes/releases/latest) | pre-release na GitHubu |

Beta stahuje aktualizace jen z beta kanálu — **neporovnává** verzi s prod a neprepíše prod instalaci.

---

## Řešení problémů

### AI shrnutí nefunguje

- Otevřete **Nastavení AI** → **Otestovat aktivního**
- U cloudu: zkontrolujte API klíč, kredit u poskytovatele a internet
- U Gemini: pokud model hlásí deprecaci, klikněte **Obnovit seznam modelů** a zvolte novější Flash (např. `gemini-3.5-flash-lite`)
- U lokálního Gemma: stáhněte a aktivujte model (**Stáhnout a aktivovat**)
- Ujistěte se, že je zapnuté **Povolit AI shrnutí**

### Shrnutí je v angličtině místo češtiny

- V **Nastavení AI** nastavte **Jazyk shrnutí** na `cs` a uložte
- U lokálního Gemma zkuste větší model (Gemma 4 12B)

### Shrnutí je moc krátké nebo naopak rozvláčné

- V **Nastavení AI** zvolte **Styl shrnutí**: Stručný, Detailní nebo Smart
- U **Vlastní** doplňte instrukce (např. „rozepiš každý úkol“) a uložte
- U hovoru pak v **Přepisy** použijte **Přegenerovat shrnutí**

### Chyba „No sequences left“ (lokální model)

- Restartujte aplikaci a zkuste znovu — jde o dočasný stav načteného modelu

### Runtime „Chybí node-llama-cpp“ / chyba `sleep-promise`

- Aktualizujte Minutes na nejnovější verzi (starší instalátory vynechávaly závislost potřebnou pro lokální model)
- Po aktualizaci znovu otevřete **Nastavení AI** a použijte **Stáhnout a aktivovat**

### Přepis běží na pomalé integrované grafice

- **Nastavení Přepisů (Minutes)** → **Výkon přepisu** → **Grafická karta pro akceleraci** — vyberte diskrétní GPU
- Ověřte indikátor **Akcelerace přepisu** (mělo by ukazovat zvolenou kartu)

### Chyba „available-locales.json not found“ při startu

- Jde o vadný instalátor — nainstalujte novější verzi z GitHub Releases (nebo přejděte zpět na předchozí funkční verzi)

### Přepis hovoru nejde

- Dokončete instalaci Whisperu v **Nastavení Přepisů (Minutes)**
- Sledujte frontu v **Přepisy (Minutes)**

### AI „Opravit přepis“ nic nezměnila / text vypadá stejně

- Pokud model vrátí odmítnutí, shrnutí nebo moc krátký výstup, Minutes **ponechá původní Whisper přepis** (nesmaže ho)
- Zkontrolujte v logu hlášku `discarding AI transcript correction`
- Zkuste jiný model nebo vypněte **Opravit přepis hovoru** v Nastavení AI

### Nahrávání nejde

- Ověřte oprávnění k mikrofonu a že jste v aktivním hovoru

### Na Macu nejde během hovoru zapnout Izolaci hlasu

- Režim se volí v **Control Center** (oranžová ikona mikrofonu v řádku nabídek), ne v nastavení Minutes
- Ověřte, že máte aktuální Minutes — starší verze režimy během hovoru blokovaly
- Pokud volby zůstanou šedé, zkuste hovor ukončit a znovu připojit

### Skupinový hovor ve velké skupině nezvoní

- Ověřte, že máte zapnuté zvonění v lobby před připojením (ikona zvonku)
- Příjemci se stock Signálem ve skupině ≥ 16 členů nezvoní — potřebují Minutes
- Hovor lze i bez zvonění připojit tlačítkem **Připojit se k hovoru** ve skupině

### Log pro podporu

**Menu → Minutes → Zobrazit log**

---

## Soukromí a AI

Při **cloud AI** se text chatu nebo přepisu odesílá na servery zvoleného poskytovatele. Náklady hradíte vy podle ceníku poskytovatele.

Při **lokálním Gemma** a **Whisper přepisu** zůstává audio i text zpracování na vašem počítači.

**Nepoužívejte AI sumarizaci** pro důvěrný obsah bez souhlasu účastníků.

---

## Verze a autor

Minutes je fork Signal Desktop (AGPL-3.0-only).

**Autor:** Ing. Martin Zmítko, Ph.D. — na Signalu `@martinzmitko.01`

**Skupina:** [Připojit se do skupiny](https://signal.group/#CjQKIBP9zkSQgKhZKU8a8CmyyetVnaN2JVJtiFXWLtNOF_WlEhDj2Yr4HQMlB-P5tAEy2sQn) — veřejná Signal skupina pro uživatele Minutes

*Poslední aktualizace příručky: 2026-08-17*
