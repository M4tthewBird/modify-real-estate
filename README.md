# Kopie modifyrealestate.cz

Statická kopie webu MODIFY real estate z Webflow. Kopírováno s povolením klienta.

- `site/`: hotová kopie, tu lze nasadit na statický hosting (1,1 GB). Kvůli velikosti není v gitu, vyrobí ji `node tools/mirror.mjs`
- `raw/`: původní HTML, beze změn
- `tools/mirror.mjs`: stáhne web znovu; už stažené obrázky přeskočí
- `tools/overrides.css`: naše úpravy vzhledu; další stažení je nepřepíše
- `tools/serve.mjs`: náhled na http://localhost:4180
- `mirror-report.json`: výsledek posledního stažení

## Nastavení na novém počítači

Postup je psaný i pro agenta (Claude Code apod.): stačí mu říct „nastav projekt podle README“.

1. Nainstaluj Node.js 20 nebo novější (vyvíjeno na 24) a git.
2. `git clone https://github.com/M4tthewBird/modify-real-estate.git` a přejdi do složky.
3. `node tools/mirror.mjs`: stáhne web do `site/` (asi 1,1 GB, trvá to několik minut). Bez toho stránka Staré Sladovny nemá loga ani fotky, které bere z `/assets/`.
4. `node tools/serve.mjs` (na Windows stačí dvakrát kliknout na `start.cmd`) a otevři http://localhost:4180/stara-sladovna/.

Jen pokud budeš měnit 3D model (`custom/stara-sladovna/build-model.mjs`):

5. `cd custom/stara-sladovna`, `npm install`, `npm run model`. Přepíše `public/model.bin` a `public/model.json`, které jsou v gitu, takže je po změně commitni.

Co v gitu není a proč: `site/` (vyrobí krok 3) a `node_modules/` (vyrobí krok 5). Vše ostatní, včetně zdrojových dat modelu v `custom/stara-sladovna/data-src/`, v gitu je.

## Stará Sladovna

Vlastní interaktivní stránka je na http://localhost:4180/stara-sladovna/ a její zdroj v `custom/stara-sladovna/`. Stahování webu ji nepřepíše.

- `public/patro.html`: samostatná stránka každého patra s půdorysem ve velkém formátu; `public/floorplans.js`: 3D kanceláře obkreslené z půdorysů; `public/facades.js`: fasády a jejich plastické detaily podle fotek
- `public/data.js`: patra, kanceláře a kontakt. Sem patří seznam od makléře; pak nastav `SAMPLE_DATA = false`. Kancelář s vyplněným `tour` otevře 3D prohlídku ve vieweru. Gym čerpá z `public/gym/` (naše fotky a půdorys ze Scanity Studia)
- Fasády a střechy jsou kreslené v shaderu v `public/app.js` (`SURFACE_GLSL`), zem a mapa ve funkci `paintMap`
- `build-model.mjs`: vyrobí model z dat města Brna (CC BY) a půdorysů budov z OpenStreetMap (ODbL). Oba zdroje musí zůstat uvedené v patičce stránky
- Stránka má `noindex` a formuláře nic neodesílají. Obojí je potřeba před spuštěním změnit

## Barák

Zkušební stránka s Gaussian splat modelem na http://localhost:4180/barak/, zdroj v `custom/barak/public/`. Model `barak.sog` vykresluje [Spark](https://sparkjs.dev) (MIT) nad three.js 0.180, které má stránka ve `vendor/` vlastní, Stará Sladovna dál běží na 0.170.

- Části domu (přízemí, auto, střecha) jsou krabice v `PARTS` v `app.js`, změřené z dat modelu. Zvýraznění počítá shader ve Sparku, kliknutí chytají neviditelné krabice
- Model je od autora zevlman ze superspl.at pod licencí CC BY 4.0, uvedení autora v patičce musí zůstat

## GitHub Pages

Po každém pushi do `main` workflow `.github/workflows/pages.yml` spustí `tools/pages.mjs` a publikuje naše stránky:

- https://m4tthewbird.github.io/modify-real-estate/stara-sladovna/ (adresa webu bez cesty sem přesměruje)
- https://m4tthewbird.github.io/modify-real-estate/barak/

Kopie klientského webu v `site/` se nepublikuje. Z ní jsou v gitu jen obrázky, které tyto stránky používají (`git add -f`). Když stránka začne používat další obrázek ze `site/assets`, `node tools/pages.mjs` ho vypíše jako chybějící a je potřeba ho přidat stejně. Ostatní odkazy na `/` vedou na živý web modifyrealestate.cz. Lokálně v Git Bash spouštěj s `MSYS_NO_PATHCONV=1`, jinak se cesta `/modify-real-estate` přepíše na cestu Windows.

## Spuštění

Dvakrát klikni na `start.cmd`, nebo spusť `node tools/serve.mjs` a otevři http://localhost:4180.

## Aktualizace

Klient web dál upravuje ve Webflow. Novou verzi stáhne `node tools/mirror.mjs`. Stránky, které mezitím z webu zmizely, zůstanou v `site/`, dokud je někdo nesmaže.

## Před ostrým spuštěním

**Formuláře jsou v kopii vypnuté** (`tools/forms-off.js`). Jinak by testovací odeslání chodila do klientova účtu ve Webflow. Před spuštěním je potřeba je napojit na novou službu a `forms-off.js` odebrat:

- kontaktní formulář (`/kontakt`)
- formulář týmu a referencí (`/nas-tym`, `/reference`)
- formulář makléře (`/makler/*`)
- poptávka u nemovitosti (`/nemovitost/*`)
- přihlášení k newsletteru

**Měření a souhlas s cookies jsou v kopii vypnuté**, aby testy nešly do klientových statistik: Google Tag Manager `GTM-K63CLR9Q`, Facebook Pixel `1057806563193521` a Cookiebot. Původní kód je v `raw/`. Vrátit je potřeba všechno najednou, protože měření bez souhlasu s cookies porušuje pravidla.

**Co zůstává na cizích službách:**

- Elfsight (widget na úvodní stránce a dalších): může být omezený na klientovu doménu
- mapy Google přes Embedly a Google Maps na kontaktu
- Google Fonts
- doplňky Finsweet si část kódu načítají z jsdelivr

**Správa nemovitostí:** kopie nemá redakční systém. Nová nabídka se dnes přidává ve Webflow, po přechodu bude potřeba jiné řešení.
