"""Diagnostic : état du SW, messages console complets, DOM visible après boot."""
import sys
import time

from playwright.sync_api import sync_playwright

URL = f"http://localhost:8907/{sys.argv[1] if len(sys.argv) > 1 else "atlanta"}/reborn/original"
PROFIL = "/home/cvsbd/Téléchargements/projet_tavvkkj/benchmark-voltmaps/.profil_nav"

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        PROFIL, viewport={"width": 1280, "height": 720},
        args=["--use-gl=angle", "--enable-webgl"])
    page = ctx.new_page()
    page.on("console", lambda m: print(f"[{m.type}] {m.text[:220]}", flush=True))
    page.on("pageerror", lambda e: print(f"[pageerror] {str(e)[:220]}", flush=True))

    page.goto(URL, wait_until="commit", timeout=30000)
    print("== page lancée, attente 75 s", flush=True)
    time.sleep(75)

    etat = page.evaluate("""async () => {
      const r = navigator.serviceWorker ? await navigator.serviceWorker.getRegistrations() : [];
      const regs = [];
      for (const reg of r) regs.push({scope: reg.scope, state: reg.active ? reg.active.state : (reg.installing ? 'installing' : reg.waiting ? 'waiting' : 'aucun')});
      const l = globalThis.__launch_brut;
      let launch = null;
      if (l) launch = {authorized: l.authorized, mode: l.mode, buildId: l.buildId, slug: l.slug, hasActivate: typeof l.activate};
      const texte = (document.body.innerText || '').slice(0, 600);
      const canvas = !!document.querySelector('canvas');
      return {regs, controller: navigator.serviceWorker ? !!navigator.serviceWorker.controller : null, launch, texte, canvas};
    }""")
    import json
    print(json.dumps(etat, indent=1, ensure_ascii=False))
    page.screenshot(path="raw/diag_atlanta.png")
    ctx.close()
