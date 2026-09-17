"""Vérification du patch « mot du jour » + Échap côté launcher.

Usage : python3 inspect_mot.py <slug>
1. Boot la carte (le launcher patche RANDOMKZN → VOLTMAPS au menu).
2. Ferme le popup de don, lance une partie, capture les trains.
3. Journalise toutes les lignes console [launch].
"""
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

SLUG = sys.argv[1] if len(sys.argv) > 1 else "paris"
URL = f"http://localhost:8907/{SLUG}/reborn/enhanced"
DELAI_MAX = int(os.environ.get("DELAI_MAX", "360"))
PROFIL = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".profil_nav")

def journal(*a):
    print(*a, file=sys.stderr, flush=True)

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        PROFIL, viewport={"width": 1280, "height": 720},
        args=["--use-gl=angle", "--enable-webgl", "--ignore-certificate-errors"])
    ctx.set_default_timeout(10000)
    page = ctx.new_page()

    lignes = []
    def console(msg):
        t = msg.text
        if "[launch]" in t or "mot du jour" in t:
            lignes.append(t[:200])
            journal("CONSOLE:", t[:200])
    page.on("console", console)

    t0 = time.time()
    page.goto(URL, wait_until="domcontentloaded", timeout=30000)
    journal(f"page chargée t+{int(time.time()-t0)}s")

    # attendre la fin d'activation (barre 100 % + quelques secondes)
    actif = False
    while time.time() - t0 < DELAI_MAX:
        time.sleep(10)
        try:
            etat = page.evaluate(
                "() => ({barre: (() => { const b = document.getElementById('barre');"
                " return b ? b.style.width : '?'; })(),"
                " invite: (() => { const i = document.getElementById('invite-demarrage');"
                " return i ? getComputedStyle(i).display : '?'; })() })")
            journal(f"t+{int(time.time()-t0)}s {etat}")
            if etat.get("barre") == "100%":
                if not actif:
                    actif = True
                    # le moteur tourne : cliquer pour lancer le dessin du menu
                    page.mouse.click(640, 400)
                # le popup de don peut bloquer : tenter ✕ puis recliquer
                if etat.get("invite") == "flex":
                    page.mouse.click(905, 205)   # ✕ du popup
                    time.sleep(1.5)
                    page.mouse.click(640, 400)   # menu
            if etat.get("invite") == "none":
                break
        except Exception as e:
            journal(f"t+{int(time.time()-t0)}s evaluate lent: {e}")

    time.sleep(5)
    page.screenshot(path=f"raw/mot_{SLUG}_menu.png", timeout=20000)
    journal(f"menu t+{int(time.time()-t0)}s, lignes [launch] : {len(lignes)}")

    # lancer une partie et capturer les trains
    page.mouse.click(640, 500)
    time.sleep(2.5)
    page.mouse.click(640, 500)
    for n in range(4):
        time.sleep(6)
        page.screenshot(path=f"raw/mot_{SLUG}_run_{n}.png", timeout=20000)
        journal(f"capture run {n} t+{int(time.time()-t0)}s")

    print(json.dumps({"lignes_launch": lignes}, indent=1, ensure_ascii=False))
    try:
        ctx.close()
    except Exception:
        pass
