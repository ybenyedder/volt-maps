"""Préchauffage complet : lance chaque carte pour tout mettre dans le cache
serveur (cache/) et le cache du navigateur. Reprisable : les cartes déjà
marquées ok dans raw/prechauffe_v2.json sont sautées.

Usage : python3 rechauffer_tout.py [slug1 slug2 …]
"""
import asyncio
import json
import os
import sys
import time

from playwright.async_api import async_playwright

ICI = os.path.dirname(os.path.abspath(__file__))
PROFIL = os.path.join(ICI, ".profil_nav")
ETAT = os.path.join(ICI, "raw", "prechauffe_v2.json")
BASE = "http://localhost:8907"

slugs = sys.argv[1:]
if not slugs:
    maps = json.load(open(os.path.join(ICI, "telechargement", "maps.json")))
    slugs = sorted(maps)

etat = {}
if os.path.isfile(ETAT):
    etat = json.load(open(ETAT))

def journal(*a):
    print(*a, flush=True)

async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            PROFIL, viewport={"width": 960, "height": 600},
            args=["--use-gl=angle", "--enable-webgl"])
        page = await ctx.new_page()
        autorise = asyncio.Event()

        def on_console(m):
            if "Reborn session authorized" in m.text:
                autorise.set()

        for slug in slugs:
            if etat.get(slug, {}).get("ok"):
                journal(f"[skip] {slug}")
                continue
            t0 = time.time()
            ok = False
            page.remove_listener("console", on_console) if False else None
            page.on("console", on_console)
            try:
                autorise.clear()
                await page.goto(f"{BASE}/#jouer={slug}", wait_until="domcontentloaded")
                try:
                    await asyncio.wait_for(autorise.wait(), timeout=150)
                    # laisse le contenu se télécharger dans les caches
                    await page.wait_for_timeout(45000)
                    ok = True
                except asyncio.TimeoutError:
                    journal(f"[warn] {slug} : pas d'autorisation en 150 s")
            except Exception as e:
                journal(f"[erreur] {slug}: {str(e)[:100]}")
            finally:
                try:
                    page.remove_listener("console", on_console)
                except Exception:
                    pass
            etat[slug] = {"ok": ok, "secondes": round(time.time() - t0)}
            json.dump(etat, open(ETAT, "w"), indent=1)
            journal(f"[{'OK' if ok else 'KO'}] {slug} en {round(time.time()-t0)} s")
        await ctx.close()

asyncio.run(main())
