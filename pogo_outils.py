#!/usr/bin/env python3
"""Pogo — récupération des cartes pogo d'ashuni.lol pour le miroir Volt Maps.

Deux architectures côté ashuni :
  * « reborn »  : reborn.json + loader/framework/wasm/data parts (Unity 2020+)
                  bootés par createUnityInstance (cas de transylvania) ;
  * « classic » : build Unity 2018/2019 piloté par UnityLoader.2019.2.js et un
                  manifest json (dataUrl/wasmCodeUrl/wasmFrameworkUrl relatifs).
                  Le mode pogo est choisi PAR LE BUILD via l'URL de la page
                  (?mode=pogo) — le même manifest sert training et pogo.

Usage :
  python3 pogo_outils.py telecharger [slug ...]   # télécharge les builds
  python3 pogo_outils.py pages                    # (re)génère les index.html
  python3 pogo_outils.py inventaire               # état local des builds
  python3 pogo_outils.py vignettes [slug ...]     # vignettes ashuni
"""
import json
import os
import subprocess
import sys

RACINE = os.path.dirname(os.path.abspath(__file__))
POGO = os.path.join(RACINE, "telechargement", "pogo")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"

# slug ashuni -> sources. `json` : URL du manifest (classic) ; `reborn` :
# chemin du reborn.json + fichiers du dossier Build/<carte>-reborn/.
# `titre` : nom affiché sur la page de jeu.
SOURCES = {
    "transylvania": {
        "type": "reborn", "titre": "Transylvania",
        "reborn_json": "https://ashuni.lol/transylvania/reborn.json",
        "build_dir": "https://builds.ashuni.lol/Build/transylvania-reborn",
        "fichiers": [
            "transylvania.loader.js", "transylvania.framework.js",
            "transylvania.wasm",
            "transylvania.data.part001", "transylvania.data.part002",
            "transylvania.data.part003", "transylvania.data.part004",
            "transylvania.data.part005",
        ],
    },
    "paris": {
        "type": "classic", "titre": "Paris",
        "json": "https://builds.ashuni.lol/Build/paris/paris.training.json",
        "titre_page": "Paris",
        # variante du loader « 4399 » attendue par le framework du build :
        # "" (4399.js), ".z", ".sf" ou None (build standard, pas de 4399)
        "loader_4399": "",
    },
    "moscow": {
        "type": "classic", "titre": "Moscow",
        "json": "https://builds.ashuni.lol/Build/moscow/moscow.alt.json?v=ashuni-moscow-fix-20260623f",
        "loader_4399": "",
        "extra": ["/pogo/unity/moscow-runtime-bridge.js"],
    },
    "bangkok": {
        "type": "classic", "titre": "Bangkok",
        "json": "https://builds.ashuni.lol/Build/bangkok/bangkok.alt.json?v=bangkok-domainlock-20260618-v6",
        "loader_4399": "",
    },
    "cairo": {
        "type": "classic", "titre": "Cairo",
        "json": "https://builds.ashuni.lol/Build/cairo/cairo.training.json",
        "loader_4399": "",
    },
    "hongkong": {
        "type": "classic", "titre": "Hong Kong",
        "json": "https://builds.ashuni.lol/Build/hongkong/hongkong.training.json",
        "loader_4399": "",
    },
    "rio": {
        "type": "classic", "titre": "Rio",
        "json": "https://builds.ashuni.lol/Build/rio/rio.training.json?v=ashuni-rio-json-20260611-relative",
        "loader_4399": "",
    },
    "tokyo": {
        "type": "classic", "titre": "Tokyo",
        "json": "https://builds.ashuni.lol/Build/tokyo/tokyo.training.json",
        "loader_4399": "",
    },
    "venice": {
        "type": "classic", "titre": "Venice",
        "json": "https://builds.ashuni.lol/Build/venice/venice.training.json",
        "loader_4399": "",
    },
    "newyork": {
        "type": "classic", "titre": "New York",
        "json": "https://builds.ashuni.lol/Build/newyork/newyork.training.json",
        "loader_4399": "",
    },
    "buenosaires": {
        "type": "classic", "titre": "Buenos Aires",
        "json": "https://builds.ashuni.lol/Build/4/4.json",
        "loader_4399": "",
    },
    "beijing": {
        "type": "classic", "titre": "Beijing",
        "json": "https://builds.ashuni.lol/Build/5/5.json",
        "loader_4399": "",
    },
    "london": {
        "type": "classic", "titre": "London",
        "json": "https://builds.ashuni.lol/Build/6/6.json",
        "loader_4399": "",
    },
    "iceland": {
        "type": "classic", "titre": "Iceland",
        "json": "https://builds.ashuni.lol/Build/7/7.json",
        "loader_4399": "",
    },
    "havana": {
        "type": "classic", "titre": "Havana",
        "json": "https://builds.ashuni.lol/Build/8/8.json",
        "loader_4399": "",
    },
    "neworleans": {
        "type": "classic", "titre": "New Orleans",
        "json": "https://builds.ashuni.lol/Build/9/9.json",
        "loader_4399": "",
    },
    "saintpetersburg": {
        "type": "classic", "titre": "Saint Petersburg",
        "json": "https://builds.ashuni.lol/Build/13/13.json",
        "loader_4399": "",
    },
    "winterholiday": {
        "type": "classic", "titre": "Winter Holiday",
        "json": "https://builds.ashuni.lol/Build/winterholiday/winterholiday.training.json",
        "loader_4399": "subwaySurf14.08",
    },
    "barcelona": {
        "type": "classic", "titre": "Barcelona",
        "json": "https://builds.ashuni.lol/Build/2/2.json",
        "loader_4399": "subwaySurf14.08",
    },
    "miami": {
        "type": "classic", "titre": "Miami",
        "json": "https://builds.ashuni.lol/Build/16/16.json",
        "loader_4399": None,
    },
    "mexico": {
        "type": "classic", "titre": "Mexico",
        "json": "https://builds.ashuni.lol/Build/3/3.json",
        "loader_4399": "subwaySurf14.08",
    },
    "berlin": {
        "type": "classic", "titre": "Berlin",
        "json": "https://builds.ashuni.lol/Build/14/14.json?v=ashuni-berlin-20260609-pogo",
        "loader_4399": ".sf",
    },
    "houston": {
        "type": "classic", "titre": "Houston",
        "json": "https://builds.ashuni.lol/Build/15/15.json",
        "loader_4399": ".sf",
    },
    "zurich": {
        "type": "classic", "titre": "Zurich",
        "json": "https://builds.ashuni.lol/Build/1/1.json",
        "loader_4399": ".z",
    },
    "sanfrancisco": {
        "type": "classic", "titre": "San Francisco",
        "json": "https://builds.ashuni.lol/Build/11/11.json",
        "loader_4399": ".z",
    },
    "monaco": {
        "type": "classic", "titre": "Monaco",
        "json": "https://builds.ashuni.lol/Build/12/12.json",
        "loader_4399": ".z",
    },
}

# Loaders « modularisés » : le framework du build appelle my4399UnityModule ;
# le UnityLoader.2019.2.js d'ashuni (patché) lui substitue ce module quand le
# build est détecté modularisé. Trois variantes existent selon les cartes.
LOADERS_4399 = {
    "4399": "https://ashuni.lol/js/4399.js",
    "4399.z": "https://ashuni.lol/js/4399.z.js",
    "4399.sf": "https://ashuni.lol/js/4399.sf.js",
}

TEMPLATE_CLASSIC = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>{titre} · Pogo — Volt Maps</title>
<link rel="icon" href="/favicon.webp?v=4">
<style>
  html, body {{ margin: 0; height: 100%; background: #05030a; overflow: hidden; }}
  #game {{ position: fixed; inset: 0; width: 100%; height: 100%; }}
  #game canvas {{ width: 100%; height: 100%; display: block; outline: 0; background: #05030a; }}
  #pogo-barre {{
    position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: min(420px, 72vw); text-align: center; color: #9aa3b8;
    font: 13px/1.5 "Segoe UI", system-ui, sans-serif;
  }}
  #pogo-barre-vide {{
    height: 4px; margin-top: 10px; background: #1a2030; border-radius: 2px; overflow: hidden;
  }}
  #pogo-barre-plein {{ height: 100%; width: 0; background: #ffb020; transition: width .2s; }}
  #pogo-erreur {{
    position: fixed; inset: 0; display: none; place-items: center;
    background: rgba(5, 3, 10, .92); color: #edf0f7;
    font: 14px/1.6 "Segoe UI", system-ui, sans-serif; text-align: center; padding: 24px;
  }}
  #pogo-erreur.visible {{ display: grid; }}
</style>
</head>
<body>
<div id="game"></div>
<div id="pogo-barre">
  <span id="pogo-texte">Chargement de {titre} (pogo)… ≈ {taille_mo} Mo</span>
  <div id="pogo-barre-vide"><div id="pogo-barre-plein"></div></div>
</div>
<div id="pogo-erreur"><p id="pogo-erreur-msg"></p></div>
<script src="/pogo/commun.js?v=3"></script>
<script src="/pogo/sauvegarde.js?v=2"></script>
{script_4399}<script src="/pogo/unity/UnityLoader.2019.2.js?v=2"></script>
<script>
(function () {{
  var filet = null;
  function demarrer() {{
    filet = window.pogoFilet();
    window.pogoUI.message("Chargement de {titre} (pogo)… ≈ {taille_mo} Mo (première visite : 1 à 2 min, ensuite en cache)", 0);
    window.pogoPatchCompression(window.UnityLoader);
    window.unityGame = window.UnityLoader.instantiate("game", "{json_local}", {{
      onProgress: function (instance, progres) {{
        window.__pogoProgres = progres;
        window.pogoUI.message(
          progres < 1 ? "Chargement… " + Math.round(progres * 100) + "%"
                      : "Initialisation du moteur…",
          progres * 100);
        if (progres >= 0.95) clearTimeout(filet);
      }},
      Module: {{
        preRun: [function () {{
          try {{ window.pogoInjecterSauvegarde(
            (window.unityGame && window.unityGame.Module) || null); }} catch (e) {{}}
        }}],
        onRuntimeInitialized: function () {{
          var barre = document.getElementById("pogo-barre");
          if (barre) barre.style.display = "none";
        }}
      }}
    }});
  }}
  window.pogoChargerSauvegarde().then(demarrer, demarrer);
}})();
</script>
</body>
</html>
"""

TEMPLATE_REBORN = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>{titre} · Pogo — Volt Maps</title>
<link rel="icon" href="/favicon.webp?v=4">
<style>
  html, body {{ margin: 0; height: 100%; background: #05030a; overflow: hidden; }}
  #unity-container {{ position: fixed; inset: 0; background: #05030a; }}
  #unity-canvas {{ display: block; width: 100%; height: 100%; outline: 0; background: #05030a; }}
  #pogo-barre {{
    position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: min(420px, 72vw); text-align: center; color: #9aa3b8;
    font: 13px/1.5 "Segoe UI", system-ui, sans-serif;
  }}
  #pogo-barre-vide {{
    height: 4px; margin-top: 10px; background: #1a2030; border-radius: 2px; overflow: hidden;
  }}
  #pogo-barre-plein {{ height: 100%; width: 0; background: #ffb020; transition: width .2s; }}
  #pogo-erreur {{
    position: fixed; inset: 0; display: none; place-items: center;
    background: rgba(5, 3, 10, .92); color: #edf0f7;
    font: 14px/1.6 "Segoe UI", system-ui, sans-serif; text-align: center; padding: 24px;
  }}
  #pogo-erreur.visible {{ display: grid; }}
</style>
</head>
<body>
<div id="unity-container">
  <canvas id="unity-canvas" tabindex="-1"></canvas>
  <div id="pogo-barre">
    <span id="pogo-texte">Chargement de {titre} (pogo)… ≈ {taille_mo} Mo</span>
    <div id="pogo-barre-vide"><div id="pogo-barre-plein"></div></div>
  </div>
  <div id="pogo-erreur"><p id="pogo-erreur-msg"></p></div>
</div>
<script src="/pogo/commun.js?v=3"></script>
<script>
(function () {{
  var manifest = null;

  function fichier(nom) {{
    var base = "/pogo/{slug}/Build/";
    var propre = String(nom || "").replace(/^Build\\//, "").split("?")[0];
    return base + propre;
  }}

  function fusionnerParties(urls) {{
    var suite = Promise.resolve([]);
    return urls.reduce(function (chaine, url, ix) {{
      return chaine.then(function (tampons) {{
        window.pogoUI.message("Téléchargement du contenu " + (ix + 1) + "/" +
          urls.length + "…", (ix / urls.length) * 25);
        return fetch(url).then(function (rep) {{
          if (!rep.ok) throw new Error("HTTP " + rep.status + " — " + url);
          return rep.arrayBuffer();
        }}).then(function (tampon) {{
          tampons.push(tampon);
          return tampons;
        }});
      }});
    }}, suite).then(function (tampons) {{
      window.pogoUI.message("Fusion du contenu…", 28);
      var total = 0;
      tampons.forEach(function (t) {{ total += t.byteLength; }});
      var fusion = new Uint8Array(total);
      var decalage = 0;
      tampons.forEach(function (t) {{
        fusion.set(new Uint8Array(t), decalage);
        decalage += t.byteLength;
      }});
      return URL.createObjectURL(new Blob([fusion],
        {{ type: "application/octet-stream" }}));
    }});
  }}

  fetch("/pogo/{slug}/reborn.json", {{ cache: "no-store" }})
    .then(function (rep) {{
      if (!rep.ok) throw new Error("reborn.json HTTP " + rep.status);
      return rep.json();
    }})
    .then(function (m) {{
      manifest = m;
      var version = encodeURIComponent(m.assetVersion || m.buildVersion || "reborn");
      var dataUrls = (m.dataParts || []).map(function (n) {{
        return fichier(n) + "?v=tagbot1";
      }});
      return fusionnerParties(dataUrls).then(function (dataBlobUrl) {{
        window.pogoUI.message("Démarrage du moteur…", 30);
        return new Promise(function (resoudre, rejeter) {{
          var script = document.createElement("script");
          script.src = fichier(m.loaderUrl);
          script.onload = function () {{ resoudre(dataBlobUrl); }};
          script.onerror = function () {{ rejeter(new Error("loader introuvable")); }};
          document.body.appendChild(script);
        }}).then(function (dataBlobUrl) {{
          var canvas = document.getElementById("unity-canvas");
          var filet = window.pogoFilet();
          return window.createUnityInstance(canvas, {{
            dataUrl: dataBlobUrl,
            frameworkUrl: fichier(m.frameworkUrl) + "?v=" + version,
            codeUrl: fichier(m.codeUrl) + "?v=" + version,
            streamingAssetsUrl: "/pogo/{slug}/" +
              String(m.streamingAssetsUrl || "StreamingAssets").replace(/^\\//, ""),
            companyName: m.companyName || "Kiloo Games",
            productName: m.productName || "Subway Surf",
            productVersion: m.productVersion || "1.105.0",
            autoSyncPersistentDataPath: false,
            cacheControl: function () {{ return "no-store"; }},
            devicePixelRatio: 1,
            matchWebGLToCanvasSize: true,
            webglContextAttributes: {{
              preserveDrawingBuffer: false, antialias: false, alpha: false,
              powerPreference: "high-performance", desynchronized: true
            }}
          }}, function (progres) {{
            window.__pogoProgres = progres;
            var pct = 30 + progres * 70;
            window.pogoUI.message(
              "Chargement… " + Math.round(pct) + "%", pct);
            if (progres >= 0.98) {{
              clearTimeout(filet);
              var barre = document.getElementById("pogo-barre");
              if (barre) barre.style.display = "none";
            }}
          }});
        }});
      }});
    }})
    .then(function (instance) {{
      window.unityInstance = instance;
      var barre = document.getElementById("pogo-barre");
      if (barre) barre.style.display = "none";
    }})
    .catch(function (err) {{
      window.pogoUI.erreur(String(err && err.message || err).slice(0, 300));
    }});
}})();
</script>
</body>
</html>
"""


def curl(url, destination):
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    r = subprocess.run(["curl", "-sL", "--fail", "-A", UA, url, "-o", destination])
    if r.returncode != 0:
        print(f"  !! échec : {url}")
        return False
    taille = os.path.getsize(destination)
    print(f"  ok ({taille // 1024 // 1024} Mo) {os.path.basename(destination)}")
    return True


def telecharger(slugs):
    for slug in slugs:
        source = SOURCES.get(slug)
        if not source:
            print(f"inconnu : {slug}")
            continue
        dossier = os.path.join(POGO, slug)
        print(f"— {slug} ({source['type']})")
        if source["type"] == "classic":
            manifest_path = os.path.join(dossier, "build.json")
            if not (os.path.isfile(manifest_path) and os.path.getsize(manifest_path) > 100):
                if not curl(source["json"], manifest_path):
                    continue
            manifest = json.load(open(manifest_path, encoding="utf-8-sig"))
            cles = ["dataUrl", "wasmCodeUrl", "wasmFrameworkUrl"]
            for cle in cles:
                if cle not in manifest:
                    continue
                nom = manifest[cle].split("?")[0]
                cible = os.path.join(dossier, nom)
                if os.path.isfile(cible) and os.path.getsize(cible) > 0:
                    print(f"  déjà là : {nom}")
                    continue
                base = source["json"].rsplit("/", 1)[0]
                curl(f"{base}/{nom}", cible)
        else:
            rj = os.path.join(dossier, "reborn.json")
            if not (os.path.isfile(rj) and os.path.getsize(rj) > 100):
                curl(source["reborn_json"], rj)
            for nom in source["fichiers"]:
                cible = os.path.join(dossier, "Build", nom)
                if os.path.isfile(cible) and os.path.getsize(cible) > 0:
                    print(f"  déjà là : {nom}")
                    continue
                curl(f"{source['build_dir']}/{nom}", cible)


# Remplacements de branding « Ashuni » -> « join .gg/tagbot », TOUS à longueur
# d'octets égale (les data files ont des offsets internes absolus : jamais
# agrandir ni raccourcir). Pour les valeurs JSON trop courtes, on absorbe le
# \r\n + indentation du membre suivant (le JSON reste valide).
BRANDING = [
    # slots JSON de 19 chars (cairo, hongkong, paris) : padding interne
    (b'"Ashuni             "', b'"join .gg/tagbot    "'),
    # transylvania (table de chaînes .NET, hors JSON, 19 chars)
    (b'PremultipliedPreserveSigAshuni             Pressed',
     b'PremultipliedPreserveSigjoin .gg/tagbot    Pressed'),
    # slots JSON de 12 chars (newyork, tokyo, venice, winterholiday) :
    # on absorbe \r\n + 2 espaces (4 octets) et on rend 1 espace -> +3 pour
    # la valeur : 12 + 3 = 15 = len("join .gg/tagbot")
    (b'"Ashuni      ",\r\n  "', b'"join .gg/tagbot", "'),
    (b'"By Ashuni   ",\r\n  "', b'"join .gg/tagbot", "'),
    # entrées de tas binaires length-préfixées (non affichées ou secondaires)
    (b'\x0b\x00\x00\x00Ashuni     \x00', b'\x0b\x00\x00\x00.gg/tagbot \x00'),
    (b'\x0a\x00\x00\x00Ashuni    \x00', b'\x0a\x00\x00\x00.gg/tagbot\x00'),
    (b'VersionByAshuni ', b'VersionBytagbot '),
]


def branding():
    """Remplace « Ashuni » par « join .gg/tagbot » dans tous les builds (même
    longueur d'octets) et bump le ?v= des manifests pour casser le cache."""
    import glob as _glob
    fichiers = (sorted(_glob.glob(os.path.join(POGO, '*', '*.data.unityweb')))
                + [os.path.join(POGO, 'transylvania', 'Build',
                                'transylvania.data.part005')])
    for chemin in fichiers:
        if not os.path.isfile(chemin):
            continue
        with open(chemin, 'rb') as fh:
            data = fh.read()
        original = data
        remplacements = 0
        for avant, apres in BRANDING:
            n = data.count(avant)
            if n:
                data = data.replace(avant, apres)
                remplacements += n
        if data != original:
            with open(chemin, 'wb') as fh:
                fh.write(data)
        reste = data.count(b'Ashuni')
        print(f"{os.path.relpath(chemin, POGO)}: {remplacements} remplacements"
              + (f" ({reste} 'Ashuni' restants)" if reste else ""))
    # bump des ?v= des dataUrl dans les build.json (fichiers servis immutable)
    for chemin in sorted(_glob.glob(os.path.join(POGO, '*', 'build.json'))):
        with open(chemin, encoding='utf-8-sig') as fh:
            m = json.load(fh)
        url = m.get('dataUrl', '')
        if not url:
            continue
        nouveau = url.split('?')[0] + '?v=tagbot-20260920'
        if nouveau != url:
            m['dataUrl'] = nouveau
            with open(chemin, 'w', encoding='utf-8') as fh:
                json.dump(m, fh, indent=2)
            print(f"{os.path.relpath(chemin, POGO)}: dataUrl -> ?v=tagbot-20260920")


def taille_carte_mo(slug, source):
    """Taille totale des fichiers de build de la carte, en Mo arrondis."""
    dossier = os.path.join(POGO, slug)
    total = 0
    if source["type"] == "classic":
        manifest = os.path.join(dossier, "build.json")
        if os.path.isfile(manifest):
            m = json.load(open(manifest, encoding="utf-8-sig"))
            for cle in ("dataUrl", "wasmCodeUrl", "wasmFrameworkUrl"):
                if cle in m:
                    p = os.path.normpath(os.path.join(dossier, m[cle].split("?")[0]))
                    if os.path.isfile(p):
                        total += os.path.getsize(p)
    else:
        for nom in source["fichiers"]:
            p = os.path.join(dossier, "Build", nom)
            if os.path.isfile(p):
                total += os.path.getsize(p)
    return max(1, round(total / 1024 / 1024))


def pages(slugs=None):
    for slug, source in SOURCES.items():
        if slugs and slug not in slugs:
            continue
        dossier = os.path.join(POGO, slug)
        taille_mo = taille_carte_mo(slug, source)
        if source["type"] == "classic":
            nom4399 = source.get("loader_4399")
            if nom4399 is None:
                script_4399 = ""
            elif nom4399 in ("", ".z", ".sf"):
                script_4399 = ('<script src="/pogo/unity/4399' + nom4399
                               + '.js"></script>\n')
            else:   # ex. "subwaySurf14.08"
                script_4399 = ('<script src="/pogo/unity/' + nom4399
                               + '.js"></script>\n')
            extras = "".join('<script src="' + s + '"></script>\n'
                             for s in source.get("extra", []))
            gabarit = TEMPLATE_CLASSIC.format(
                titre=source.get("titre_page", source.get("titre", slug)),
                slug=slug, json_local=f"/pogo/{slug}/build.json",
                script_4399=script_4399 + extras, taille_mo=taille_mo)
        else:
            gabarit = TEMPLATE_REBORN.format(titre=source.get("titre", slug),
                slug=slug, taille_mo=taille_mo)
        with open(os.path.join(dossier, "index.html"), "w", encoding="utf-8") as f:
            f.write(gabarit)
        print(f"page : /pogo/{slug}/")


def inventaire():
    for slug, source in SOURCES.items():
        dossier = os.path.join(POGO, slug)
        if not os.path.isdir(dossier):
            print(f"{slug}: ABSENT")
            continue
        total = 0
        manques = []
        attendus = (["build.json"] if source["type"] == "classic"
                    else ["reborn.json"] + ["Build/" + n for n in source["fichiers"]])
        for nom in attendus:
            p = os.path.join(dossier, nom)
            if os.path.isfile(p) and os.path.getsize(p) > 0:
                total += os.path.getsize(p)
            else:
                manques.append(nom)
        etat = "COMPLET" if not manques else "manque " + ", ".join(manques)
        print(f"{slug}: {etat} ({total // 1024 // 1024} Mo)")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "inventaire"
    args = sys.argv[2:]
    if cmd == "telecharger":
        telecharger(args or list(SOURCES))
    elif cmd == "branding":
        branding()
    elif cmd == "pages":
        pages(args or None)
    elif cmd == "vignettes":
        pass
    else:
        inventaire()
