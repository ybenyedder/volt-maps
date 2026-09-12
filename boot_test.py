"""Test de boot d'une carte Reborn en localhost via Playwright.

Usage : python3 boot_test.py <slug> [variant]   (défaut variant=original)
Sortie : raw/boot_<slug>_<variant>.png + JSON sur stdout.

Succès si : canvas Unity présent, écran d'échec "Startup stopped" absent,
et le canvas rend autre chose qu'une image noire unie.
"""
import json
import os
import signal
import sys
import time

from playwright.sync_api import sync_playwright

SLUG = sys.argv[1] if len(sys.argv) > 1 else "atlanta"
VARIANT = sys.argv[2] if len(sys.argv) > 2 else "original"
URL = f"http://localhost:8907/{SLUG}/reborn/{VARIANT}"
DELAI_MAX = int(os.environ.get("DELAI_MAX", "120"))
PROFIL = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".profil_nav")

# garde-fou : le script ne peut pas dépasser ce délai, quitte à écrire son JSON
signal.alarm(int(os.environ.get("DELAI_TOTAL", "300")))

resultat = {"slug": SLUG, "variant": VARIANT, "url": URL,
            "erreurs_console": [], "startup_stopped": False,
            "canvas": False, "canvas_pixels": 0, "boot_ok": False}

def journal(*a):
    print(*a, file=sys.stderr, flush=True)

# observé par le hook init : le framework définit __VOLTMAPS_REBORN_LAUNCH__ ;
# on enveloppe activate() pour voir le receipt réellement retourné au moteur
HOOK_INIT = """
Object.defineProperty(window, '__VOLTMAPS_REBORN_LAUNCH__', {
  configurable: true,
  set: function (v) {
    try {
      var orig = v.activate.bind(v);
      v.activate = function (p) {
        return orig(p).then(function (r) {
          try { console.warn('[HOOK] receipt: ' + JSON.stringify(r).slice(0, 500)); } catch (e) {}
          return r;
        }, function (e) {
          try { console.warn('[HOOK] activate err: ' + (e && (e.code || e.message))); } catch (x) {}
          throw e;
        });
      };
      window.__launch_brut = v;
    } catch (e) {}
    return v;
  },
  get: function () { return window.__launch_brut; }
});
"""

with sync_playwright() as p:
    # profil persistant : le Cache Storage (build partagée 191 MB, contenu des
    # cartes) survit entre les tests au lieu d'être retéléchargé à chaque fois
    ctx = p.chromium.launch_persistent_context(
        PROFIL, viewport={"width": 1280, "height": 720},
        args=["--use-gl=angle", "--enable-webgl", "--ignore-certificate-errors"])
    ctx.add_init_script(HOOK_INIT)
    ctx.set_default_timeout(8000)
    page = ctx.new_page()

    def console(msg):
        t = msg.type
        if t in ("error", "warning"):
            texte = msg.text[:300]
            if "YO]" in texte:      # instrumentation de boot, non bloquante
                return
            resultat["erreurs_console"].append(f"{t}: {texte}")
            journal("console:", texte[:160])
            if "Startup stopped" in texte or "authorization failed" in texte:
                resultat["startup_stopped"] = True

    page.on("console", console)

    t0 = time.time()
    try:
        page.goto(URL, wait_until="domcontentloaded", timeout=30000)
        journal("page chargée")
    except Exception as e:
        resultat["erreurs_console"].append(f"goto: {e}")

    try:
        page.wait_for_selector("canvas", timeout=60000)
        resultat["canvas"] = True
        journal("canvas présent")
    except Exception:
        journal("pas de canvas")

    # boucle d'attente bornée : splash disparu ou "Startup stopped" vu
    while time.time() - t0 < DELAI_MAX and not resultat["startup_stopped"]:
        time.sleep(5)
        try:
            fini = page.evaluate(
                "() => {const s=document.querySelector('.boot-splash');"
                "const c=document.getElementById('chargement');"
                "const f1 = !s || getComputedStyle(s).display==='none';"
                "const f2 = !c || c.classList.contains('parti');"
                "return f1 && f2;}")
            journal(f"t+{int(time.time()-t0)}s splash_fini={fini}")
            if fini and time.time() - t0 > 25:
                break
        except Exception:
            journal(f"t+{int(time.time()-t0)}s evaluate lent (jeu occupé)")

    time.sleep(3)
    capture = f"raw/boot_{SLUG}_{VARIANT}.png"
    try:
        page.screenshot(path=capture, timeout=20000)
        journal("screenshot ok")
    except Exception as e:
        journal(f"screenshot échoué: {e}")

    try:
        box = page.evaluate(
            "() => {const c=document.querySelector('canvas');"
            "if(!c) return null; const r=c.getBoundingClientRect();"
            "return {x:r.x,y:r.y,w:r.width,h:r.height};}")
        if box and box["w"] > 10:
            page.screenshot(path=capture.replace(".png", "_canvas.png"),
                            clip={"x": box["x"], "y": box["y"],
                                  "width": min(box["w"], 1279),
                                  "height": min(box["h"], 719)}, timeout=20000)
    except Exception as e:
        journal(f"capture canvas échouée: {e}")

    try:
        ctx.close()
    except Exception:
        pass

for suf in ("", "_canvas"):
    f = f"raw/boot_{SLUG}_{VARIANT}{suf}.png"
    if os.path.isfile(f):
        taille = os.path.getsize(f)
        resultat["canvas_pixels"] = max(resultat["canvas_pixels"], taille)
resultat["boot_ok"] = (resultat["canvas"] and not resultat["startup_stopped"]
                       and resultat["canvas_pixels"] > 40000)
print(json.dumps(resultat, indent=1, ensure_ascii=False))
