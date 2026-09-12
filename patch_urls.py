"""(Re)télécharge les fichiers JS/config amont et remplace les origines absolues
par l'origine locale. À relancer si on change le port.

Usage : python3 patch_urls.py [port]   (défaut 8907)
"""
import os
import sys
import urllib.request

PORT = sys.argv[1] if len(sys.argv) > 1 else "8907"
LOCAL = f"http://localhost:{PORT}"
ASSETS = "telechargement/assets"
TS = "enhanced-local-20260907t045830z"

FICHIERS = {
    f"{ASSETS}/BjqKbfPm.js": "https://voltmaps.xyz/assets/BjqKbfPm.js",
    f"{ASSETS}/BtGkcfgb.js": "https://voltmaps.xyz/assets/BtGkcfgb.js",
    f"{ASSETS}/COrjv8-3.js": "https://voltmaps.xyz/assets/COrjv8-3.js",
    f"{ASSETS}/DgT0koWS.js": "https://voltmaps.xyz/assets/DgT0koWS.js",
    f"{ASSETS}/W4C2wK_u.js": "https://voltmaps.xyz/assets/W4C2wK_u.js",
    f"telechargement/reborn/config/shared-{TS}.json":
        f"https://voltmaps.xyz/reborn/config/shared-{TS}.json",
}

def obtenir(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()

for dest, url in FICHIERS.items():
    try:
        brut = obtenir(url).decode("utf-8")
        # les origines deviennent l'origine LOCALE (new URL(x, base) reste valide)
        patche = brut.replace("https://assets.voltmaps.xyz", LOCAL)
        patche = patche.replace("https://voltmaps.xyz", LOCAL)
        # l'API reborn passe par le proxy local (pas de CORS depuis localhost)
        patche = patche.replace("https://reborn.voltmaps.xyz", LOCAL + "/reborn-api")
        # le mode "protected-streaming" est spécifique au vrai serveur -> chemin standard
        patche = patche.replace('"same-origin-protected-streaming"', '"standard"')
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "w", encoding="utf-8") as f:
            f.write(patche)
        n = brut.count("https://assets.voltmaps.xyz") + brut.count("https://voltmaps.xyz")
        print(f"patché {dest} ({n} occurrences -> {LOCAL})")
    except Exception as e:
        print(f"ECHEC {dest} : {e}")
