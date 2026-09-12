"""Change le texte du popup d'avertissement du jeu (toutes les langues).

Le texte vit dans les tables de localisation (TextAsset `*_locale`) du bundle
`data.unity3d` embarqué dans `reborn-shared.data.br`. Ce script :
  1. extrait le bundle du conteneur UnityWebData ;
  2. édite les clés CLOUDSAVE_STATUS_ORIGIN_* dans chaque langue (UnityPy) ;
  3. ré-empacte le bundle (LZ4) et reconstruit le conteneur (offsets à jour) ;
  4. met à jour `reborn/config/shared-enhanced-local-*.json` (taille + sha256) ;
  5. incrémente le `?v=N` de `dataUrl` dans `index.html` (invalidation UnityCache).

Usage — deux façons de personnaliser le texte :

  A) éditer le dictionnaire TEXTE ci-dessous puis :
     python3 changer_texte_popup.py

  B) en ligne de commande (titre, info1, info2, [bouton]) :
     python3 changer_texte_popup.py "Mon titre" "Ma ligne 1\nMa ligne 2" "Ma note"
     python3 changer_texte_popup.py "Mon titre" "Ma ligne 1" "Ma note" "Mon bouton"

Dans les textes, « \\n » = retour à la ligne. Relancer le script est sans risque :
il repart du fichier actuel et réapplique les nouveaux textes.
"""
import hashlib
import json
import re
import struct
import sys
import time

import UnityPy

BUILD = "telechargement/builds/shared/enhanced-local-20260907t045830z/Build"
DATA = BUILD + "/reborn-shared.data.br"
CONFIG = "telechargement/reborn/config/shared-enhanced-local-20260907t045830z.json"
INDEX = "telechargement/index.html"

# ←←← LE TEXTE DU POPUP PAR DÉFAUT (appliqué à toutes les langues) ↓↓↓
TEXTE = {
    "CLOUDSAVE_STATUS_ORIGIN_TITLE": "Miroir local",
    "CLOUDSAVE_STATUS_ORIGIN_INFO1": "Tu joues sur ton miroir local —\naucune connexion requise.",
    "CLOUDSAVE_STATUS_ORIGIN_INFO2": "Les runs faites ici ne comptent pas\nsur speedrun.com.",
    # CLOUDSAVE_STATUS_ORIGIN_BUTTON : le bouton ouvre le site d'origine ;
    # décommenter pour changer son libellé :
    # "CLOUDSAVE_STATUS_ORIGIN_BUTTON": "Continuer",
}
# ↑↑↑


def textes_a_appliquer():
    """Priorité aux arguments CLI : titre, info1, info2 [, bouton]."""
    textes = dict(TEXTE)
    if len(sys.argv) >= 4:
        # « \n » tapé dans le shell devient un vrai retour à la ligne
        args = [a.replace("\\n", "\n") for a in sys.argv[1:]]
        textes["CLOUDSAVE_STATUS_ORIGIN_TITLE"] = args[0]
        textes["CLOUDSAVE_STATUS_ORIGIN_INFO1"] = args[1]
        textes["CLOUDSAVE_STATUS_ORIGIN_INFO2"] = args[2]
        if len(args) >= 4:
            textes["CLOUDSAVE_STATUS_ORIGIN_BUTTON"] = args[3]
    return textes


def incrementer_version_data():
    """Buste l'UnityCache du navigateur : ?v=N → ?v=N+1 sur dataUrl."""
    h = open(INDEX, encoding="utf-8").read()
    m = re.search(r'reborn-shared\.data\.br\?v=(\d+)"', h)
    if m:
        h = h.replace(f'reborn-shared.data.br?v={m.group(1)}"',
                      f'reborn-shared.data.br?v={int(m.group(1)) + 1}"')
    else:  # première fois : ajoute le paramètre
        h = h.replace('reborn-shared.data.br",', 'reborn-shared.data.br?v=1",')
    open(INDEX, "w", encoding="utf-8").write(h)
    print("index.html : cache data invalidé")


def principal():
    textes = textes_a_appliquer()
    data = open(DATA, "rb").read()
    header_size = struct.unpack_from("<I", data, 16)[0]

    # table des fichiers du conteneur
    i, entrees, contenus = 20, [], {}
    while i < header_size:
        off, sz, nl = struct.unpack_from("<III", data, i)
        i += 12
        nom = data[i:i + nl].decode()
        i += nl
        entrees.append([off, sz, nom])
        contenus[nom] = data[off:off + sz]

    # édition des tables de localisation dans le bundle
    env = UnityPy.load(contenus["data.unity3d"])
    modifies = 0
    for obj in env.objects:
        if obj.type.name != "TextAsset":
            continue
        ta = obj.read()
        if not (ta.m_Name.endswith("_locale") and "CLOUDSAVE_STATUS_ORIGIN_TITLE" in (ta.m_Script or "")):
            continue
        table = json.loads(ta.m_Script)
        for cle, valeur in textes.items():
            if cle in table:
                table[cle] = valeur
        ta.m_Script = json.dumps(table, indent=2, ensure_ascii=True)
        ta.save()
        modifies += 1
    print(f"{modifies} tables de localisation mises à jour")

    t0 = time.time()
    nouveau_bundle = env.file.save(packer="lz4")
    print(f"bundle ré-empacté : {len(nouveau_bundle)} o ({time.time()-t0:.0f}s)")

    contenus["data.unity3d"] = nouveau_bundle
    bout = bytearray(data[:header_size])
    pos, i = header_size, 20
    while i < header_size:
        nl = struct.unpack_from("<I", data, i + 8)[0]
        nom = data[i + 12:i + 12 + nl].decode()
        sz = len(contenus[nom])
        struct.pack_into("<I", bout, i, pos)
        struct.pack_into("<I", bout, i + 4, sz)
        i += 12 + nl
        pos += sz
    for off, sz, nom in entrees:
        bout += contenus[nom]
    open(DATA, "wb").write(bout)

    cfg = json.load(open(CONFIG, encoding="utf-8"))
    sha = hashlib.sha256(bout).hexdigest()
    cfg["dataUrlBytes"] = len(bout)
    cfg["dataUrlSha256"] = sha
    for part in cfg.get("dataParts", []):
        part["bytes"] = len(bout)
        part["sha256"] = sha
        part["compressedBytes"] = len(bout)
        part["compressedSha256"] = sha
    json.dump(cfg, open(CONFIG, "w", encoding="utf-8"), indent=2, ensure_ascii=False)

    incrementer_version_data()
    print(f"terminé : {len(bout)} o — recharge la page (Ctrl+F5) pour voir le popup")


if __name__ == "__main__":
    principal()
