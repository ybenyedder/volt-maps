"""Activation 100 % locale pour le joueur Reborn (tavvkkj / voltmaps).

Remplace POST /reborn-api/v1/activate sans réseau :

- l'enveloppe de contenu (protectedContentEnvelope) est rejouée depuis la
  dernière réponse de la même carte en cache disque : elle est chiffrée pour
  le handshake ECDH P-256 *fixe* du SW (raw/cle_ec_fixe.json), donc reste
  déchiffrable quelle que soit la session ;
- le token d'activation (JWT EdDSA) est reconstruit avec le nonce Unity de la
  requête courante, puis signé par la clé locale (cle_activation.json).

Modes (variable MODE_ACTIVATION, pour diagnostic) :
  rejoue  → token en cache renvoyé tel quel (nonce/exp d'origine)
  nonce   → token reconstruit mais signature NON valide (teste si le client
            vérifie vraiment la signature Ed25519)
  forge   → token reconstruit et signé par la clé locale (mode normal)
"""
import base64
import json
import os
import time

DOSSIER = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(DOSSIER, "cache")
FICHIER_CLE = os.path.join(DOSSIER, "cle_activation.json")

MODE = os.environ.get("MODE_ACTIVATION", "rejoue")  # rejoue | forge | nonce (diagnostic)

_index = None


def _b64url(brut: bytes) -> str:
    return base64.urlsafe_b64encode(brut).rstrip(b"=").decode("ascii")


def _b64url_decode(txt: str) -> bytes:
    return base64.urlsafe_b64decode(txt + "=" * ((4 - len(txt) % 4) % 4))


def _charger_index():
    """slug → réponse activate la plus récente du cache disque."""
    global _index
    if _index is not None:
        return _index
    _index = {}
    if os.path.isdir(CACHE):
        for nom in os.listdir(CACHE):
            if not nom.startswith("reborn-api_v1_activate") or nom.endswith(".type"):
                continue
            chemin = os.path.join(CACHE, nom)
            try:
                with open(chemin, encoding="utf-8") as f:
                    d = json.load(f)
            except Exception:
                continue
            mtime = os.path.getmtime(chemin)
            for s in {d.get("slug"), d.get("routeSlug"), d.get("contentSlug")}:
                if not s:
                    continue
                if s not in _index or mtime > _index[s][0]:
                    _index[s] = (mtime, d)
    return _index


def _generer_cle():
    """Crée la paire Ed25519 locale si absente ; retourne {privee, publique}."""
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    cle = Ed25519PrivateKey.generate()
    jeu = {"privee": _b64url(cle.private_bytes_raw()),
           "publique": _b64url(cle.public_key().public_bytes_raw()),
           "kid": "tvk-20260813-1",   # même kid que l'amont (vérifié côté client)
           "note": "clé locale — la clé publique correspondante est patchée dans reborn-shared.data.br"}
    with open(FICHIER_CLE, "w") as f:
        json.dump(jeu, f, indent=1)
    return jeu


def _cle_signature():
    if os.path.isfile(FICHIER_CLE):
        with open(FICHIER_CLE) as f:
            return json.load(f)
    return _generer_cle()


def _signer(privee_b64: str, message: bytes) -> bytes:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives.serialization import load_der_private_key
    brut = _b64url_decode(privee_b64)
    # graine PKCS#8 non désirée : on reconstruit depuis la graine brute 32 o
    cle = Ed25519PrivateKey.from_private_bytes(brut)
    return cle.sign(message)


def _token_reconstruit(template: dict, nonce_unity: str, signer: bool) -> str:
    parties = template["activationToken"].split(".")
    entete, charge = json.loads(_b64url_decode(parties[0])), json.loads(_b64url_decode(parties[1]))
    maintenant = int(time.time())
    charge["unityNonce"] = nonce_unity
    charge["origin"] = "https://tavvkkj.xyz"
    charge["iat"] = maintenant
    # TTL court comme l'amont (90 s) : le moteur ne revalide pas l'expiration en
    # cours de partie (preuve : sessions en ligne de plusieurs heures), mais un
    # TTL délirant (+10 ans) fait échouer la validation des claims.
    ttl = int(os.environ.get("TTL_JETON", "120"))
    charge["exp"] = maintenant + ttl
    message = _b64url(json.dumps(entete, separators=(",", ":")).encode()).encode() + b"." + \
        _b64url(json.dumps(charge, separators=(",", ":")).encode()).encode()
    if not signer:
        return (message + b"." + parties[2]).decode("ascii")
    cle = _cle_signature()
    signature = _b64url(_signer(cle["privee"], message))
    return (message + b"." + signature.encode("ascii")).decode("ascii")


def activer(corps: bytes):
    """Point d'entrée serveur : corps POST activate → (statut, json, ctype)."""
    try:
        requete = json.loads(corps or b"{}")
    except Exception:
        return 400, b'{"erreur":"corps invalide"}', "application/json"
    slug = requete.get("slug") or requete.get("contentSlug") or ""
    nonce = str(requete.get("unityNonce") or "")
    index = _charger_index()
    entree = index.get(slug) or index.get(slug.replace("-reborn$", "")) or index.get(requete.get("contentSlug") or "")
    if not entree:
        return 404, json.dumps({"erreur": "pas de reponse activate en cache pour " + slug}).encode(), "application/json"
    template = entree[1]
    reponse = dict(template)
    # déclare le reçu comme officiel : sans ces champs le moteur affiche le
    # popup « Site non officiel » (IsOfficialReceipt / HostMatchesOfficial)
    reponse["officialReceipt"] = True
    reponse["isOfficialReceipt"] = True
    reponse["hostMatchesOfficial"] = True

    if MODE == "rejoue":
        pass                                   # token d'origine, tel quel
    else:
        signer = (MODE == "forge")
        token = _token_reconstruit(template, nonce, signer)
        # reflects du payload dans la réponse (cohérence top-level ↔ token)
        charge = json.loads(_b64url_decode(token.split(".")[1]))
        reponse["activationToken"] = token
        for champ in ("unityNonce", "iat", "exp", "origin"):
            if champ in charge:
                reponse[champ] = charge[champ]

    return 200, json.dumps(reponse, separators=(",", ":")).encode(), "application/json"
