"""Retrouve la clé publique Ed25519 embarquée du joueur Reborn.

Principe : le client vérifie la signature du token d'activation avec une clé
publique compilée dans le build. On possède des paires (message, signature)
authentiques (tokens en cache, acceptés par le client). On balaie les fenêtres
de 32 octets autour des constantes Ed25519 classiques (ordre L, constante d,
point générateur) et on teste chaque candidate : la seule qui vérifie la
signature est la clé embarquée.
"""
import base64
import json
import os
import re
import sys

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

BUILD = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                     "telechargement", "builds", "shared",
                     "enhanced-local-20260907t045830z", "Build")

# constantes Ed25519 (encodages little-endian)
L = bytes.fromhex("edd3f55c1a631258d69cf7a2def9de1400000000000000000000000000000010")
D = bytes.fromhex("a3785913ca4deb75abd841414d0a700098e879777940c78c73fe6f2bee360352")
B = bytes.fromhex("5866666666666666666666666666666666666666666666666666666666666666")

def paires_authentiques(n=3):
    cache = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
    paires = []
    fichiers = [(os.path.getmtime(os.path.join(cache, f)), f)
                for f in os.listdir(cache)
                if f.startswith("reborn-api_v1_activate") and not f.endswith(".type")]
    for _, f in sorted(fichiers, reverse=True)[:40]:
        with open(os.path.join(cache, f), encoding="utf-8") as fh:
            d = json.load(fh)
        tok = d.get("activationToken", "")
        parties = tok.split(".")
        if len(parties) == 3:
            msg = (parties[0] + "." + parties[1]).encode()
            sig = base64.urlsafe_b64decode(parties[2] + "=" * ((4 - len(parties[2]) % 4) % 4))
            if len(sig) == 64:
                paires.append((msg, sig))
        if len(paires) >= n:
            break
    return paires

def verifier(pub: bytes, msg: bytes, sig: bytes) -> bool:
    try:
        Ed25519PublicKey.from_public_bytes(pub).verify(sig, msg)
        return True
    except (InvalidSignature, Exception):
        return False

def candidats(data: bytes, ancre: bytes, rayon=64 * 1024):
    i = data.find(ancre)
    while i >= 0:
        debut = max(0, i - rayon)
        fin = min(len(data), i + len(ancre) + rayon)
        for p in range(debut, fin - 32):
            yield p, data[p:p + 32]
        i = data.find(ancre, i + 1)

def chasse(chemin, paires, rayon):
    data = open(chemin, "rb").read()
    print(f"{os.path.basename(chemin)} : {len(data)/1e6:.0f} Mo", flush=True)
    vus = set()
    for nom, ancre in (("L", L), ("D", D), ("B", B)):
        positions = [m.start() for m in re.finditer(re.escape(ancre), data)]
        print(f"  ancre {nom} : {[hex(p) for p in positions[:8]]}", flush=True)
        for pos in positions:
            for p, cand in candidats(data, ancre, rayon):
                if cand in vus:
                    continue
                vus.add(cand)
                if verifier(cand, *paires[0]):
                    # confirmation croisée sur les autres paires
                    if all(verifier(cand, m, s) for m, s in paires):
                        print(f"  ★ CLÉ TROUVÉE : {hex(p)} = {cand.hex()}", flush=True)
                        return p, cand
    return None, None

if __name__ == "__main__":
    paires = paires_authentiques()
    print(f"{len(paires)} paires (message, signature) authentiques chargées", flush=True)
    rayon = int(sys.argv[1]) if len(sys.argv) > 1 else 64 * 1024
    for f in ("reborn-shared.wasm.br", "reborn-shared.data.br"):
        pos, cle = chasse(os.path.join(BUILD, f), paires, rayon)
        if pos is not None:
            json.dump({"fichier": f, "offset": pos, "publique": base64.urlsafe_b64encode(cle).decode()},
                      open("raw/cle_publique_trouvee.json", "w"), indent=1)
            print("→ raw/cle_publique_trouvee.json")
            break
    else:
        print("clé non trouvée dans les rayons testés — élargir (rayon en arg)")
