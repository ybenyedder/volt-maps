"""Réécrit tous les liens internes des .html téléchargés en URLs racine propres,
sans extension .html, pour que le routeur SPA du site fonctionne en localhost.
"""
import os
import re
import posixpath
from urllib.parse import urlsplit, urljoin, unquote

RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "telechargement")
DOMAINE = "voltmaps.xyz"

MOTIF_ATTR = re.compile(r'((?:href|src)=")([^"]+)(")')

def nettoyer(cible):
    """-> URL racine propre (str) si lien interne local, sinon None (laisser tel quel)."""
    if cible.startswith(("#", "mailto:", "tel:", "data:", "javascript:")):
        return None
    parties = urlsplit(cible)
    if parties.scheme and parties.scheme not in ("http", "https"):
        return None
    if parties.netloc and parties.netloc != DOMAINE:
        return None   # lien externe -> inchangé
    chemin = parties.path or "/"
    if not chemin.startswith("/"):
        chemin = posixpath.normpath(posixpath.join("/", chemin))
    chemin = posixpath.normpath(chemin)
    # retirer l'extension .html des PAGES (pas des assets)
    if chemin.endswith(".html"):
        chemin = chemin[:-5] or "/"
    return chemin + (("?" + parties.query) if parties.query else "") + \
           (("#" + parties.fragment) if parties.fragment else "")

def traiter(chemin_fichier):
    avec_html = os.path.relpath(chemin_fichier, RACINE)
    dossier = posixpath.dirname("/" + avec_html)
    texte = open(chemin_fichier, encoding="utf-8", errors="replace").read()
    def remplacer(m):
        avant, cible, apres = m.groups()
        # interstitiel anti-pub -> aller directement à la page de jeu
        if "verificar-anuncios" in cible and "return=" in cible:
            ex = re.search(r"return=([^&\"']+)", cible)
            if ex:
                dest = unquote(unquote(ex.group(1)))
                dest = posixpath.normpath(posixpath.join("/", dest))
                if dest.endswith(".html"):
                    dest = dest[:-5]
                return f'{avant}/{dest.lstrip("/")}{apres}'
        propre = nettoyer(cible)
        if propre is None:
            return m.group(0)
        url = urljoin(dossier + "/", propre.lstrip("/"))
        url = posixpath.normpath(url)
        if url.endswith(".html"):
            url = url[:-5]
        return f'{avant}/{url.lstrip("/")}{apres}'
    nouveau = MOTIF_ATTR.sub(remplacer, texte)
    if nouveau != texte:
        open(chemin_fichier, "w", encoding="utf-8").write(nouveau)
        return True
    return False

total = modifies = 0
for racine, _, fichiers in os.walk(RACINE):
    for f in fichiers:
        if f.endswith(".html"):
            total += 1
            if traiter(os.path.join(racine, f)):
                modifies += 1
print(f"{modifies}/{total} fichiers HTML réécrits")
