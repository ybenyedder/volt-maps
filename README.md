# Volt Maps — miroir hors ligne du player WebGL Reborn

Miroir **open source**, **100 % local**, **zéro donnée collectée** : les 80 cartes
Subway Surfers « Enhanced » tournent sans aucune connexion. Support :
[paypal.me/AdamMezerai](https://paypal.me/AdamMezerai).

## Installer

```bash
python3 installe.py                 # installe / répare (idempotent) + vérifie un boot
python3 installe.py --prechauffer   # + met en cache les cartes (~1-2 h en ligne)
```

## Démarrer le serveur

```bash
python3 serve_localhost.py 8907
```

Hors ligne par défaut (`ONLINE=1` réautorise le réseau en secours). Puis ouvrir
**http://localhost:8907/** (hostname littéral `localhost` exigé par le moteur).

### Cartes

```
http://localhost:8907/<carte>/reborn/enhanced   ex. /paris/reborn/enhanced
```

96 slugs dans le listing, **81 jouables** (les autres : slugs APK historiques +
`rio-de-janeiro` qui casse le SPA). Hors ligne : `journey-to-the-east` (jamais
rapatrié) et `miami` (contenu supprimé en amont) ne fonctionnent pas.

## Ce que fait le serveur (`serve_localhost.py`)

- Sert la **copie locale** du site (`telechargement/`, ~900 Mo : pages, build
  Unity partagé, contenu des cartes, vignettes, configs).
- Résout les URLs propres du SPA et les routes de jeu `/<carte>/reborn/<mode>`.
- **Cache disque persistant** (`cache/`) : premier accès réseau → stocké, puis
  servi du disque (`X-Cache: HIT`). Recherche tolérante au paramètre `?troCors`.
- **Activation 100 % locale** : `POST /reborn-api/v1/activate` est intercepté par
  `activation_locale.py` (enveloppe rejouée du cache + jeton re-minté signé par
  la clé locale). `ACTIV_RESEAU=1` restaure le proxy amont.
- **CORS réflexif** (une partie du JS construit des URLs localhost en dur).

## Chaîne de démarrage d'une carte

1. `assetDelivery: "same-origin-protected-streaming"` (le patch « standard » casse
   le handshake).
2. `assets/W4C2wK_u.js` : validation des URLs (`kc()`) élargie à `/builds/shared/`
   et `/reborn/content/`.
3. Activation locale : enveloppe de contenu **rejouée** depuis la réponse en cache
   (chiffrée pour le handshake ECDH fixe du SW) + jeton reconstruit (nonce Unity
   courant, `iat`/`exp` frais) **signé par la clé locale** (`cle_activation.json`).
4. `telechargement/index.html` (launcher) : hooks fetch/XHR + `window.open`
   (redirection du bouton du popup vers PayPal), pont
   `__TAVVKKJ_REBORN_LAUNCH__` qui :
   - aligne le **nonce du moteur** sur le claim du jeton servi (réécriture UTF-8 /
     UTF-16 dans le tas) ;
   - délivre l'enveloppe au service worker puis un receipt **minimal** au moteur ;
   - `__TVK_ENV__.dateNow` natif (une horloge figée bloque le chargement, un saut
     d'horloge casse la validation — le moteur ne vérifie pas l'expiration).
5. Framework `reborn-shared.framework.js.br` (**JS en clair**) patché :
   - `_VoltmapsEnvSurface`/`_VoltmapsEnvProbe` neutralisés ;
   - `_ReconstructedRuntimeGetNowSeconds` et `_emscripten_date_now` routés vers
     `__TVK_ENV__.dateNow` ;
   - bouton du popup : `location.assign` vers PayPal ;
   - incrémenter `?v=N` sur `frameworkUrl` (et `dataUrl`) après chaque édition
     (UnityCache).
6. Contenu TVKSPK1 déchiffré par le SW (clés de l'enveloppe, handshake ECDH fixe
   `raw/cle_ec_fixe.json`).

## Scripts

| script | rôle |
|---|---|
| `installe.py` | installation/réparation complète |
| `serve_localhost.py` | serveur local hors ligne par défaut |
| `boot_test.py <slug>` | boot complet + capture `raw/boot_*.png` |
| `prechauffage.py` | remplit les caches (reprise via `raw/prechauffe_etat.json`) |
| `mesure_fps.py` | chargement + FPS par carte |
| `diag_boot.py` | diagnostic d'un boot bloqué |
| `activation_locale.py` | activation locale (enveloppe + jeton) |
| `changer_texte_popup.py` | personnalise le popup d'avertissement (toutes langues) |
| `chasse_cle.py` / `brute_force_cle.py` | recherche de la clé publique embarquée (archive) |

## Pièges connus

- Ne pas relancer `patch_urls.py` tel quel.
- Chunks minifiés : **aucun commentaire `//`** ; vérifier via
  `node --check`.
- Après édition du framework/SW : purger le profil + incrémenter `?v=N`
  (`frameworkUrl`, `dataUrl`) — UnityCache indexe par URL.
- **Ne jamais geler `Date.now` globalement** (loader bloqué) ni sauter l'horloge
  (`activation_timeout` / `activation_expired`). Le moteur valide la cohérence
  `receipt.unityNonce` ↔ nonce envoyé ↔ claim du jeton ; la signature est
  vérifiée (jeton du vrai gateway = valide).
- Gros `.br` : wasm/data non compressés, framework = JS brut.
- Serveur à lancer **détaché** (`setsid nohup … &`).

## Déploiement LAN

```bash
rsync -az --exclude .profil_nav --exclude raw ./ volt@192.168.1.87:~/voltmaps/
ssh volt@192.168.1.87 'cd ~/voltmaps && setsid nohup python3 serve_localhost.py 8907 &'
```

## Tunnel Cloudflare (nocoin.webtvmedia.net)

`cloudflared` doit être installé **et connecté** au compte Cloudflare du domaine :

```bash
cloudflared tunnel login
cloudflared tunnel create nocoin
cloudflared tunnel route dns nocoin nocoin.webtvmedia.net
cloudflared tunnel run --url http://localhost:8907 nocoin
```

## Résultats

81/96 cartes jouables ; hors ligne validé sur paris, tokyo, classic,
winter-holiday, beijing-cn, space-station, underwater, new-york, seoul,
haunted-hood, sydney, bali, copenhagen-super-runner, journey-through-china-cn
(menu **et** gameplay : partie lancée, score enregistré). Chargement ~3 s,
FPS moyen 48,9. Détails : `RAPPORT.md`, `raw/fps_cartes.json`.

## Licence / crédits

- Code du miroir : open source, made by volt.
- Contenu du jeu © SYBO Games — usage strictement personnel, ne pas héberger.
