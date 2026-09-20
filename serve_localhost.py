"""Serveur localhost pour tavvkkj.xyz — 100 % local, hors ligne par défaut.

Ordre de résolution d'une requête :
  1. copie locale            (telechargement/)
  2. cache disque persistant (cache/)
  3. réseau                   — uniquement si ONLINE=1

L'activation des cartes (/reborn-api/v1/activate) est intégralement locale :
enveloppe de contenu rejouée depuis le cache + jeton re-minté et signé par la
clé locale (activation_locale.py) — plus aucun appel réseau au gateway.

Usage :
  python3 serve_localhost.py [port]        (défaut 8907)
  ONLINE=1 python3 serve_localhost.py      # autorise le réseau en secours
"""
import mimetypes
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, unquote, quote

RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "telechargement")
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
ORIGINE = "https://tavvkkj.xyz"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8907
HOST = os.environ.get("HOST", "127.0.0.1")   # HOST=0.0.0.0 pour le LAN / tunnel
OFFLINE = os.environ.get("ONLINE") != "1"   # hors ligne par défaut

TYPE_SUP = {".webp": "image/webp", ".js": "text/javascript", ".css": "text/css",
            ".html": "text/html; charset=utf-8", ".json": "application/json",
            ".bin": "application/octet-stream", ".br": "application/octet-stream",
            ".wasm": "application/wasm", ".bundle": "application/octet-stream"}

def _fichier_existant(chemin_relatif):
    p = os.path.normpath(os.path.join(RACINE, chemin_relatif.lstrip("/")))
    if not (p == RACINE or p.startswith(RACINE + os.sep)):
        return None
    return p if os.path.isfile(p) else None

class Gestionnaire(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _cors(self):
        # une partie du code JS construit des URLs http://localhost:8907 en dur :
        # ouvertes depuis 127.0.0.1:8907 cela devient une requête origine croisée.
        # Sont autorisées : les origines locales (usage du miroir) et les domaines
        # du jeu (le site officiel peut charger ses builds via le tunnel nocoin).
        # Réfléchir n'importe quelle origine avec credentials laisserait n'importe
        # quel site web lire le serveur — on reste en liste blanche.
        origine = self.headers.get("Origin") if hasattr(self, "headers") else None
        if origine and re.fullmatch(
                r"https?://([a-z0-9-]+\.)*(tavvkkj\.xyz|voltmaps\.xyz|webtvmedia\.net"
                r"|localhost|127\.0\.0\.1|\[::1\])(:\d+)?", origine.lower()):
            self.send_header("Access-Control-Allow-Origin", origine)
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.send_header("Access-Control-Allow-Headers", "*")
            self.send_header("Access-Control-Expose-Headers", "*")
        self.send_header("Vary", "Origin")

    @staticmethod
    def _chemin_sure(chemin):
        """None si le chemin décodé contient des caractères de contrôle (CRLF…)."""
        return chemin if chemin and all(ord(c) >= 0x20 for c in chemin) else None

    # ---------- local ----------
    def _chemin_local(self, chemin_net):
        segs = [s for s in chemin_net.split("/") if s]
        variantes = [chemin_net] + ["/" + "/".join(segs[i:]) for i in range(1, min(4, len(segs)))]
        for base in variantes:
            for c in (base, base.rstrip("/") + ".html", base.rstrip("/") + "/index.html"):
                p = _fichier_existant(c)
                if p:
                    return p
        return None

    @staticmethod
    def _cache_control(chemin):
        chemin = chemin.replace("\\", "/")
        if "/game-assets/" in chemin:
            return "public, max-age=2592000"          # vignettes : 30 j
        if "/reborn/content/" in chemin or "/builds/" in chemin:
            return "public, max-age=86400"            # contenu/builds : 24 h
        if "/pogo/" in chemin:
            # builds pogo immuables : le navigateur doit les garder (jusqu'à
            # 160 Mo par carte, sans ça chaque lancement re-télécharge tout).
            # Les pages/manifests restent no-cache pour que les correctifs
            # passent immédiatement.
            if chemin.endswith(".html") or chemin.endswith(".json"):
                return "no-cache"
            return "public, max-age=2592000, immutable"
        return "no-cache"                             # html, api, json

    def _servir_fichier(self, chemin, code=200):
        with open(chemin, "rb") as f:
            corps = f.read()
        ext = os.path.splitext(chemin)[1].lower()
        ctype = TYPE_SUP.get(ext) or mimetypes.guess_type(chemin)[0] or "application/octet-stream"
        # NB : dans ce miroir les fichiers ".br" ont été décompressés en place par
        # le pipeline (le "framework.js.br" est du JavaScript pur). Le framework
        # est chargé par une balise <script> : il doit donc partir en
        # text/javascript SANS Content-Encoding, sinon les navigateurs (nosniff)
        # refusent de l'exécuter — cas du tunnel nocoin où aucune couche JS locale
        # ne vient le traiter. Les autres .br restent en octet-stream brut.
        encodage = None
        if ext == ".js.br" or chemin.lower().endswith(".js.br"):
            ctype = "text/javascript"
        try:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            if encodage:
                self.send_header("Content-Encoding", encodage)
            self.send_header("Content-Length", str(len(corps)))
            self.send_header("Cache-Control", self._cache_control(chemin))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self._cors()
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(corps)
        except (BrokenPipeError, ConnectionResetError):
            pass

    # ---------- cache ----------
    def _cle_cache(self, chemin_net):
        partie = urlsplit(chemin_net)
        cle = partie.path.strip("/") + ("@" + partie.query if partie.query else "")
        # les POST api (activate/session) ont un corps déterministe (nonce + handshake
        # fixés) : on l'incorpore à la clé pour que la réponse soit rejouable hors ligne
        corps = getattr(self, "_corps", b"") or b""
        if corps:
            import hashlib
            cle += "@" + hashlib.sha1(corps).hexdigest()[:20]
        cle = re.sub(r"[^A-Za-z0-9._@=-]", "_", cle)
        if not cle:
            cle = "index"
        if len(cle) > 200:   # URLs à hash longs -> nom stable tronqué
            cle = cle[:100] + "_" + re.sub(r"[^A-Za-z0-9]", "", cle)[-40:]
        return os.path.join(CACHE, cle)

    def _servir_cache(self, cle):
        meta = cle + ".type"
        if os.path.isfile(cle) and os.path.isfile(meta):
            with open(meta, encoding="ascii") as f:
                ctype = f.read().strip()
            with open(cle, "rb") as f:
                corps = f.read()
            try:
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(corps)))
                self.send_header("Cache-Control", self._cache_control(cle))
                self.send_header("X-Content-Type-Options", "nosniff")
                self._cors()
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(corps)
                return True
            except (BrokenPipeError, ConnectionResetError):
                return True
        return False

    # ---------- réseau ----------
    def _proxy(self):
        corps_req = getattr(self, "_corps", None)
        partie = urlsplit(self.path)
        chemin = unquote(partie.path)
        # API reborn : /reborn-api/* -> https://reborn.tavvkkj.xyz/*  (évite le CORS)
        if chemin.startswith("/reborn-api/"):
            # activation locale : enveloppe rejouée du cache + token signé localement
            # (ACTIV_RESEAU=1 restaure le proxy amont, utile pour rafraîchir le cache)
            if (chemin.rstrip("/") == "/reborn-api/v1/activate"
                    and self.command == "POST" and os.environ.get("ACTIV_RESEAU") != "1"):
                try:
                    import activation_locale
                    statut, data, ctype = activation_locale.activer(corps_req)
                except Exception as e:
                    sys.stderr.write("activation locale: %r\n" % (e,))
                    statut, data, ctype = 500, b'{"erreur":"activation locale"}', "application/json"
                self._repondre(statut, ctype, data)
                return
            cle = self._cle_cache("/reborn-api" + partie.path[len("/reborn-api"):] +
                                  (("?" + partie.query) if partie.query else ""))
            # le corps POST est déterministe (nonce + handshake fixés localement) :
            # la réponse (envelope, tokens) est rejouable telle quelle hors ligne
            if self._servir_cache(cle):
                return
            import urllib.request as _ur
            req = _ur.Request("https://reborn.tavvkkj.xyz" + self.path[len("/reborn-api"):],
                              data=corps_req, method=self.command)
            for h in ("Accept", "Content-Type", "User-Agent"):
                if self.headers.get(h):
                    req.add_header(h, self.headers[h])
            # l'API valide l'origine : on se présente comme le site officiel
            req.add_header("Origin", "https://tavvkkj.xyz")
            req.add_header("Referer", "https://tavvkkj.xyz/")
            if corps_req and b"activate" in partie.path.encode():
                sys.stderr.write("corps activate: %s\n" % corps_req[:800].decode("utf-8", "replace"))
            if OFFLINE:
                try:
                    corps = b'{"erreur":"api reborn indisponible hors ligne"}'
                    self.send_response(502)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(corps)))
                    self._cors()
                    self.end_headers()
                    self.wfile.write(corps)
                except (BrokenPipeError, ConnectionResetError):
                    pass
                return
            try:
                with _ur.urlopen(req, timeout=60) as rep:
                    data = rep.read()
                    ctype = rep.headers.get("Content-Type", "application/json")
                    self._mettre_en_cache(cle, data, ctype)
                    self.send_response(rep.status)
                    self.send_header("Content-Type", ctype)
                    self.send_header("Content-Length", str(len(data)))
                    # removed
                    self._cors()
                    self.end_headers()
                    if self.command != "HEAD":
                        self.wfile.write(data)
            except Exception as e:
                sys.stderr.write("proxy reborn: %r\n" % (e,))
                try:
                    corps = b'{"erreur":"api reborn indisponible"}'
                    self.send_response(502)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(corps)))
                    self._cors()
                    self.end_headers()
                    self.wfile.write(corps)
                except (BrokenPipeError, ConnectionResetError):
                    pass
            return
        cle = self._cle_cache(self.path)
        if self._servir_cache(cle):
            return
        # le moteur demande le contenu tantôt avec le ?troCors=… du SW, tantôt
        # sans : réessaie la variante inverse avant de déclarer forfait
        if chemin.startswith("/reborn/content/"):
            partie_q = urlsplit(self.path)
            if partie_q.query:
                if self._servir_cache(self._cle_cache(partie_q.path)):
                    return
            else:
                if self._servir_cache(self._cle_cache(chemin + "?troCors=local-fe4e150b20e9")):
                    return
        if OFFLINE:
            corps = b"404 hors ligne (non precharge)"
            try:
                self.send_response(404)
                self.send_header("Content-Type", "text/plain")
                self.send_header("Content-Length", str(len(corps)))
                self.send_header("X-Cache", "OFFLINE-MISS")
                self._cors()
                self.end_headers()
                self.wfile.write(corps)
            except (BrokenPipeError, ConnectionResetError):
                pass
            return
        try:
            import urllib.request
            import urllib.error
            # le contenu des cartes et les builds vivent sur assets.*, le reste sur l'origine principale
            if chemin.startswith("/reborn/content/") or chemin.startswith("/builds/"):
                origine = "https://assets.tavvkkj.xyz"
            else:
                origine = ORIGINE
            req = urllib.request.Request(origine + self.path, data=corps_req, method=self.command)
            for h in ("Accept", "Accept-Language", "Content-Type", "Referer", "User-Agent"):
                if self.headers.get(h):
                    req.add_header(h, self.headers[h])
            with urllib.request.urlopen(req, timeout=60) as rep:
                data = rep.read()
                ctype = rep.headers.get("Content-Type", "application/octet-stream")
                self._mettre_en_cache(cle, data, ctype)
                self._repondre(rep.status, ctype, data)
        except Exception as e:
            sys.stderr.write("proxy %s: %r\n" % (chemin[:80], e))
            corps = b"502 amont indisponible"
            try:
                self.send_response(502)
                self.send_header("Content-Type", "text/plain")
                self.send_header("Content-Length", str(len(corps)))
                self._cors()
                self.end_headers()
                self.wfile.write(corps)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def _mettre_en_cache(self, cle, data, ctype):
        try:
            chemin = os.path.abspath(cle)
            if not chemin.startswith(CACHE + os.sep):
                return
            with open(chemin, "wb") as f:
                f.write(data)
            with open(chemin + ".type", "w", encoding="ascii") as f:
                f.write(ctype)
        except OSError:
            pass

    def _repondre(self, code, ctype, data):
        try:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("X-Cache", "MISS")
            self._cors()
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    # ---------- méthodes ----------
    def do_GET(self):
        partie = urlsplit(self.path)
        chemin = unquote(partie.path)
        if self._chemin_sure(chemin) is None:
            return self._repondre(400, "text/plain", b"400 chemin invalide")
        # routes de jeu (<carte>/reborn/<mode>) : toujours la coquille SPA locale,
        # AVANT la recherche de fichiers (sinon /x/reborn/enhanced tombe sur
        # enhanced.html — stub de redirection — et recharge la galerie)
        if not os.path.splitext(chemin)[1] and "/reborn/" in chemin:
            coquille = _fichier_existant("index.html")
            if coquille:
                return self._servir_fichier(coquille)
        cible = self._chemin_local(chemin)
        if cible:
            if chemin.endswith(".html") and not chemin.startswith("/assets/"):
                return self._rediriger(chemin[:-5] or "/")
            return self._servir_fichier(cible)
        # nom de fichier littéral "?v=3" (favicon, etc.)
        brut = chemin + (("?" + partie.query) if partie.query else "")
        p = _fichier_existant(brut)
        if p:
            return self._servir_fichier(p)
        # route SPA inconnue (ex. /atlanta/reborn/original) -> coquille SPA locale
        if not os.path.splitext(chemin)[1] and "/reborn/" in chemin:
            coquille = _fichier_existant("index.html")
            if coquille:
                return self._servir_fichier(coquille)
        return self._proxy()

    def do_HEAD(self):
        self.do_GET()


    def do_OPTIONS(self):
        try:
            self.send_response(204)
            self._cors()
            self.send_header("Content-Length", "0")
            self.end_headers()
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_POST(self):
        # corps lu une seule fois ; on ferme la connexion : un POST servi depuis le
        # cache sans consommer son corps désynchroniserait le keep-alive (le JSON
        # serait ensuite lu comme ligne de méthode HTTP -> 501).
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        n = max(0, min(n, 1 << 20))   # plafond : aucun POST légitime > 1 Mio
        self._corps = self.rfile.read(n) if n > 0 else b""
        self.close_connection = True
        self._proxy()

    def _rediriger(self, vers):
        vers = "".join(c for c in vers if ord(c) >= 0x20)   # pas d'injection d'en-tête
        try:
            self.send_response(301)
            self.send_header("Location", vers)
            self.send_header("Content-Length", "0")
            self._cors()
            self.end_headers()
        except (BrokenPipeError, ConnectionResetError):
            pass

if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Gestionnaire).serve_forever()
