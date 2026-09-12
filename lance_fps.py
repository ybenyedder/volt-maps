"""Lance mesure_fps.py carte par carte avec un timeout dur (subprocess)."""
import json
import os
import subprocess
import sys
import time

ICI = "/home/pc/web/benchmark-voltmaps"
LISTE = os.path.join(ICI, "raw", "slugs_jouables.txt")
ETAT = os.path.join(ICI, "raw", "fps_cartes.json")
TIMEOUT = 240

slugs = [l.strip() for l in open(LISTE) if l.strip()]
for slug in slugs:
    # sauter si déjà fait (reprise)
    try:
        etat = json.load(open(ETAT))
        if etat.get(slug, {}).get("ok"):
            continue
    except Exception:
        pass
    t0 = time.time()
    try:
        r = subprocess.run([sys.executable, "mesure_fps.py", slug],
                           cwd=ICI, timeout=TIMEOUT,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        code = r.returncode
    except subprocess.TimeoutExpired:
        code = "TIMEOUT"
    print(f"{slug}: {code} en {int(time.time()-t0)}s", flush=True)

print("DONE", flush=True)
