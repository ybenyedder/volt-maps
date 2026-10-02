#!/usr/bin/env python3
"""Training — récupération des maps training du repo GitHub du dev.

Repo : https://github.com/ybenyedder/Map-training- (builds self-portés,
page <carte>.html + Build/ + loaders 4399/UnityLoader/poki). Chaque page
<slug>.html du repo devient /training/<slug>/ sur le miroir, avec :
  - une copie index.html (le serveur sert les dossiers, pas les .html) ;
  - le fix « loaderContainer » dans master-loader.js (variable jamais
    déclarée dans le repo : le script plantait avant de charger le jeu) ;
  - Build/ et les loaders copiés tels quels.

Usage :
  python3 training_outils.py recuperer   # clone/pull le repo + synchronise
  python3 training_outils.py inventaire  # état local
"""
import os
import re
import shutil
import subprocess
import sys

RACINE = os.path.dirname(os.path.abspath(__file__))
DEPOT = "https://github.com/ybenyedder/Map-training-.git"
CLONE = os.path.join(RACINE, "cache", "Map-training")
DEST = os.path.join(RACINE, "telechargement", "training")


def _url_authentifiee():
    """Le repo étant privé, on réutilise le PAT déjà configuré dans le remote
    du dépôt volt-maps local (il ne vit QUE dans .git/config, jamais ici)."""
    try:
        cfg = subprocess.run(
            ["git", "-C", RACINE, "config", "remote.origin.url"],
            capture_output=True, text=True, check=True).stdout.strip()
        m = re.match(r"https://([^@]+)@github\.com/", cfg)
        if m:
            return DEPOT.replace("https://", "https://" + m.group(1) + "@")
    except Exception:
        pass
    return DEPOT


def _recuperer_depot():
    if os.path.isdir(os.path.join(CLONE, ".git")):
        subprocess.run(["git", "-C", CLONE, "fetch", "origin"], check=True)
        subprocess.run(["git", "-C", CLONE, "reset", "--hard", "origin/HEAD"],
                       check=True)
    else:
        os.makedirs(os.path.dirname(CLONE), exist_ok=True)
        subprocess.run(["git", "clone", "--depth", "1", _url_authentifiee(), CLONE], check=True)


def _pages():
    """Pages <slug>.html du repo (une par map training)."""
    if not os.path.isdir(CLONE):
        return []
    return sorted(f[:-5] for f in os.listdir(CLONE)
                  if f.endswith(".html") and not f.startswith("index"))


def _fix_loader_container(dossier):
    """Le master-loader.js du repo référence `loaderContainer` sans jamais le
    déclarer : ReferenceError au chargement, le jeu ne démarre jamais."""
    p = os.path.join(dossier, "master-loader.js")
    if not os.path.isfile(p):
        return
    src = open(p).read()
    if "var loaderContainer = document.getElementById" in src:
        return
    avant = ("// Remove hidden loader subtree to reduce style/layout work "
             "after gameplay begins.\n"
             "    if (loaderContainer.parentNode) loaderContainer"
             ".parentNode.removeChild(loaderContainer);")
    apres = ("// Remove hidden loader subtree to reduce style/layout work "
             "after gameplay begins.\n"
             "    var loaderContainer = document.getElementById"
             "(\"loader-container\");\n"
             "    if (loaderContainer && loaderContainer.parentNode) "
             "loaderContainer.parentNode.removeChild(loaderContainer);")
    if avant in src:
        open(p, "w").write(src.replace(avant, apres))
        print(f"  fix loaderContainer appliqué ({os.path.basename(dossier)})")
    else:
        print(f"  ⚠️ motif loaderContainer non trouvé dans master-loader.js")


def _sync_slug(slug):
    source = CLONE
    dossier = os.path.join(DEST, slug)
    os.makedirs(dossier, exist_ok=True)
    # tout le repo est le contenu de la map (build + loaders + page)
    for nom in os.listdir(source):
        if nom == ".git":
            continue
        src = os.path.join(source, nom)
        if os.path.isdir(src):
            dst = os.path.join(dossier, nom)
            if os.path.isdir(dst):
                shutil.rmtree(dst)
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, os.path.join(dossier, nom))
    # la page du repo devient index.html (le serveur sert les dossiers)
    shutil.copy2(os.path.join(dossier, slug + ".html"),
                 os.path.join(dossier, "index.html"))
    _fix_loader_container(dossier)
    print(f"  /training/{slug}/ synchronisé")


def recuperer():
    _recuperer_depot()
    pages = _pages()
    if not pages:
        print("aucune page <carte>.html dans le repo")
        return
    for slug in pages:
        _sync_slug(slug)
    # nettoie les maps locales qui ne sont plus dans le repo
    if os.path.isdir(DEST):
        for nom in os.listdir(DEST):
            if nom not in pages:
                print(f"  ⚠️ /training/{nom}/ n'est plus dans le repo "
                      f"(laissé en place)")


def inventaire():
    if not os.path.isdir(DEST):
        print("aucune map training locale")
        return
    for nom in sorted(os.listdir(DEST)):
        dossier = os.path.join(DEST, nom)
        if not os.path.isdir(dossier):
            continue
        total = 0
        manques = []
        for racine, _, fichiers in os.walk(dossier):
            for f in fichiers:
                total += os.path.getsize(os.path.join(racine, f))
        if not os.path.isfile(os.path.join(dossier, "index.html")):
            manques.append("index.html")
        etat = "OK" if not manques else "manque " + ", ".join(manques)
        print(f"/training/{nom}/ : {etat} ({total // 1024 // 1024} Mo)")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "inventaire"
    if cmd == "recuperer":
        recuperer()
    elif cmd == "inventaire":
        inventaire()
    else:
        print(__doc__)
