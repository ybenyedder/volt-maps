"""Test FPS et métriques de chargement sur voltmaps.xyz (pour vidéo YouTube).

Usage : python3 test_fps.py [url] [duree_mesure_s] [sortie_json]
"""
import json
import platform
import sys
import time

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "https://voltmaps.xyz/"
DUREE = int(sys.argv[2]) if len(sys.argv) > 2 else 10
SORTIE = sys.argv[3] if len(sys.argv) > 3 else f"raw/fps_{URL.split('//')[1].replace('/', '_')}_{int(time.time())}.json"
MODE = sys.argv[4] if len(sys.argv) > 4 else "headless"   # "headless" ou "gpu" (fenêtré, GPU réel)

INJECTION_METRIQUES = """
() => new Promise(resolve => {
  const nav = performance.getEntriesByType('navigation')[0];
  const peintures = performance.getEntriesByType('paint');
  const fcp = peintures.find(p => p.name === 'first-contentful-paint');
  let lcp = null;
  try {
    const entries = performance.getEntriesByType('largest-contentful-paint');
    lcp = entries.length ? entries[entries.length - 1].startTime : null;
  } catch (e) {}
  let mem = null;
  if (performance.memory) mem = performance.memory.usedJSHeapSize;
  resolve({
    ttfb_ms: nav ? nav.responseStart : null,
    dom_interactif_ms: nav ? nav.domContentLoadedEventEnd : null,
    chargement_complet_ms: nav ? nav.loadEventEnd : null,
    transfert_html_ms: nav ? nav.responseEnd - nav.requestStart : null,
    fcp_ms: fcp ? fcp.startTime : null,
    lcp_ms: lcp,
    heap_js_Mo: mem ? mem / 1048576 : null,
    nb_ressources: performance.getEntriesByType('resource').length,
    octets_ressources: performance.getEntriesByType('resource')
      .reduce((a, r) => a + (r.transferSize || 0), 0),
  });
})
"""

INJECTION_FPS = f"""
(compte) => new Promise(resolve => {{
  const t0 = performance.now();
  let n = 0;
  const temps = [];
  function boucle(t) {{
    n++;
    temps.push(t);
    if (t - t0 < compte * 1000) requestAnimationFrame(boucle);
    else {{
      temps.sort((a, b) => a - b);
      // écarts entre frames (pour repérer les à-coups)
      const ecarts = [];
      for (let i = 1; i < temps.length; i++) {{
        const e = temps[i] - temps[i - 1];
        if (e > 25) ecarts.push(Math.round(e));  // frame "manquée" (>25 ms)
      }}
      resolve({{
        duree_reelle_ms: t - t0,
        nb_frames: n,
        fps_moyen: +(n / ((t - t0) / 1000)).toFixed(1),
        frames_lentes: ecarts.length,
        pire_frame_ms: ecarts.length ? Math.max(...ecarts) : 0,
      }});
    }}
  }}
  requestAnimationFrame(boucle);
}})
"""

resultat = {"url": URL, "duree_mesure_s": DUREE, "mode": MODE,
            "horodatage": time.strftime("%Y-%m-%d %H:%M:%S")}

with sync_playwright() as p:
    if MODE == "gpu":
        # fenêtré sur le serveur X réel -> GPU Intel réel au lieu de SwiftShader
        navigateur = p.chromium.launch(headless=False, args=[
            "--disable-extensions", "--window-size=1920,1080",
            "--window-position=0,0", "--autoplay-policy=no-user-gesture-required",
        ])
        contexte = navigateur.new_context(no_viewport=True, locale="fr-FR")
    else:
        navigateur = p.chromium.launch(headless=True, args=["--disable-extensions"])
        contexte = navigateur.new_context(viewport={"width": 1920, "height": 1080}, locale="fr-FR")
    page = contexte.new_page()
    gpu = page.evaluate("() => { const c = document.createElement('canvas'); const g = c.getContext('webgl'); return g ? g.getParameter(g.RENDERER) + ' | ' + g.getParameter(g.VENDOR) : 'WebGL indisponible'; }")
    debut = time.time()
    page.goto(URL, wait_until="load", timeout=60000)
    temps_chargement = time.time() - debut
    page.wait_for_timeout(2500)  # laisser l'anim/scene WebGL démarrer
    metriques = page.evaluate(INJECTION_METRIQUES)
    fps = page.evaluate(INJECTION_FPS, DUREE)
    resultat.update({
        "gpu_webgl": gpu,
        "chargement_wallclock_s": round(temps_chargement, 2),
        "metriques_chargement": metriques,
        "fps": fps,
    })
    navigateur.close()

print(json.dumps(resultat, indent=2, ensure_ascii=False))
with open(SORTIE, "w") as f:
    json.dump(resultat, f, indent=2, ensure_ascii=False)
print(f"\n-> sauvegardé dans {SORTIE}", file=sys.stderr)
