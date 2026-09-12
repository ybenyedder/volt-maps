"""Force brute : retrouve la clé publique Ed25519 embarquée dans le wasm.

Scanne toutes les fenêtres de 32 octets du fichier et teste chacune contre une
paire (message, signature) authentique (token accepté par le client).
Usage : python3 brute_force_cle.py [wasm|data]
"""
import base64
import json
import os
from concurrent.futures import ProcessPoolExecutor

DOSSIER = os.path.dirname(os.path.abspath(__file__))
m = json.load(open(os.path.join(DOSSIER, "telechargement", "maps.json")))
parties = m["paris"]["activationToken"].split(".")
MSG = (parties[0] + "." + parties[1]).encode()
SIG = base64.urlsafe_b64decode(parties[2] + "=" * ((4 - len(parties[2]) % 4) % 4))


def travail(args):
    chemin, debut, fin = args
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    with open(chemin, "rb") as f:
        f.seek(debut)
        data = f.read(fin - debut)
    verif = Ed25519PublicKey.from_public_bytes
    for p in range(len(data) - 32):
        fen = data[p:p + 32]
        try:
            verif(fen).verify(SIG, MSG)
            return debut + p, fen.hex()
        except Exception:
            continue
    return None


if __name__ == "__main__":
    import sys
    cible = sys.argv[1] if len(sys.argv) > 1 else "wasm"
    chemin = os.path.join(
        DOSSIER, "telechargement", "builds", "shared",
        "enhanced-local-20260907t045830z", "Build",
        "reborn-shared.wasm.br" if cible == "wasm" else "reborn-shared.data.br")
    taille = os.path.getsize(chemin)
    N = 192
    pas = max(1, taille // N)
    taches = [(chemin, i * pas, min(taille, (i + 1) * pas + 31)) for i in range(N)]
    import time
    t0 = time.time()
    with ProcessPoolExecutor(max_workers=24) as ex:
        for r in ex.map(travail, taches):
            if r:
                print("★ CLÉ TROUVÉE @", hex(r[0]), "=", r[1], flush=True)
                json.dump({"fichier": cible, "offset": r[0], "publique": r[1]},
                          open(os.path.join(DOSSIER, "raw", "cle_publique_trouvee.json"), "w"))
                break
        else:
            print(f"{cible} épuisé ({time.time()-t0:.0f}s), rien trouvé", flush=True)
