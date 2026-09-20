/* Volt Maps — socle commun des pages Pogo.
   Chargé par /pogo/<carte>/index.html AVANT le boot Unity.
   Rien ici n'est spécifique à une carte : la page définit POGO_CONFIG. */
(function () {
  'use strict';

  /* ——— SDK Poki factice : les builds « poki-style » appellent PokiSDK.* ———
     Stub officiel (aucune pub, aucune télémétrie). */
  if (!window.PokiSDK) {
    window.PokiSDK = {
      init: function () { return Promise.resolve(); },
      setDebug: function () {}, gameLoadingStart: function () {},
      gameLoadingProgress: function () {}, gameLoadingFinished: function () {},
      gameInteractive: function () {},
      commercialBreak: function () { return Promise.resolve(); },
      rewardedBreak: function () { return Promise.resolve({ completed: false }); },
      customEvent: function () {}, destroyAd: function () {}, displayAd: function () {},
      roundStart: function () {}, roundEnd: function () {},
      gameplayStart: function () {}, gameplayStop: function () {},
      setPlayerAge: function () {},
      togglePlayerAdvertisingConsent: function () {},
      toggleNonPersonalized: function () {}, setConsentString: function () {},
      disableProgrammatic: function () {}, muteAd: function () {},
      logError: function () {}, sendHighscore: function () {},
      setDebugTouchOverlayController: function () {}, happyTime: function () {},
      getLeaderboard: function () { return Promise.resolve(); }
    };
  }
  window.PokiSDK = window.PokiSDK || {};
  window.PokiSDK.sdkStarted = true;

  /* ——— pont Poki du build (JSLib « _JS_PokiSDK_initPokiBridge ») ———
     Le build appelle initPokiBridge(objet) puis, plus tard, les fonctions
     globales commercialBreak/rewardedBreak ; on lui répond comme le wrapper
     officiel, avec le SDK factice ci-dessus. init() résout aussitôt : si le
     pont est déjà enregistré on prévient le build (« ready »), sinon on marque
     pokiReady pour que initPokiBridge le fasse à l'enregistrement. */
  window.showUnitywebNoSupport = window.showUnitywebNoSupport ||
    function () { console.warn("Unity web support/load failed"); };
  window.initPokiBridge = function (objet) {
    window.pokiBridge = objet;
    /* les breaks sont définis SURTOUT quand init a déjà résolu (SDK factice :
       résolution immédiate) — le build les appelle plus tard au menu */
    window.commercialBreak = function () {
      window.PokiSDK.commercialBreak().then(function () {
        window.unityGame.SendMessage(objet, "commercialBreakCompleted");
      });
    };
    window.rewardedBreak = function () {
      window.PokiSDK.rewardedBreak().then(function (res) {
        window.unityGame.SendMessage(objet, "rewardedBreakCompleted", String(res));
      });
    };
    if (window.pokiReady && window.unityGame) {
      window.unityGame.SendMessage(objet, "ready");
    } else if (window.pokiAdBlock && window.unityGame) {
      window.unityGame.SendMessage(objet, "adblock");
    }
  };
  window.PokiSDK.init().then(function () {
    if (window.pokiBridge && window.unityGame) {
      window.unityGame.SendMessage(window.pokiBridge, "ready");
    } else {
      window.pokiReady = true;
    }
  }).catch(function () { window.pokiAdBlock = true; });

  /* ——— mode pogo forcé dans l'URL ———
     Les builds lisent l'URL de la page (Application.absoluteURL) pour choisir
     leur variante : sans « mode=pogo » la page sert la carte d'origine. */
  if (/[?&]mode=pogo/.test(location.search) === false) {
    try { history.replaceState(null, "", location.pathname + "?mode=pogo"); } catch (e) {}
  }

  /* ——— neutralisation des overlays « build protégée / site officiel » ———
     Certains builds affichent un voile plein écran quand ils estiment ne pas
     tourner sur leur site d'origine ; on cache ces éléments et on bloque les
     redirections vers les domaines d'origine. Le jeu lui-même continue de
     fonctionner. */
  var domainesOrigine = /(^|\.)(tavvkkj\.xyz|ashuni\.lol|ashuni\.com)$/i;
  var motifOverlay = /(build protegida|build protegido|abra pelo site oficial|funciona no site oficial|site oficial|ss\.tavvkkj\.xyz)/i;

  function urlBloquee(url) {
    try {
      var cible = new URL(url, location.href);
      return domainesOrigine.test(cible.hostname) &&
        cible.origin !== location.origin;
    } catch (e) { return domainesOrigine.test(String(url || '')); }
  }

  function cacherOverlay(noeud) {
    if (!noeud || noeud.nodeType !== 1) return;
    if (/^(HTML|BODY|SCRIPT|STYLE)$/i.test(noeud.tagName)) return;
    var texte = String(noeud.textContent || '');
    var lien = String(noeud.href || noeud.src || '');
    if (!motifOverlay.test(texte) && !urlBloquee(lien)) return;
    var overlay = noeud;
    while (overlay && overlay !== document.body) {
      var st = getComputedStyle(overlay);
      if (st.position === 'fixed' || st.position === 'absolute') break;
      overlay = overlay.parentElement;
    }
    overlay = overlay || noeud;
    if (!overlay || /^(HTML|BODY|SCRIPT|STYLE)$/i.test(overlay.tagName)) return;
    overlay.style.setProperty('display', 'none', 'important');
    overlay.style.setProperty('visibility', 'hidden', 'important');
    overlay.style.setProperty('pointer-events', 'none', 'important');
  }

  function scanner(root) {
    if (!root || root.nodeType !== 1) return;
    if (/^(SCRIPT|STYLE)$/i.test(root.tagName)) return;
    cacherOverlay(root);
    if (root.querySelectorAll) {
      var marques = root.querySelectorAll('body *:not(script):not(style)');
      for (var i = 0; i < marques.length; i++) cacherOverlay(marques[i]);
    }
  }

  var natifFetch = window.fetch ? window.fetch.bind(window) : null;
  if (natifFetch) {
    window.fetch = function (entree, init) {
      var url = typeof entree === 'string' ? entree : entree && entree.url;
      if (urlBloquee(url) || urlTelemetrie(url)) {
        /* Unity Cloud (config UGS, events CDP, insights) : ces requêtes
           peuvent rester pendantes de longues minutes et bloquer le premier
           rendu du jeu. On y répond 204 immédiatement — le SDK UGS traite
           l'échec HTTP et le jeu démarre. Zéro télémétrie, zéro donnée
           collectée : cohérent avec l'esprit du miroir. NB : REJETER la
           promesse (TypeError) fait boucler le SDK — il faut une vraie
           Response. */
        return Promise.resolve(new Response('', { status: 204, statusText: 'No Content' }));
      }
      return natifFetch(entree, init);
    };
  }

  var DOMAINES_TELEMETRIE = /(^|\.)(uca\.cloud\.unity3d\.com|cdp\.cloud\.unity3d\.com|perf-events\.cloud\.unity3d\.com|cloud\.unity3d\.com|unity3d\.com|cloudflareinsights\.com)$/i;
  function urlTelemetrie(url) {
    if (!url) return false;
    try {
      var cible = new URL(url, location.href);
      return DOMAINES_TELEMETRIE.test(cible.hostname);
    } catch (e) { return false; }
  }

  function filtrerRedirection(native, url) {
    if (url && (urlBloquee(url))) return;
    return native.call(window.location, url);
  }
  try { var nAssign = window.location.assign.bind(window.location);
        window.location.assign = filtrerRedirection.bind(null, nAssign); } catch (e) {}
  try { var nReplace = window.location.replace.bind(window.location);
        window.location.replace = filtrerRedirection.bind(null, nReplace); } catch (e) {}

  document.addEventListener('click', function (ev) {
    var el = ev.target && ev.target.closest
      ? ev.target.closest('a,button,[role="button"]') : null;
    if (!el) return;
    var url = el.href || el.getAttribute('data-href') || '';
    if (urlBloquee(url)) { ev.preventDefault(); ev.stopImmediatePropagation(); cacherOverlay(el); }
  }, true);

  var observateur = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++)
      for (var j = 0; j < mutations[i].addedNodes.length; j++)
        scanner(mutations[i].addedNodes[j]);
  });
  document.addEventListener('DOMContentLoaded', function () {
    scanner(document.body);
    observateur.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () { observateur.disconnect(); }, 30000);
  });

  /* ——— décompression tolérante pour les .unityweb ———
     Certains fichiers sont gzip, d'autres brotli, d'autres déjà clairs et le
     manifest ne le dit pas toujours juste : on essaie dans l'ordre et on garde
     la sortie qui a l'en-tête attendu (portage du unity-compression-fix). */
  window.pogoPatchCompression = function (loader) {
    if (!loader || !loader.Compression || loader.Compression.__pogoPatched) return;
    var compression = loader.Compression;
    var natif = compression.decompress.bind(compression);

    function sembleClair(octets) {
      if (!octets || !octets.length) return false;
      if (octets.length >= 16) {
        var entete = '';
        for (var i = 0; i < 16; i++) entete += String.fromCharCode(octets[i]);
        if (entete === 'UnityWebData1.0\u0000') return true;
      }
      if (octets.length >= 4) {
        if (octets[0] === 0x00 && octets[1] === 0x61 && octets[2] === 0x73 && octets[3] === 0x6d) return true;
        if (octets[0] === 0x76 && octets[1] === 0x61 && octets[2] === 0x72) return true;
        if (octets[0] === 0x66 && octets[1] === 0x75 && octets[2] === 0x6e && octets[3] === 0x63) return true;
        if (octets[0] === 0x28 && octets[1] === 0x66 && octets[2] === 0x75 && octets[3] === 0x6e) return true;
      }
      return false;
    }
    function essayer(methode, octets) {
      try { var out = methode.decompress(octets); if (out && out.length) return out; } catch (e) {}
      return null;
    }
    function meilleur(octets) {
      var out = natif(octets);
      if (sembleClair(out)) return out;
      var b = essayer(compression.brotli, octets); if (sembleClair(b)) return b;
      var g = essayer(compression.gzip, octets); if (sembleClair(g)) return g;
      return out || b || g || octets;
    }
    compression.decompress = function (octets, rappel) {
      if (typeof rappel !== 'function') return meilleur(octets);
      setTimeout(function () { rappel(meilleur(octets)); }, 0);
    };
    compression.__pogoPatched = true;
  };

  /* ——— touche du pogo, configurable ———
     Le jeu expose son singleton « Game » à SendMessage : StartPogostick()
     entre dans l'état PogostickState (rebonds + hangtime) comme un pickup
     pogo ramassé. Fonctionne sur les builds classic (window.unityGame) et
     reborn (window.unityInstance) ; hors course l'appel est simplement
     ignoré par le jeu.
     La touche se choisit via le petit bouton en bas de l'écran (stocké en
     localStorage, par défaut « P ») — n'importe quelle touche convient. */
  var CLE_TOUCHE = 'voltmaps_touche_pogo';
  var enCapture = false;

  function litTouche() {
    try {
      var v = localStorage.getItem(CLE_TOUCHE);
      if (v) return v;
    } catch (e) {}
    return 'p';
  }

  function nomTouche(code) {
    if (code === 'space') return 'Espace';
    if (code === 'arrowup') return 'Flèche haut';
    if (code === 'arrowdown') return 'Flèche bas';
    if (code === 'arrowleft') return 'Flèche gauche';
    if (code === 'arrowright') return 'Flèche droite';
    if (code === 'enter') return 'Entrée';
    return code.length === 1 ? code.toUpperCase() : code;
  }

  function declenchePogo() {
    var jeu = window.unityGame || window.unityInstance;
    if (!jeu || typeof jeu.SendMessage !== 'function') return;
    try { jeu.SendMessage('Game', 'StartPogostick'); } catch (e) {}
  }

  function majEtiquette() {
    var el = document.getElementById('pogo-touche-valeur');
    if (el) el.textContent = nomTouche(litTouche());
  }

  document.addEventListener('keydown', function (ev) {
    /* capture d'une nouvelle touche (bouton « changer ») */
    if (enCapture) {
      ev.preventDefault();
      if (ev.key !== 'Escape') {
        var code = ev.key === ' ' ? 'space' : ev.key.toLowerCase();
        try { localStorage.setItem(CLE_TOUCHE, code); } catch (e) {}
      }
      enCapture = false;
      majEtiquette();
      return;
    }
    var attendu = litTouche();
    var pressed = ev.key === ' ' ? 'space' : ev.key.toLowerCase();
    if (pressed !== attendu) return;
    if (ev.repeat) return;
    declenchePogo();
  });

  document.addEventListener('DOMContentLoaded', function () {
    var chip = document.createElement('button');
    chip.id = 'pogo-touche';
    chip.type = 'button';
    chip.setAttribute('aria-label', 'Changer la touche du pogo');
    chip.title = 'Cliquer puis appuyer sur la touche voulue pour le pogo';
    chip.style.cssText =
      'position:fixed;bottom:8px;left:50%;transform:translateX(-50%);' +
      'z-index:9999;background:rgba(10,12,17,.72);color:#ffb020;' +
      'border:1px solid rgba(255,176,32,.45);border-radius:6px;' +
      'padding:3px 10px;font:11px/1.4 "Segoe UI",system-ui,sans-serif;' +
      'cursor:pointer;opacity:.55;transition:opacity .15s;';
    chip.addEventListener('mouseenter', function () { chip.style.opacity = '1'; });
    chip.addEventListener('mouseleave', function () {
      chip.style.opacity = enCapture ? '1' : '.55';
    });
    chip.addEventListener('click', function () {
      enCapture = true;
      chip.blur();
      document.getElementById('pogo-touche-valeur').textContent = '…';
    });
    chip.innerHTML = 'Pogo : <b id="pogo-touche-valeur"></b> &nbsp;·&nbsp; cliquer pour changer';
    document.body.appendChild(chip);
    majEtiquette();
  });

  /* ——— barre de chargement + erreur ——— */
  window.pogoUI = {
    message: function (texte, progression) {
      var plein = document.getElementById('pogo-barre-plein');
      var texte2 = document.getElementById('pogo-texte');
      if (plein && typeof progression === 'number')
        plein.style.width = Math.max(0, Math.min(100, progression)) + '%';
      if (texte2) texte2.textContent = texte;
    },
    erreur: function (detail) {
      var surcouche = document.getElementById('pogo-erreur');
      var msg = document.getElementById('pogo-erreur-msg');
      if (msg) msg.textContent = String(detail || 'Échec du chargement.');
      if (surcouche) surcouche.classList.add('visible');
      var barre = document.getElementById('pogo-barre');
      if (barre) barre.style.display = 'none';
    }
  };

  /* ——— sécurité : sans progression notable en 3 min, on affiche une erreur ——— */
  window.pogoFilet = function () {
    window.__pogoProgres = 0;
    return setTimeout(function () {
      if (window.__pogoProgres < 0.95) {
        window.pogoUI.erreur('Le chargement n\u2019aboutit pas (serveur local ' +
          'lancé ? build incomplet ?). Réessaie, ou recharge la page.');
      }
    }, 180000);
  };
})();
