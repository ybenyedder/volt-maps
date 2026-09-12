#!/usr/bin/env python3
"""Installation (ou réparation) complète du site tavvkkj.xyz en local.

Usage :
  python3 installe.py                 # installe / vérifie / répare (idempotent)
  python3 installe.py --prechauffer   # + remplit le cache des 96 cartes (~1-2 h en ligne)
  python3 installe.py --verifier-seul # seulement les vérifications (rien ne change)

Ce que fait l'installation :
  1. dépendances : python3, playwright + chromium ;
  2. extrait install/paquet.tar.gz -> telechargement/ (site + build + FICHIERS PATCHÉS ;
     les chunks Vite ne sont plus disponibles en amont, 404 sur les noms hashés) ;
  3. télécharge les 2 gros fichiers du build depuis assets.tavvkkj.xyz (260 Mo,
     avec reprise si interrompu) ;
  4. crée le symlink reborn-shared.framework.js -> .br (URL préférée du loader) ;
  5. démarre serve_localhost.py (port 8907) s'il ne tourne pas déjà ;
  6. optionnel : préchauffage (cache/ des cartes, rempli au fil de l'eau sinon) ;
  7. vérifie le boot complet d'une carte (atlanta).
"""
import argparse
import os
import shutil
import subprocess
import sys
import tarfile
import urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
PAQUET = os.path.join(ICI, "install", "paquet.tar.gz")
TELECH = os.path.join(ICI, "telechargement")
BUILD = os.path.join(TELECH, "builds", "shared", "enhanced-local-20260907t045830z", "Build")
PORT = 8907
TS = "enhanced-local-20260907t045830z"
AMONT = "https://assets.tavvkkj.xyz/builds/shared"
# tailles exactes des fichiers amont (validation du téléchargement)
GROS = {
    "reborn-shared.data.br": 200_764_273,
    "reborn-shared.wasm.br": 60_253_494,
}

def journal(*a):
    print(*a, flush=True)

def etape(n, titre):
    journal(f"\n=== {n}. {titre} ===")

def verifie_deps():
    manquants = []
    try:
        import playwright  # noqa: F401
    except ImportError:
        manquants.append("playwright (pip install playwright)")
    return manquants

def playwright_chromium_ok():
    try:
        import playwright
        dossier = os.path.join(os.path.expanduser("~"), ".cache", "ms-playwright")
        return os.path.isdir(dossier) and any(d.startswith("chromium") for d in os.listdir(dossier))
    except Exception:
        return False

def extrait_paquet():
    if not os.path.isfile(PAQUET):
        journal(f"ERREUR : {PAQUET} manquant")
        return False
    with tarfile.open(PAQUET) as t:
        try:
            t.extractall(ICI, filter="data")
        except TypeError:   # Python < 3.12
            t.extractall(ICI)
    return True

def telecharge_gros():
    ok = True
    for nom, taille in GROS.items():
        dest = os.path.join(BUILD, nom)
        if os.path.isfile(dest) and os.path.getsize(dest) == taille:
            journal(f"  {nom} : déjà présent ({taille} o)")
            continue
        url = f"{AMONT}/{TS}/Build/{nom}"
        journal(f"  téléchargement {nom} ({taille} o)…")
        try:
            # boucle de reprise : Range jusqu'à compléter
            while not (os.path.isfile(dest) and os.path.getsize(dest) == taille):
                deja = os.path.getsize(dest) if os.path.isfile(dest) else 0
                req = urllib.request.Request(url, headers={"Range": f"bytes={deja}-",
                                                           "User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=120) as r, \
                        open(dest, "ab") as f:
                    shutil.copyfileobj(r, f, 1024 * 1024)
        except Exception as e:
            journal(f"  ERREUR {nom} : {e} (relancer pour reprendre)")
            ok = False
        else:
            journal(f"  {nom} : OK ({os.path.getsize(dest)} o)")
    return ok

def symlink_framework():
    cible = os.path.join(BUILD, "reborn-shared.framework.js")
    source = "reborn-shared.framework.js.br"
    if os.path.islink(cible) or os.path.isfile(cible):
        journal("  symlink framework.js : déjà en place")
        return True
    os.symlink(source, cible)
    journal("  symlink framework.js -> framework.js.br créé")
    return True

def port_en_ecoute():
    try:
        import socket
        with socket.create_connection(("127.0.0.1", PORT), timeout=2):
            return True
    except OSError:
        return False

def demarre_serveur():
    if port_en_ecoute():
        journal(f"  serveur : déjà en écoute sur le port {PORT}")
        return True
    journal(f"  démarrage du serveur (port {PORT}, détaché)…")
    subprocess.Popen(
        [sys.executable, os.path.join(ICI, "serve_localhost.py"), str(PORT)],
        cwd=ICI, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL, start_new_session=True)
    import time
    for _ in range(20):
        time.sleep(0.5)
        if port_en_ecoute():
            journal("  serveur : OK")
            return True
    journal("  ERREUR : le serveur n'a pas démarré")
    return False

def boot_ok(slug="atlanta"):
    r = subprocess.run([sys.executable, os.path.join(ICI, "boot_test.py"), slug],
                       cwd=ICI, capture_output=True, text=True, timeout=300)
    sortie = r.stdout
    i = sortie.find("{")
    if i < 0:
        return False, sortie[-400:]
    import json
    try:
        d = json.loads(sortie[i:])
    except Exception:
        return False, sortie[-400:]
    return bool(d.get("boot_ok")), json.dumps({k: d[k] for k in
                                               ("boot_ok", "canvas", "canvas_pixels")
                                               if k in d})

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--prechauffer", action="store_true",
                   help="remplit le cache des 96 cartes (long, en ligne)")
    p.add_argument("--verifier-seul", action="store_true",
                   help="ne modifie rien, vérifie seulement")
    opts = p.parse_args()

    etape(1, "dépendances")
    manquants = verifie_deps()
    if manquants:
        journal("  manquant :", "; ".join(manquants))
        if not opts.verifier_seul:
            return 1
    else:
        journal("  python3 + playwright : OK")
    if not playwright_chromium_ok():
        journal("  chromium de playwright absent -> playwright install chromium")
        if not opts.verifier_seul:
            subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"],
                           check=False)
    else:
        journal("  chromium (playwright) : OK")

    etape(2, "extraction du paquet local (site + build + fichiers patchés)")
    if opts.verifier_seul:
        journal("  (ignoré : --verifier-seul)")
    else:
        extrait_paquet()
        journal("  telechargement/ en place")

    etape(3, "gros fichiers du build (260 Mo, en ligne, avec reprise)")
    if not telecharge_gros() and not opts.verifier_seul:
        return 1

    etape(4, "symlink framework.js")
    symlink_framework()

    etape(5, "serveur localhost")
    if not demarre_serveur():
        return 1

    if opts.prechauffer:
        etape(6, "préchauffage des 96 cartes (cache/)")
        subprocess.run([sys.executable, os.path.join(ICI, "prechauffage.py")], cwd=ICI)
    else:
        journal("\n(pas de préchauffage demandé — les cartes seront mises en cache "
                "au premier chargement, ou lancez python3 installe.py --prechauffer)")

    etape(7, "vérification : boot d'une carte")
    ok, detail = boot_ok()
    journal("  atlanta :", detail)
    if not ok:
        return 1
    journal("\nINSTALLATION TERMINÉE — http://localhost:8907/<carte>/reborn/original")
    return 0

if __name__ == "__main__":
    sys.exit(main())
