"""Préchauffage : visite chaque carte pour remplir les caches (serveur + SW).

Usage : python3 prechauffage.py            (toutes les cartes de raw/slugs_webp.txt)
        python3 prechauffage.py <slug>...  (cartes précises)

L'état est sauvegardé dans raw/prechauffe_etat.json : relancer le script reprend
là où il s'est arrêté. Les captures sont dans raw/prechauffe/<slug>.png.
"""
import json
import os
import signal
import sys
import time

from playwright.sync_api import sync_playwright

ICI = os.path.dirname(os.path.abspath(__file__))
PROFIL = os.path.join(ICI, ".profil_nav")
ETAT = os.path.join(ICI, "raw", "prechauffe_etat.json")
CAPT = os.path.join(ICI, "raw", "prechauffe")
DELAI_CANVAS = int(os.environ.get("DELAI_CANVAS", "90"))
DELAI_FIN = int(os.environ.get("DELAI_FIN", "25"))
signal.alarm(int(os.environ.get("DELAI_TOTAL", "3600" if len(sys.argv) > 1 else "21600")))

slugs = sys.argv[1:] or [l.strip() for l in
                         open(os.path.join(ICI, "raw", "slugs_webp.txt")) if l.strip()]
os.makedirs(CAPT, exist_ok=True)
fait = {}
if os.path.isfile(ETAT):
    fait = json.load(open(ETAT))

def journal(*a):
    print(*a, file=sys.stderr, flush=True)

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        PROFIL, viewport={"width": 1280, "height": 720},
        args=["--use-gl=angle", "--enable-webgl"])
    page = ctx.new_page()

    for slug in slugs:
        if fait.get(slug, {}).get("ok"):
            journal(f"[skip] {slug} déjà fait")
            continue
        t0 = time.time()
        entree = {"ok": False, "secondes": 0, "canvas": False, "notes": []}
        try:
            page.goto(f"http://localhost:8907/{slug}/reborn/original",
                      wait_until="commit", timeout=30000)
            try:
                page.wait_for_selector("canvas", timeout=DELAI_CANVAS * 1000)
                entree["canvas"] = True
                time.sleep(DELAI_FIN)
                entree["ok"] = True
            except Exception:
                entree["notes"].append("pas de canvas dans le délai")
                time.sleep(10)
        except Exception as e:
            entree["notes"].append(f"goto: {str(e)[:80]}")
        entree["secondes"] = round(time.time() - t0)
        fait[slug] = entree
        json.dump(fait, open(ETAT, "w"), indent=1)
        try:
            page.screenshot(path=os.path.join(CAPT, f"{slug}.png"), timeout=15000)
        except Exception:
            pass
        journal(f"[{'OK' if entree['ok'] else 'KO'}] {slug} en {entree['secondes']}s "
                f"({len(fait)}/{len(slugs)})")

    ctx.close()

n_ok = sum(1 for v in fait.values() if v.get("ok"))
print(json.dumps({"total": len(slugs), "ok": n_ok}, indent=1))
