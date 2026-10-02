"""Audit boot du miroir déployé : galerie + training + pogo.

Usage : python3 audit_boot.py
1. Galerie publique (https://nocoin.webtvmedia.net/) : cartes présentes,
   modale beijing propose bien /training/beijing/.
2. Boot /training/beijing/ (LAN 8907) jusqu'au menu + capture.
3. Boot /pogo/paris/ (LAN 8907) jusqu'au menu + capture, vérifie commun.js
   v4 chargé et absence d'erreur fatale.
"""
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

PROFIL = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".profil_audit")
PUBLIC = "https://nocoin.webtvmedia.net"
LAN = "http://192.168.1.87:8907"
RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw")


def journal(*a):
    print(*a, file=sys.stderr, flush=True)


with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        PROFIL, viewport={"width": 1280, "height": 720},
        args=["--use-gl=angle", "--enable-webgl", "--ignore-certificate-errors"])
    ctx.set_default_timeout(15000)
    page = ctx.new_page()

    erreurs = []          # (phase, texte) — un seul handler pour toute la session
    phase = ["galerie"]

    def on_console(msg):
        t = msg.text
        if msg.type == "error" or "error" in t.lower()[:80]:
            erreurs.append((phase[0], t[:300]))

    page.on("console", on_console)

    def err_de(ph):
        return [t for ph2, t in erreurs if ph2 == ph]

    # ——— 1. galerie publique ———
    page.goto(PUBLIC + "/", wait_until="domcontentloaded", timeout=40000)
    page.wait_for_selector("#grille a.carte", timeout=20000)
    nb_cartes = page.evaluate("() => document.querySelectorAll('#grille a.carte').length")
    journal(f"galerie: {nb_cartes} cartes, erreurs console: {len(err_de('galerie'))}")
    page.click('#grille a.carte[href="#jouer=beijing"]')
    page.wait_for_selector("#modale:not([hidden])", timeout=5000, state="attached")
    time.sleep(0.5)
    href_training = page.evaluate(
        "() => document.getElementById('choix-training').getAttribute('href')")
    href_pogo = page.evaluate(
        "() => { const b = document.getElementById('choix-pogo');"
        " return [!b.hidden, b.getAttribute('href')]; }")
    journal(f"modale beijing → training: {href_training} ; pogo: {href_pogo}")
    page.screenshot(path=os.path.join(RAW, "audit_galerie.png"), timeout=20000)
    page.click("#modale-fermer")

    # ——— 2. boot training/beijing ———
    phase[0] = "training"
    t0 = time.time()
    page.goto(LAN + "/training/beijing/", wait_until="domcontentloaded", timeout=40000)
    canvas_menu = False
    while time.time() - t0 < 300:
        time.sleep(8)
        etat = page.evaluate("""() => ({
            canvas: (() => { const c = document.querySelector('canvas');
                return c ? [c.width, c.height] : null; })(),
        })""")
        journal(f"training t+{int(time.time()-t0)}s canvas={etat.get('canvas')} "
                f"err={len(err_de('training'))}")
        if etat.get("canvas") and etat["canvas"] != [300, 150] and etat["canvas"][0] > 400:
            canvas_menu = True
            break
    time.sleep(6)
    page.mouse.click(640, 400)   # démarrer / passer age gate éventuel
    time.sleep(3)
    page.screenshot(path=os.path.join(RAW, "audit_training_beijing.png"), timeout=20000)
    journal(f"training: canvas_menu={canvas_menu}, t={int(time.time()-t0)}s, "
            f"erreurs: {err_de('training')[:6]}")

    # ——— 3. boot pogo/paris ———
    phase[0] = "pogo"
    t0 = time.time()
    page.goto(LAN + "/pogo/paris/", wait_until="domcontentloaded", timeout=40000)
    menu = False
    while time.time() - t0 < 300:
        time.sleep(8)
        etat = page.evaluate("""() => ({
            progres: window.__pogoProgres !== undefined ? window.__pogoProgres : null,
            erreur: (() => { const e = document.getElementById('pogo-erreur');
                return e && e.classList.contains('visible')
                    ? document.getElementById('pogo-erreur-msg').textContent : null; })(),
            canvas: (() => { const c = document.querySelector('canvas');
                return c ? [c.width, c.height] : null; })(),
        })""")
        journal(f"pogo t+{int(time.time()-t0)}s {etat} err={len(err_de('pogo'))}")
        if etat.get("erreur"):
            break
        if (etat.get("progres") is not None and etat["progres"] >= 0.99
                and etat.get("canvas") and etat["canvas"][0] > 400
                and etat["canvas"] != [300, 150]):
            menu = True
            time.sleep(4)
            break
    page.screenshot(path=os.path.join(RAW, "audit_pogo_paris.png"), timeout=20000)
    journal(f"pogo: menu={menu}, t={int(time.time()-t0)}s, erreurs: {err_de('pogo')[:6]}")

    print(json.dumps({
        "galerie_nb_cartes": nb_cartes,
        "beijing_training_href": href_training,
        "beijing_pogo": href_pogo,
        "training_canvas_menu": canvas_menu,
        "training_erreurs": err_de("training")[:10],
        "pogo_menu": menu,
        "pogo_erreurs": err_de("pogo")[:10],
    }, indent=1, ensure_ascii=False))
    try:
        ctx.close()
    except Exception:
        pass
