/* Volt Maps — injection de la sauvegarde embarquée pour les pages Pogo classic.
   Fichier de sauvegarde embarqué : (sauvegarde.bin,
   13 971 octets — partie, clés, personnages débloqués) est écrit dans le FS
   Emscripten aux chemins que Unity 2019 lit au démarrage (md5 de variantes de
   l'URL de la page), comme sur le site d'origine. Sans lui : tuto + save vierge. */
(function () {
  'use strict';

  var NOMS = ['local', 'cloud', 'local_old', 'cloud_old'];
  var PREFIXES_FIXES = ['/idbfs/Save/', '/Save/', '/idbfs/702f4fb23bd3466cd596dec4ceb199e9/Save/'];
  var donnees = null;

  /* ——— md5 (RFC 1321) — portage fidèle de l'implémentation publique de
     Joseph Myers, testé contre les vecteurs « » / « abc » ——— */
  function md5cycle(x, k) {
    var a = x[0], b = x[1], c = x[2], d = x[3];
    a = ff(a, b, c, d, k[0], 7, -680876936);
    d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819);
    b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897);
    d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341);
    b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416);
    d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063);
    b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682);
    d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290);
    b = ff(b, c, d, a, k[15], 22, 1236535329);

    a = gg(a, b, c, d, k[1], 5, -165796510);
    d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713);
    b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691);
    d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335);
    b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438);
    d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961);
    b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467);
    d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473);
    b = gg(b, c, d, a, k[12], 20, -1926607734);

    a = hh(a, b, c, d, k[5], 4, -378558);
    d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562);
    b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060);
    d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632);
    b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174);
    d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979);
    b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487);
    d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520);
    b = hh(b, c, d, a, k[2], 23, -995338651);

    a = ii(a, b, c, d, k[0], 6, -198630844);
    d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905);
    b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571);
    d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523);
    b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359);
    d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380);
    b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070);
    d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259);
    b = ii(b, c, d, a, k[9], 21, -343485551);

    x[0] = ad32(a, x[0]); x[1] = ad32(b, x[1]); x[2] = ad32(c, x[2]); x[3] = ad32(d, x[3]);
  }
  function cmn(q, a, b, x, s, t) {
    a = ad32(ad32(x, a), ad32(q, t));
    return ad32((a << s) | (a >>> (32 - s)), b);
  }
  function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
  function ad32(a, b) { return (a + b) & 0xFFFFFFFF; }
  function md51(s) {
    var n = s.length, etat = [1732584193, -271733879, -1732584194, 271733878], i;
    for (i = 64; i <= s.length; i += 64) md5cycle(etat, md5blk(s.substring(i - 64, i)));
    s = s.substring(i - 64);
    var tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
    tail[i >> 2] |= 0x80 << ((i % 4) << 3);
    if (i > 55) { md5cycle(etat, tail); for (i = 0; i < 16; i++) tail[i] = 0; }
    tail[14] = n * 8;
    md5cycle(etat, tail);
    return etat;
  }
  function md5blk(s) {
    var md5blks = [], i;
    for (i = 0; i < 64; i += 4)
      md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) +
        (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
    return md5blks;
  }
  function rhex(n) {
    var s = '', j = 0;
    for (; j < 4; j++)
      s += ((n >> (j * 8 + 4)) & 0x0F).toString(16) + ((n >> (j * 8)) & 0x0F).toString(16);
    return s;
  }
  function md5Hex(valeur) {
    var x = md51(valeur), out = '', i;
    for (i = 0; i < 4; i++) out += rhex(x[i]);
    return out;
  }

  function variantesURL() {
    var href = '';
    try { href = window.location.href.split('#')[0].split('?')[0]; } catch (e) {}
    var origin = '';
    try { origin = window.location.origin; } catch (e) {}
    var sansSlash = href ? href.replace(/\/$/, '') : '';
    var dossier = href && href.indexOf('/') !== -1 ? href.slice(0, href.lastIndexOf('/')) : '';
    var dossierSlash = dossier ? dossier + '/' : '';
    var liste = [href, sansSlash, dossier, dossierSlash, origin, origin ? origin + '/' : ''];
    return liste.filter(function (x, i) { return x && liste.indexOf(x) === i; });
  }

  function prefixesCandidats() {
    return variantesURL().map(function (candidat) {
      var h = md5Hex(candidat);
      return h ? '/idbfs/' + h + '/Save/' : null;
    }).filter(Boolean);
  }

  function ecrireFichier(module, dossier, nom) {
    try {
      try { if (module.FS_unlink) module.FS_unlink(dossier + '/' + nom); } catch (e) {}
      module.FS_createDataFile(dossier, nom, donnees, true, true, true);
      return true;
    } catch (e) { return false; }
  }

  window.pogoInjecterSauvegarde = function (module) {
    if (!donnees || !module || typeof module.FS_createPath !== 'function' ||
        typeof module.FS_createDataFile !== 'function') return false;
    var vus = {};
    PREFIXES_FIXES.concat(prefixesCandidats()).forEach(function (prefixe) {
      if (!prefixe || vus[prefixe]) return;
      vus[prefixe] = true;
      try { module.FS_createPath('/', 'idbfs', true, true); } catch (e) {}
      var morceaux = prefixe.split('/').filter(Boolean);
      var chemin = '';
      for (var i = 0; i < morceaux.length - 1; i++) {
        chemin += '/' + morceaux[i];
        try { module.FS_createPath(chemin, morceaux[i + 1], true, true); } catch (e) {}
      }
      var dossier = prefixe.replace(/\/$/, '');
      var ecrit = 0;
      NOMS.forEach(function (nom) { if (ecrireFichier(module, dossier, nom)) ecrit++; });
      if (ecrit) console.log('[pogo] sauvegarde écrite dans ' + dossier);
    });
    return true;
  };

  window.pogoChargerSauvegarde = function () {
    return fetch('/pogo/sauvegarde.bin', { cache: 'force-cache' })
      .then(function (rep) { if (!rep.ok) throw new Error('HTTP ' + rep.status); return rep.arrayBuffer(); })
      .then(function (tampon) { donnees = new Uint8Array(tampon); return true; })
      .catch(function (e) { console.log('[pogo] sauvegarde indisponible : ' + e); return false; });
  };
})();
