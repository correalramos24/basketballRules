# Reglament de Basquetbol FCBQ 2024

Pàgina web per consultar el Reglament Oficial de Basquetbol i les Interpretacions Oficials de les Regles de Joc, adaptats i distribuïts per la Federació Catalana de Basquetbol (FCBQ).

## Com engegar la web

Només cal un servidor HTTP estàtic a l'arrel del projecte (la pàgina carrega els markdown amb `fetch`, per tant no funciona obrint `index.html` directament):

```bash
python3 -m http.server 8000
```

Després obre **http://localhost:8000** al navegador.

També funciona amb qualsevol altre servidor estàtic (`npx serve`, l'extensió Live Server de VSCode, etc.).

## Funcionalitats

- **Dos documents** amb pestanyes a la capçalera: **Regles** i **Interpretacions**.
- **Índex lateral** amb l'estructura del document, que marca automàticament la secció que es llegeix (scroll-spy).
- **Cerca dins del reglament**: el quadre de la barra lateral cerca a tot el contingut del document actiu. Mostra una llista de resultats amb el context de cada coincidència; fent clic (o amb `Enter`) saltes a la secció i es ressalten les coincidències al text. La cerca no distingeix majúscules ni accents.
- **Annexos FCBQ** destacats en taronja i **sancions** en vermell.
- **Versió d'impressió** maquetada (els annexos i blocs queden ben separats).

## Fitxers principals

- `index.html` — Pàgina principal (tabs, sidebar i cerca)
- `styles.css` — Estils del lloc (tema FCBQ)
- `script.js` — Lògica de càrrega, renderització, cerca i navegació
- `reglesFCBQ.md` — Regles FIBA 2024 adaptades per l'FCBQ
- `interpretacionsFCBQ.md` — Interpretacions oficials de les Regles de Joc

## Convertidors

A `tools/`, convertidors que generen els fitxers markdown a partir dels PDF originals:

```bash
# Requerit: venv amb PyMuPDF instal·lat
cd basketballRules
python3 -m venv .venv
.venv/bin/pip install pymupdf

# Convertir regles
.venv/bin/python tools/convert_fcbq.py regles_fcbq.pdf reglesFCBQ.md

# Convertir interpretacions
.venv/bin/python tools/convert_interp.py interpretacions_fcbq.pdf interpretacionsFCBQ.md

# Extreure imatges
# Les imatges generades es guarden a images/regles/ i images/interps/
```

## Estructura del markdown generat

Els fitxers markdown generats utilitzen la següent convenció d'encapçalaments:

| Nivell | Regles FCBQ | Interpretacions |
|--------|-------------|-----------------|
| h1 | `# Regla N — Títol` | `# Article N Títol` |
| h2 | `## Art. N Títol` | — |
| h3 | `### N.M Títol` | `### N-M` (interpretació numerada) |
| h4 | `#### N.M.P Títol` | — |

- Els números d'apartat es troben dins `<span class="secnum">`
- El text taronja del PDF (modificacions FCBQ) es converteix en `<div class="annex">`
- Les figures incrustades s'exporten a `images/regles/` i `images/interps/`

## Crèdits

Projecte original de Victor Correal Ramos © 2026.
