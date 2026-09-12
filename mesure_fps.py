"""Mesure FPS + temps de chargement pour chaque carte Reborn préchauffée.

Usage : python3 mesure_fps.py [<slug>...]
Résultats : raw/fps_cartes.json (cumulatif) + captures raw/fps/<slug>.png
"""
import json
import os
import signal
import statistics
import sys
import time

from playwright.sync_api import sync_playwright

ICI = os.path.dirname(os.path.abspath(__file__))
PROFIL = os.path.join(ICI, ".profil_nav")
RESULTATS = os.path.join(ICI, "raw", "fps_cartes.json")
CAPT = os.path.join(ICI, "raw", "fps")
DUREE_MESURE = int(os.environ.get("DUREE_MESURE", "12"))
signal.alarm(int(os.environ.get("DELAI_TOTAL", "900")))

slugs = sys.argv[1:] or [l.strip() for l in
                         open(os.path.join(ICI, "raw", "slugs_webp.txt")) if l.strip()]
os.makedirs(CAPT, exist_ok=True)
resultats = {}
if os.path.isfile(RESULTATS):
    resultats = json.load(open(RESULTATS))

def journal(*a):
    print(*a, file=sys.stderr, flush=True)

MESURE_RAF = """
(async () => {
  const delai = %d;
  const images = [];
  const t0 = performance.now();
  return await new Promise((fini) => {
    function boucle(t) {
      images.push(t);
      if (performance.now() - t0 >= delai * 1000) return fini(images);
      requestAnimationFrame(boucle);
    }
    requestAnimationFrame(boucle);
  });
})()
"""

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        PROFIL, viewport={"width": 1280, "height": 720},
        args=["--use-gl=angle", "--enable-webgl"])
    ctx.set_default_timeout(45000)
    page = ctx.new_page()

    for slug in slugs:
        if resultats.get(slug, {}).get("ok"):
            journal(f"[skip] {slug}")
            continue
        entree = {"ok": False, "chargement_s": None, "fps_moyen": None,
                  "fps_min": None, "ecart_type": None}
        try:
            t0 = time.time()
            page.goto(f"http://localhost:8907/{slug}/reborn/original",
                      wait_until="commit", timeout=30000)
            page.wait_for_selector("canvas", timeout=90000)
            # attendre la fin du splash (jeu chargé)
            for _ in range(40):
                time.sleep(2)
                fini = page.evaluate(
                    "() => {const s=document.querySelector('.boot-splash');"
                    "return !s || getComputedStyle(s).display==='none';}")
                if fini:
                    break
            entree["chargement_s"] = round(time.time() - t0, 1)
            # lancer le gameplay (Espace) puis mesurer
            # le jeu a son propre écran de chargement interne (astuce + LOADING) :
            # laisser finir, puis lancer le gameplay
            time.sleep(12)
            try:
                page.keyboard.press("Space")
            except Exception:
                pass
            time.sleep(5)
            images = page.evaluate(MESURE_RAF % DUREE_MESURE)
            deltas = [b - a for a, b in zip(images, images[1:]) if b > a]
            if deltas:
                fps = [1000.0 / d for d in deltas if d > 0]
                entree["fps_moyen"] = round(statistics.mean(fps), 1)
                entree["fps_min"] = round(min(fps), 1)
                entree["ecart_type"] = round(statistics.pstdev(fps), 1)
            entree["ok"] = True
            page.screenshot(path=os.path.join(CAPT, f"{slug}.png"), timeout=15000)
        except Exception as e:
            entree["erreur"] = str(e)[:120]
        resultats[slug] = entree
        json.dump(resultats, open(RESULTATS, "w"), indent=1)
        journal(f"[{'OK' if entree['ok'] else 'KO'}] {slug} "
                f"charge={entree['chargement_s']}s fps={entree['fps_moyen']} "
                f"(min {entree['fps_min']})")

    ctx.close()

n_ok = sum(1 for v in resultats.values() if v.get("ok"))
print(json.dumps({"total": len(resultats), "ok": n_ok}, indent=1))
