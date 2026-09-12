# Rapport final — voltmaps.xyz en local (Subway Surfers WebGL)

Date : 2026-09-11 · Environnement : localhost:8907 (`serve_localhost.py`), Chromium
1280×720 (`--use-gl=angle`), profil `.profil_nav`, caches chauds (build + contenu
des 96 cartes préchargés sur disque).

## Bilan de couverture

| | |
|---|---|
| Slugs dans le listing du site | **96** |
| Cartes WebGL jouables en local | **81** (boot + gameplay + mesure OK) |
| Entrées mortes du listing | **15** |
| Build Unity partagé | `enhanced-local-20260907t045830z` (~250 Mo, local) |
| Contenu des cartes préchargé | ~324 Mo dans `cache/` |

Les **15 entrées KO** ne sont pas des échecs du montage local :
- 14 slugs suffixés d'un numéro de version (`barcelona-1-107-0`, `rio-1-7-3`,
  `tokyo-1-84`…) sont des **entrées APK historiques** du listing : aucune donnée
  WebGL n'existe pour elles, le SPA ne charge rien ;
- `rio-de-janeiro` fait planter le SPA React lui-même
  (`TypeError: Cannot read properties of null (reading 'map')` dans
  `assets/COrjv8-3.js`) **avant même** l'initialisation du moteur Unity — entrée
  cassée côté site, indépendante du localhost. La carte Rio jouable est `rio`.

## Mesures par carte (chargement + gameplay)

Méthode (`mesure_fps.py`) : `goto` → canvas → fin du splash → **temps de
chargement** ; pause de 12 s (écran de chargement interne du jeu) ; lancement du
gameplay (Espace) ; **mesure rAF de 12 s** (FPS moyen / min, écart-type).

**Chargement moyen : 3.0 s** (min 2,4 s, max 3,3 s) — tout vient du disque
local. **FPS moyen global : 48.9** (médiane 49,1 ; plage 43,0–59,9 ;
écart-type inter-cartes 2,2). Les FPS min bas (~0,5) sont les micro-saccades du
tout début du gameplay (construction de la scène), pas l'état stabilisé.

| # | Carte | Chargement (s) | FPS moyen | FPS min |
|---|-------|----------------|-----------|---------|
| 1 | [atlanta](http://localhost:8907/atlanta/reborn/original) | 3.3 | 54.4 | 0.2 |
| 2 | [bali](http://localhost:8907/bali/reborn/original) | 3.2 | 47.8 | 0.5 |
| 3 | [bangkok](http://localhost:8907/bangkok/reborn/original) | 2.5 | 49.9 | 0.5 |
| 4 | [barcelona](http://localhost:8907/barcelona/reborn/original) | 2.5 | 49.5 | 0.5 |
| 5 | [beijing](http://localhost:8907/beijing/reborn/original) | 2.6 | 43.0 | 0.5 |
| 6 | [beijing-cn](http://localhost:8907/beijing-cn/reborn/original) | 2.6 | 48.3 | 0.5 |
| 7 | [berlin](http://localhost:8907/berlin/reborn/original) | 2.6 | 49.8 | 0.5 |
| 8 | [buenos-aires](http://localhost:8907/buenos-aires/reborn/original) | 2.5 | 48.0 | 0.5 |
| 9 | [cairo](http://localhost:8907/cairo/reborn/original) | 2.6 | 49.1 | 0.5 |
| 10 | [chang-an-cn](http://localhost:8907/chang-an-cn/reborn/original) | 2.5 | 46.9 | 0.5 |
| 11 | [chicago](http://localhost:8907/chicago/reborn/original) | 2.6 | 46.0 | 0.5 |
| 12 | [chicago-3-11](http://localhost:8907/chicago-3-11/reborn/original) | 2.6 | 49.2 | 0.5 |
| 13 | [classic](http://localhost:8907/classic/reborn/original) | 2.5 | 49.7 | 0.6 |
| 14 | [copenhagen](http://localhost:8907/copenhagen/reborn/original) | 2.4 | 48.7 | 0.5 |
| 15 | [copenhagen-super-runner](http://localhost:8907/copenhagen-super-runner/reborn/original) | 2.5 | 48.9 | 0.5 |
| 16 | [cosmic-crossroads](http://localhost:8907/cosmic-crossroads/reborn/original) | 2.6 | 46.1 | 0.5 |
| 17 | [dubai](http://localhost:8907/dubai/reborn/original) | 2.5 | 47.4 | 0.5 |
| 18 | [dunhuang](http://localhost:8907/dunhuang/reborn/original) | 2.6 | 50.4 | 0.5 |
| 19 | [easter-ireland](http://localhost:8907/easter-ireland/reborn/original) | 2.5 | 47.0 | 0.5 |
| 20 | [edinburgh-cn](http://localhost:8907/edinburgh-cn/reborn/original) | 2.6 | 46.8 | 0.5 |
| 21 | [greece](http://localhost:8907/greece/reborn/original) | 2.5 | 50.3 | 0.5 |
| 22 | [guangzhou-cn](http://localhost:8907/guangzhou-cn/reborn/original) | 2.6 | 44.9 | 0.5 |
| 23 | [guilin-cn](http://localhost:8907/guilin-cn/reborn/original) | 2.6 | 50.6 | 0.6 |
| 24 | [hangzhou](http://localhost:8907/hangzhou/reborn/original) | 2.7 | 48.9 | 0.5 |
| 25 | [harbin-cn](http://localhost:8907/harbin-cn/reborn/original) | 2.5 | 50.6 | 0.5 |
| 26 | [haunted-hood](http://localhost:8907/haunted-hood/reborn/original) | 2.5 | 49.5 | 0.5 |
| 27 | [havana](http://localhost:8907/havana/reborn/original) | 2.5 | 46.5 | 0.5 |
| 28 | [hawaii](http://localhost:8907/hawaii/reborn/original) | 2.5 | 46.8 | 0.5 |
| 29 | [hong-kong](http://localhost:8907/hong-kong/reborn/original) | 3.2 | 47.0 | 0.5 |
| 30 | [houston](http://localhost:8907/houston/reborn/original) | 3.1 | 43.8 | 0.5 |
| 31 | [iceland](http://localhost:8907/iceland/reborn/original) | 3.2 | 48.8 | 0.6 |
| 32 | [journey-through-china-cn](http://localhost:8907/journey-through-china-cn/reborn/original) | 3.3 | 48.4 | 0.6 |
| 33 | [journey-to-the-east](http://localhost:8907/journey-to-the-east/reborn/original) | 3.1 | 59.9 | 20.0 |
| 34 | [kenya](http://localhost:8907/kenya/reborn/original) | 3.2 | 49.2 | 0.6 |
| 35 | [las-vegas](http://localhost:8907/las-vegas/reborn/original) | 3.1 | 48.9 | 0.6 |
| 36 | [london](http://localhost:8907/london/reborn/original) | 3.1 | 48.3 | 0.5 |
| 37 | [lunar-new-year](http://localhost:8907/lunar-new-year/reborn/original) | 3.2 | 50.2 | 0.5 |
| 38 | [luoyang](http://localhost:8907/luoyang/reborn/original) | 3.1 | 50.2 | 0.5 |
| 39 | [macau-cn](http://localhost:8907/macau-cn/reborn/original) | 3.1 | 49.8 | 0.5 |
| 40 | [marrakesh](http://localhost:8907/marrakesh/reborn/original) | 3.2 | 49.8 | 0.6 |
| 41 | [mexico](http://localhost:8907/mexico/reborn/original) | 3.2 | 48.0 | 0.5 |
| 42 | [mexico-city](http://localhost:8907/mexico-city/reborn/original) | 3.2 | 51.3 | 0.6 |
| 43 | [miami](http://localhost:8907/miami/reborn/original) | 3.1 | 46.9 | 0.5 |
| 44 | [monaco](http://localhost:8907/monaco/reborn/original) | 3.2 | 49.2 | 0.5 |
| 45 | [moscow](http://localhost:8907/moscow/reborn/original) | 3.2 | 49.6 | 0.5 |
| 46 | [mumbai](http://localhost:8907/mumbai/reborn/original) | 3.2 | 48.9 | 0.5 |
| 47 | [new-orleans](http://localhost:8907/new-orleans/reborn/original) | 3.2 | 50.6 | 0.6 |
| 48 | [new-york](http://localhost:8907/new-york/reborn/original) | 3.2 | 49.7 | 0.5 |
| 49 | [north-pole](http://localhost:8907/north-pole/reborn/original) | 3.1 | 48.1 | 0.5 |
| 50 | [oxford](http://localhost:8907/oxford/reborn/original) | 3.2 | 49.7 | 0.5 |
| 51 | [paris](http://localhost:8907/paris/reborn/original) | 3.2 | 50.1 | 0.5 |
| 52 | [paris-cn](http://localhost:8907/paris-cn/reborn/original) | 3.2 | 50.1 | 0.6 |
| 53 | [peru](http://localhost:8907/peru/reborn/original) | 3.2 | 50.6 | 0.5 |
| 54 | [prague](http://localhost:8907/prague/reborn/original) | 3.2 | 49.5 | 0.5 |
| 55 | [rio](http://localhost:8907/rio/reborn/original) | 3.1 | 49.1 | 0.6 |
| 56 | [rome](http://localhost:8907/rome/reborn/original) | 3.2 | 44.1 | 0.5 |
| 57 | [saint-petersburg](http://localhost:8907/saint-petersburg/reborn/original) | 3.2 | 46.2 | 0.5 |
| 58 | [sakura-tokyo](http://localhost:8907/sakura-tokyo/reborn/original) | 3.2 | 47.9 | 0.5 |
| 59 | [san-francisco](http://localhost:8907/san-francisco/reborn/original) | 3.2 | 51.2 | 0.6 |
| 60 | [sao-paulo](http://localhost:8907/sao-paulo/reborn/original) | 3.3 | 49.7 | 0.6 |
| 61 | [seoul](http://localhost:8907/seoul/reborn/original) | 3.1 | 49.1 | 0.5 |
| 62 | [shenzhen](http://localhost:8907/shenzhen/reborn/original) | 3.1 | 49.3 | 0.5 |
| 63 | [shenzhen-showdown](http://localhost:8907/shenzhen-showdown/reborn/original) | 3.3 | 49.7 | 0.6 |
| 64 | [singapore](http://localhost:8907/singapore/reborn/original) | 3.2 | 50.5 | 0.5 |
| 65 | [space-station](http://localhost:8907/space-station/reborn/original) | 3.2 | 49.8 | 0.5 |
| 66 | [st-petersburg](http://localhost:8907/st-petersburg/reborn/original) | 3.3 | 49.6 | 0.5 |
| 67 | [subway-city](http://localhost:8907/subway-city/reborn/original) | 3.1 | 47.1 | 0.5 |
| 68 | [suzhou](http://localhost:8907/suzhou/reborn/original) | 3.2 | 52.8 | 0.5 |
| 69 | [sydney](http://localhost:8907/sydney/reborn/original) | 3.2 | 50.8 | 0.5 |
| 70 | [tokyo](http://localhost:8907/tokyo/reborn/original) | 3.2 | 50.0 | 0.5 |
| 71 | [transylvania](http://localhost:8907/transylvania/reborn/original) | 3.2 | 48.7 | 0.5 |
| 72 | [underwater](http://localhost:8907/underwater/reborn/original) | 3.3 | 46.2 | 0.5 |
| 73 | [vancouver](http://localhost:8907/vancouver/reborn/original) | 3.3 | 50.8 | 0.5 |
| 74 | [vancouver-spring](http://localhost:8907/vancouver-spring/reborn/original) | 3.2 | 48.7 | 0.6 |
| 75 | [venice](http://localhost:8907/venice/reborn/original) | 3.2 | 47.0 | 0.5 |
| 76 | [venice-beach](http://localhost:8907/venice-beach/reborn/original) | 3.3 | 50.6 | 0.5 |
| 77 | [washington-dc](http://localhost:8907/washington-dc/reborn/original) | 3.1 | 48.4 | 0.5 |
| 78 | [winter-holiday](http://localhost:8907/winter-holiday/reborn/original) | 3.2 | 47.9 | 0.5 |
| 79 | [winter-wonderland](http://localhost:8907/winter-wonderland/reborn/original) | 3.2 | 48.8 | 0.6 |
| 80 | [wuhan](http://localhost:8907/wuhan/reborn/original) | 3.1 | 48.1 | 0.5 |
| 81 | [zurich](http://localhost:8907/zurich/reborn/original) | 3.2 | 49.8 | 0.5 |

## Ce qui est local vs en ligne

- **Local** : site, pages, build Unity (wasm + data + framework), contenu chiffré
  des 81 cartes, configs, réponses d'API mises en cache (`cache/`, header
  `X-Cache: HIT`). Le serveur marche aussi en `OFFLINE=1` pour tout le gros.
- **En ligne (~2 Ko par lancement)** : `POST /reborn-api/v1/activate`. Le nonce
  est généré par le moteur Unity côté client ; le serveur le signe dans
  l'`activationToken`, que le C# vérifie. Réponse non rejouable hors ligne
  (nonce imprévisible) — compromis documenté dans le README.

## Reproduire les tests

```bash
cd /home/pc/web/benchmark-voltmaps
python3 serve_localhost.py 8907          # serveur (détaché si besoin : setsid nohup … &)
python3 boot_test.py <slug>              # boot d'une carte + capture
python3 mesure_fps.py <slug>…            # chargement + FPS (reprise auto)
python3 prechauffage.py                  # préchargement des caches (reprise auto)
```

Données brutes : `raw/fps_cartes.json`, `raw/prechauffe_etat.json`,
captures `raw/fps/`, `raw/prechauffe/`, `raw/boot_*.png`.
