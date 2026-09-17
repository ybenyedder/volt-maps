/* ===================== TRO Native Timer (portage tavvkkj.xyz) =====================
   Portage fidèle du « Cronômetro nativo LiveSplit » intégré au jeu sur tavvkkj.xyz
   (composant zi + module partagé CAZRtcsE.js, extraits de leurs bundles) :

   - piloté par les événements réels du jeu, émis par le pont natif du build
     (_RebornTimerEvent → tro:unity-runtime-event / tro:reborn-runtime-event) :
     départ sur reborn:runStarted, pause sur reborn:playerDied / saveMeShown /
     runEnded / gameEnded, pause « moeda » sur reborn:coinCollected (anti-rebond
     380 ms après le départ / 220 ms entre signaux), pause sur reborn:pause,
     reprise sur reborn:runResumed (ou reborn:resume si pause venue du jeu),
     garde anti-relance unity:startAudio ≥ 2500 ms ;
   - machine à états LiveSplit : NotRunning / Running / Paused / Ended,
     split, undo, reset, pause, double-pression bloquée (300/600 ms), retard
     configurable des raccourcis ;
   - raccourcis par défaut Numpad1 (split) / Numpad3 (reset) / Numpad2 (skip) /
     Numpad8 (undo), capturables au clic ;
   - overlay canvas dessiné comme chez eux : police Century Gothic 43.75, dégradé
     de texte, ombres, contour, couleurs par phase (vert qui gagne du temps,
     rouge qui en perd, bleu Personal Best…), formats 1 / 00:01 / 0:00:01 et
     précision .2 / .23 / .234 ;
   - déplacement à la souris, redimensionnement par les bords ou Maj+glisser
     (50–500 × 20–150), double-clic = reset, clic = menu d'options ;
   - réglages persistés dans localStorage sous tro_settings_v1 (sous-arbre
     nativeTimer, les autres clés du site sont préservées) — mêmes valeurs par
     défaut, mêmes bornes que le site d'origine ;
   - popup externe Document Picture-in-Picture « TRO Timer », même HTML, tailles
     bornées 180–640 × 70–360.

   Fichier autonome, aucune dépendance. Interface publique : aucune. */
(function () {
  "use strict";
  if (window.__troNativeTimerPorte) return;
  window.__troNativeTimerPorte = true;

  /* ============================ constantes d'origine ============================ */
  var CLE_REGLAGES = "tro_settings_v1";
  var ZINDEX_JEU_MIN = 6200;   /* ht() : z-index plancher sur la page de jeu */
  var HAUTEUR_LIGNE = 45;      /* V : hauteur de ligne de référence du texte */
  var MAX_POLICES_CACHE = 24;  /* He : taille du cache de métriques par police */
  var DEBUT_PIECE_MS = 380;    /* Wi : pas de pause « pièce » < 380 ms après départ */
  var ENTRE_PIECES_MS = 220;   /* Gi : délai mini entre deux signaux pièce */
  var REPIF_PAUSE_MS = 450;    /* Vi : délai mini avant reprise auto (coin/death) */
  var GARDE_STARTAUDIO_MS = 2500; /* Yi : startAudio ne relance qu'après 2,5 s */
  var SEUIL_DEPLACEMENT = 3;   /* seuil pixel avant de considérer un glisser */
  var BORD_REDIM = 10;         /* zone de redimensionnement sur les bords */

  var FORMATS = ["1", "00:01", "0:00:01", "00:00:01"];
  var PRECISIONS = ["", ".2", ".23", ".234"];
  var FONDS = ["Plain", "Vertical", "Horizontal", "PlainWithDeltaColor",
    "VerticalWithDeltaColor", "HorizontalWithDeltaColor"];
  var POIDS = ["400", "500", "600", "700", "800", "900"];

  /* Touches (Pe) — libellés d'origine */
  var TOUCHES_DEFS = [
    { id: "splitKey", action: "startSplit", label: "Iniciar / Split" },
    { id: "resetKey", action: "reset", label: "Resetar" },
    { id: "undoKey", action: "undoSplit", label: "Desfazer Split" },
    { id: "skipKey", action: "skipSplit", label: "Pular Split" },
    { id: "pauseKey", action: "pause", label: "Pausar" }
  ];
  function toucheParDefaut(code, key, label) {
    return { code: code, key: key, label: label, ctrl: false, alt: false,
      shift: false, meta: false };
  }

  /* ============================ réglages par défaut (v) ============================ */
  var DEFAUTS = {
    overlay: {
      enabled: true, visible: true, left: 100, top: 100, anchor: "free",
      offsetX: 24, offsetY: 24, zIndex: 30, allowResizing: true,
      passThroughWhileRunning: false
    },
    timer: {
      width: 252, height: 50, digitsFormat: "1", accuracy: ".23",
      decimalsSize: 35, centerTimer: false, showGradient: true,
      overrideSplitColors: false, timerColor: "#aaaaaa", timerAlpha: 1,
      backgroundColor: "#000000", backgroundAlpha: 0,
      backgroundColor2: "#000000", backgroundAlpha2: 0,
      backgroundGradient: "Plain", backgroundImage: "", backgroundImageAlpha: 1,
      backgroundImageFit: "cover", borderColor: "#ffffff", borderAlpha: 0,
      borderWidth: 0, radius: 0
    },
    layout: {
      timerFontFamily: '"Century Gothic", Calibri, "Segoe UI", Arial, sans-serif',
      timerFontSize: 43.75, timerFontWeight: "700", timerFontStyle: "normal",
      letterSpacing: 0, verticalNudge: 4,
      windowBackgroundColor: "#000000", windowBackgroundAlpha: 1,
      opacity: 1, dropShadows: true, shadowColor: "#000000", shadowAlpha: .5,
      outlineColor: "#000000", outlineAlpha: 0, textColor: "#ffffff",
      personalBestColor: "#16a6ff", personalBestAlpha: 1,
      aheadGainingTimeColor: "#29cc54", aheadGainingTimeAlpha: 1,
      aheadLosingTimeColor: "#70cc89", aheadLosingTimeAlpha: 1,
      behindGainingTimeColor: "#cc7870", behindGainingTimeAlpha: 1,
      behindLosingTimeColor: "#cc3729", behindLosingTimeAlpha: 1,
      bestSegmentColor: "#d8af1f", bestSegmentAlpha: 1,
      notRunningColor: "#7a7a7a", notRunningAlpha: 1,
      pausedColor: "#7a7a7a", pausedAlpha: 1,
      enterAnimation: "fade", animationDuration: 180
    },
    hotkeys: {
      splitKey: toucheParDefaut("Numpad1", "1", "NumPad1"),
      resetKey: toucheParDefaut("Numpad3", "3", "NumPad3"),
      skipKey: toucheParDefaut("Numpad2", "2", "NumPad2"),
      undoKey: toucheParDefaut("Numpad8", "8", "NumPad8"),
      pauseKey: null, hotkeyDelay: 0, keyboardShortcuts: true,
      preventDefaultHotkeys: true, doubleTapPrevention: true
    },
    behavior: { clickToggles: false, touchStartReset: true },
    automation: { enabled: true, startOnGameplay: true, pauseOnCoin: true,
      pauseOnDeath: true, pollMs: 160 }
  };

  /* ============================ utilitaires (b, r, D…) ============================ */
  function hexValide(o, defaut) {
    var e = String(o || "").trim();
    if (/^#[0-9a-fA-F]{3}$/.test(e))
      return ("#" + e.charAt(1) + e.charAt(1) + e.charAt(2) + e.charAt(2) +
        e.charAt(3) + e.charAt(3)).toLowerCase();
    return /^#[0-9a-fA-F]{6}$/.test(e) ? e.toLowerCase() : (defaut || "#000000");
  }
  function borne(o, min, max) {
    var n = Number(o);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
  }
  function parmi(v, liste, defaut) { return liste.indexOf(v) !== -1 ? v : defaut; }
  function rvb(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16)];
  }
  function rgbaTab(hex, alpha) {
    var c = rvb(hexValide(hex));
    return [c[0], c[1], c[2], borne(alpha, 0, 1)];
  }
  function rgbaStr(t) { return "rgba(" + t[0] + ", " + t[1] + ", " + t[2] + ", " + t[3] + ")"; }
  function rgbaHexAlpha(hex, alpha) { return rgbaStr(rgbaTab(hex, alpha)); }
  function bornInt(v, min, max) { return Math.round(borne(v, min, max)); }
  function pad2(n) { return n < 10 ? "0" + n : String(n); }
  function pad3(n) { return n < 10 ? "00" + n : n < 100 ? "0" + n : String(n); }

  /* HSV (ge/Z) pour les dégradés du texte */
  function versHSV(r, g, b) {
    var l = r / 255, n = g / 255, c = b / 255;
    var d = Math.max(l, n, c), A = Math.min(l, n, c), f = d - A, S = 0;
    if (f !== 0) {
      if (d === l) S = (n - c) / f % 6;
      else if (d === n) S = (c - l) / f + 2;
      else S = (l - n) / f + 4;
      S *= 360; if (S < 0) S += 360;
    }
    return { h: S, s: d === 0 ? 0 : f / d, v: d };
  }
  function depuisHSV(o, t, e) {
    var l = e * t, n = l * (1 - Math.abs(o / 60 % 2 - 1)), c = e - l;
    var d = 0, A = 0, f = 0;
    if (o < 60) { d = l; A = n; }
    else if (o < 120) { d = n; A = l; }
    else if (o < 180) { A = l; f = n; }
    else if (o < 240) { A = n; f = l; }
    else if (o < 300) { d = n; f = l; }
    else { d = l; f = n; }
    return [Math.round((d + c) * 255), Math.round((A + c) * 255), Math.round((f + c) * 255)];
  }
  function degradeTexte(ctx, tab, haut, bas) {
    var hsv = versHSV(tab[0], tab[1], tab[2]);
    var clair = depuisHSV(hsv.h, hsv.s * .5, Math.min(1, 1.5 * hsv.v + .1));
    var fonce = depuisHSV(hsv.h, hsv.s, .8 * hsv.v);
    var g = ctx.createLinearGradient(0, haut, 0, bas);
    g.addColorStop(0, rgbaStr([clair[0], clair[1], clair[2], tab[3]]));
    g.addColorStop(1, rgbaStr([fonce[0], fonce[1], fonce[2], tab[3]]));
    return g;
  }

  /* ============================ formatage (Ge, _e, Ue) ============================ */
  function decimales(ms, regl) {
    if (regl.timer.accuracy === ".234") return "." + pad3(Math.floor(ms % 1e3));
    if (regl.timer.accuracy === ".23") return "." + pad2(Math.floor(ms / 10) % 100);
    if (regl.timer.accuracy === ".2") return "." + (Math.floor(ms / 100) % 10);
    return "";
  }
  function formater(ms, regl) {
    var e = Math.max(0, ms), l = Math.floor(e / 1e3), n = l % 60,
      c = Math.floor(l / 60), d = c % 60, A = Math.floor(c / 60);
    var f = regl.timer.digitsFormat, S;
    if (f === "00:00:01") S = pad2(A) + ":" + pad2(d) + ":" + pad2(n);
    else if (A >= 1 || f === "0:00:01") S = A + ":" + pad2(d) + ":" + pad2(n);
    else if (f === "00:01") S = pad2(c) + ":" + pad2(n);
    else if (c >= 1) S = c + ":" + pad2(n);
    else S = String(n);
    return S + decimales(e, regl);
  }
  function couper(s) {
    var i = s.indexOf(".");
    return i < 0 ? { big: s, small: "" } : { big: s.slice(0, i), small: s.slice(i) };
  }

  /* couleur du texte selon la phase (je) */
  function couleurPhase(regl, etat) {
    if (regl.timer.overrideSplitColors) return rgbaTab(regl.timer.timerColor, regl.timer.timerAlpha);
    if (etat.phase === "Running") return rgbaTab(regl.layout.aheadGainingTimeColor, regl.layout.aheadGainingTimeAlpha);
    if (etat.phase === "Paused") return rgbaTab(regl.layout.pausedColor, regl.layout.pausedAlpha);
    if (etat.phase === "Ended") return rgbaTab(regl.layout.personalBestColor, regl.layout.personalBestAlpha);
    return rgbaTab(regl.layout.notRunningColor, regl.layout.notRunningAlpha);
  }

  /* ============================ normalisation (Ke) ============================ */
  function cloner(o) { return JSON.parse(JSON.stringify(o)); }
  function fusionner(base, ext) {
    if (!ext || typeof ext !== "object") return base;
    Object.keys(ext).forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(base, k)) {
        var v = ext[k];
        if (v && typeof v === "object" && !Array.isArray(v) &&
            base[k] && typeof base[k] === "object" && !Array.isArray(base[k]))
          fusionner(base[k], v);
        else base[k] = v;
      }
    });
    return base;
  }
  function imageFondValide(o) {
    var t = String(o || "").trim();
    return t && (/^\/api\/preference-media\/[0-9a-f]{64}$/.test(t) ||
      /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(t) &&
      t.length <= 9e5) ? t : "";
  }
  function normToucheStockee(o) {
    if (!o || typeof o !== "object" || !o.code) return null;
    return {
      code: String(o.code), key: o.key == null ? "" : String(o.key),
      label: o.label ? String(o.label) : libTouche(o.code, o.key),
      ctrl: !!o.ctrl, alt: !!o.alt, shift: !!o.shift, meta: !!o.meta
    };
  }
  function normaliser(partiel) {
    var t = fusionner(cloner(DEFAUTS), partiel || {});
    t.overlay.enabled = !!t.overlay.enabled;
    t.overlay.visible = t.overlay.enabled;
    t.overlay.left = bornInt(t.overlay.left, 0, 1e5);
    t.overlay.top = bornInt(t.overlay.top, 0, 1e5);
    t.overlay.anchor = parmi(t.overlay.anchor,
      ["free", "top-left", "top-right", "bottom-left", "bottom-right", "center"],
      DEFAUTS.overlay.anchor);
    t.overlay.offsetX = bornInt(t.overlay.offsetX, 0, 1e3);
    t.overlay.offsetY = bornInt(t.overlay.offsetY, 0, 1e3);
    t.overlay.zIndex = bornInt(t.overlay.zIndex, 1, 2147483647);
    t.overlay.allowResizing = !!t.overlay.allowResizing;
    t.overlay.passThroughWhileRunning = !!t.overlay.passThroughWhileRunning;
    t.timer.width = bornInt(t.timer.width, 50, 500);
    t.timer.height = bornInt(t.timer.height, 20, 150);
    t.timer.decimalsSize = borne(t.timer.decimalsSize, 10, 50);
    t.timer.digitsFormat = parmi(t.timer.digitsFormat, FORMATS, DEFAUTS.timer.digitsFormat);
    t.timer.accuracy = parmi(t.timer.accuracy, PRECISIONS, DEFAUTS.timer.accuracy);
    t.timer.backgroundGradient = parmi(t.timer.backgroundGradient, FONDS, DEFAUTS.timer.backgroundGradient);
    t.timer.timerColor = hexValide(t.timer.timerColor, "#aaaaaa");
    t.timer.timerAlpha = borne(t.timer.timerAlpha, 0, 1);
    t.timer.backgroundColor = hexValide(t.timer.backgroundColor);
    t.timer.backgroundAlpha = borne(t.timer.backgroundAlpha, 0, 1);
    t.timer.backgroundColor2 = hexValide(t.timer.backgroundColor2);
    t.timer.backgroundAlpha2 = borne(t.timer.backgroundAlpha2, 0, 1);
    t.timer.backgroundImage = imageFondValide(t.timer.backgroundImage);
    t.timer.backgroundImageAlpha = borne(t.timer.backgroundImageAlpha, 0, 1);
    t.timer.backgroundImageFit = parmi(t.timer.backgroundImageFit, ["cover", "contain", "stretch"], DEFAUTS.timer.backgroundImageFit);
    t.timer.borderColor = hexValide(t.timer.borderColor, DEFAUTS.timer.borderColor);
    t.timer.borderAlpha = borne(t.timer.borderAlpha, 0, 1);
    t.timer.borderWidth = borne(t.timer.borderWidth, 0, 8);
    t.timer.radius = borne(t.timer.radius, 0, 40);
    t.timer.centerTimer = !!t.timer.centerTimer;
    t.timer.showGradient = !!t.timer.showGradient;
    t.timer.overrideSplitColors = !!t.timer.overrideSplitColors;
    t.layout.timerFontFamily = String(t.layout.timerFontFamily || DEFAUTS.layout.timerFontFamily).trim() || DEFAUTS.layout.timerFontFamily;
    t.layout.timerFontSize = borne(t.layout.timerFontSize, 12, 120);
    t.layout.timerFontWeight = parmi(String(t.layout.timerFontWeight), POIDS, DEFAUTS.layout.timerFontWeight);
    t.layout.timerFontStyle = parmi(t.layout.timerFontStyle, ["normal", "italic"], DEFAUTS.layout.timerFontStyle);
    t.layout.letterSpacing = borne(t.layout.letterSpacing, -2, 8);
    t.layout.verticalNudge = borne(t.layout.verticalNudge, -20, 20);
    t.layout.opacity = borne(t.layout.opacity, .1, 1);
    t.layout.dropShadows = !!t.layout.dropShadows;
    t.layout.enterAnimation = parmi(String(t.layout.enterAnimation), ["none", "fade", "scale"], DEFAUTS.layout.enterAnimation);
    t.layout.animationDuration = bornInt(borne(t.layout.animationDuration, 0, 1e3), 0, 1e3);
    ["windowBackground", "personalBest", "aheadGainingTime", "aheadLosingTime",
      "behindGainingTime", "behindLosingTime", "bestSegment", "notRunning",
      "paused", "shadow", "outline"].forEach(function (l) {
      var nc = l + "Color", ac = l + "Alpha";
      if (t.layout[nc] !== undefined) t.layout[nc] = hexValide(t.layout[nc]);
      if (t.layout[ac] !== undefined) t.layout[ac] = borne(t.layout[ac], 0, 1);
    });
    TOUCHES_DEFS.forEach(function (l) { t.hotkeys[l.id] = normToucheStockee(t.hotkeys[l.id]); });
    t.hotkeys.hotkeyDelay = borne(t.hotkeys.hotkeyDelay, 0, 60);
    t.hotkeys.keyboardShortcuts = !!t.hotkeys.keyboardShortcuts;
    t.hotkeys.preventDefaultHotkeys = !!t.hotkeys.preventDefaultHotkeys;
    t.hotkeys.doubleTapPrevention = !!t.hotkeys.doubleTapPrevention;
    t.behavior.clickToggles = !!t.behavior.clickToggles;
    t.behavior.touchStartReset = t.behavior.touchStartReset !== false;
    if (!t.automation || typeof t.automation !== "object" || Array.isArray(t.automation))
      t.automation = cloner(DEFAUTS.automation);
    t.automation.enabled = !!t.automation.enabled;
    t.automation.startOnGameplay = !!t.automation.startOnGameplay;
    t.automation.pauseOnCoin = !!t.automation.pauseOnCoin;
    t.automation.pauseOnDeath = !!t.automation.pauseOnDeath;
    t.automation.pollMs = bornInt(borne(t.automation.pollMs, 80, 1e3), 80, 1e3);
    return t;
  }

  /* lecture/écriture dans tro_settings_v1 (préserve les autres clés du site) */
  function lireReglages() {
    var t = null;
    try { t = JSON.parse(localStorage.getItem(CLE_REGLAGES) || "null"); } catch (e) {}
    return normaliser((t && typeof t === "object" ? t.nativeTimer : null) || {});
  }
  function ecrireReglages(regl) {
    var t = null;
    try { t = JSON.parse(localStorage.getItem(CLE_REGLAGES) || "null"); } catch (e) {}
    if (!t || typeof t !== "object") t = {};
    t.nativeTimer = regl;
    try { localStorage.setItem(CLE_REGLAGES, JSON.stringify(t)); } catch (e) {}
  }

  /* ============================ libellés de touches (be/Ct) ============================ */
  function libTouche(code, key) {
    if (!code) return key || "Nenhuma";
    if (/^Numpad[0-9]$/.test(code)) return "Num " + code.slice(6);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^F[0-9]+$/.test(code)) return code;
    var map = {
      Escape: "Escape", Space: "Espaço", Enter: "Enter", Tab: "Tab",
      Backspace: "Backspace", Delete: "Delete", Insert: "Insert", Home: "Home",
      End: "End", PageUp: "Page Up", PageDown: "Page Down",
      ArrowUp: "Cima", ArrowDown: "Baixo", ArrowLeft: "Esquerda",
      ArrowRight: "Direita", Minus: "-", Equal: "=", BracketLeft: "[",
      BracketRight: "]", Backslash: "\\", Semicolon: ";", Quote: "'",
      Backquote: "`", Comma: ",", Period: ".", Slash: "/", NumpadAdd: "Num +",
      NumpadSubtract: "Num −", NumpadMultiply: "Num ×", NumpadDivide: "Num ÷",
      NumpadDecimal: "Num .", NumpadEnter: "Num Enter"
    };
    return map[code] || key || code;
  }
  function libCombinaise(t) {
    if (!t) return "Nenhuma";
    var parts = [];
    if (t.ctrl) parts.push("Ctrl");
    if (t.alt) parts.push("Alt");
    if (t.shift) parts.push("Shift");
    if (t.meta) parts.push("Win/Command");
    parts.push(libTouche(t.code, t.key));
    return parts.join(" + ");
  }
  function normToucheEvenement(e) {
    return normToucheStockee({
      code: e.code, key: e.key, ctrl: e.ctrlKey, alt: e.altKey,
      shift: e.shiftKey, meta: e.metaKey
    });
  }
  function touchesEgales(a, b) {
    return !!(a && b && a.code === b.code && !!a.ctrl === !!b.ctrl &&
      !!a.alt === !!b.alt && !!a.shift === !!b.shift && !!a.meta === !!b.meta);
  }
  function toucheModificatrice(e) {
    return e.code === "ControlLeft" || e.code === "ControlRight" ||
      e.code === "ShiftLeft" || e.code === "ShiftRight" ||
      e.code === "AltLeft" || e.code === "AltRight" ||
      e.code === "MetaLeft" || e.code === "MetaRight";
  }

  /* ============================ ancrages (sn/xt/ht) ============================ */
  function styleAncrage(o) {
    o = o || {};
    var t = o.anchor || "free";
    var n = Math.max(0, Number(o.offsetX) || 0), r = Math.max(0, Number(o.offsetY) || 0);
    if (t === "top-left") return { left: n, top: r, right: "auto", bottom: "auto", transform: "none" };
    if (t === "top-right") return { right: n, top: r, left: "auto", bottom: "auto", transform: "none" };
    if (t === "bottom-left") return { left: n, bottom: r, right: "auto", top: "auto", transform: "none" };
    if (t === "bottom-right") return { right: n, bottom: r, left: "auto", top: "auto", transform: "none" };
    if (t === "center") return { left: "calc(50% + " + n + "px)", top: "calc(50% + " + r + "px)", right: "auto", bottom: "auto", transform: "translate(-50%, -50%)" };
    return { left: Number(o.left) || 0, top: Number(o.top) || 0, right: "auto", bottom: "auto", transform: "none" };
  }
  function appliquerAncrage(el, regl) {
    if (!el) return;
    var s = styleAncrage(regl.overlay);
    ["left", "right", "top", "bottom", "transform"].forEach(function (k) {
      el.style[k] = typeof s[k] === "number" ? s[k] + "px" : s[k];
    });
  }
  function zindexJeu(z) { return Math.max(Number(z) || 1, ZINDEX_JEU_MIN); }

  /* ============================ route jeu (ts) ============================ */
  function routeReborn(chemin) {
    return /^\/[^/]+\/reborn(?:\/|$)/i.test(String(chemin || window.location.pathname || ""));
  }

  /* ============================ renderer canvas (At) ============================ */
  function creerRenderer(canvas) {
    var t = canvas.getContext("2d");
    var cachePolices = new Map();
    var dpr = 0, imgFond = null, imgFondUrl = "";
    var derniereFont = "", dernierEspacement = "";
    var dernLargeur = "", dernHauteur = "";
    var rayonPrec = "";
    var bordurePrec = "";
    var renduValide = true;
    var reglCourant = null, etatCourant = null;
    var cleDessin = "";

    function invalider() { renduValide = true; }

    function setPolice(taille) {
      var l = reglCourant.layout;
      var s = l.timerFontStyle + " " + l.timerFontWeight + " " + taille + "px " + l.timerFontFamily;
      if (s !== derniereFont) { t.font = s; derniereFont = s; }
      if ("letterSpacing" in t) {
        var u = l.letterSpacing + "px";
        if (u !== dernierEspacement) { t.letterSpacing = u; dernierEspacement = u; }
      }
    }
    function metriquesPolice(taille) {
      var l = reglCourant.layout;
      var s = l.timerFontStyle + "|" + l.timerFontWeight + "|" + taille + "|" + l.timerFontFamily + "|" + l.letterSpacing;
      var u = cachePolices.get(s);
      if (!u) {
        setPolice(taille);
        u = { chars: new Map(), metrics: null, zeroWidth: t.measureText("0").width };
        if (cachePolices.size >= MAX_POLICES_CACHE) cachePolices.clear();
        cachePolices.set(s, u);
      }
      return u;
    }
    function largeurCar(a, i, s) {
      if (i >= "0" && i <= "9") return a.zeroWidth;
      var u = a.chars.get(i);
      if (u !== undefined) return u;
      setPolice(s);
      var y = t.measureText(i).width;
      a.chars.set(i, y);
      return y;
    }
    function mesurer(txt, taille) {
      var s = metriquesPolice(taille), u = 0;
      for (var y = 0; y < txt.length; y++) u += largeurCar(s, txt.charAt(y), taille);
      return { width: u, zeroWidth: s.zeroWidth };
    }
    function metriquesVerticales(taille) {
      var s = metriquesPolice(taille);
      if (s.metrics) return s.metrics;
      setPolice(taille);
      var m = t.measureText("0");
      return s.metrics = {
        ascent: m.actualBoundingBoxAscent || taille * .78,
        descent: m.actualBoundingBoxDescent || taille * .22
      };
    }
    function redimensionner(larg, haut) {
      var s = Math.max(1, globalThis.devicePixelRatio || 1);
      var u = Math.round(larg * s), y = Math.round(haut * s);
      if (s !== dpr || canvas.width !== u || canvas.height !== y) {
        dpr = s; canvas.width = u; canvas.height = y;
        derniereFont = ""; dernierEspacement = "";
      }
      var h = larg + "px", p = haut + "px";
      if (h !== dernLargeur) { canvas.style.width = h; dernLargeur = h; }
      if (p !== dernHauteur) { canvas.style.height = p; dernHauteur = p; }
      t.setTransform(dpr, 0, 0, dpr, 0, 0);
      t.imageSmoothingEnabled = true;
    }
    function dessinerTexte(txt, taille, posX, posY, base, alignement, couleur, decX, decY, mode, epaisseur) {
      if (!txt) return;
      var m = mesurer(txt, taille);
      /* « far » (grand texte) : calé à droite contre la base (493 chez
         l'original) ; « near » (décimales) : position donnée directement */
      var e = alignement === "far" ? base - m.width : 0;
      setPolice(taille);
      t.textAlign = "center"; t.textBaseline = "alphabetic";
      t.lineJoin = "round"; t.miterLimit = 2;
      if (mode === "stroke") { t.strokeStyle = couleur; t.lineWidth = epaisseur || 1; }
      else t.fillStyle = couleur;
      for (var i = 0; i < txt.length; i++) {
        var ch = txt.charAt(i);
        var cw = largeurCar(metriquesPolice(taille), ch, taille);
        var cx = posX + e + cw / 2 + (decX || 0);
        var cy = posY + (decY || 0);
        if (mode === "stroke") t.strokeText(ch, cx, cy);
        else t.fillText(ch, cx, cy);
        e += cw;
      }
    }
    function dessinerImageFond(regl, larg, haut) {
      var u = regl.timer.backgroundImage || "";
      if (!u) { imgFond = null; imgFondUrl = ""; return; }
      if (u !== imgFondUrl) {
        imgFondUrl = u;
        imgFond = new Image();
        imgFond.onload = function () { invalider(); if (reglCourant && etatCourant) rendre(reglCourant, etatCourant); };
        imgFond.src = u;
      }
      if (!(imgFond && imgFond.complete && imgFond.naturalWidth && imgFond.naturalHeight)) return;
      var y = imgFond.naturalWidth, h = imgFond.naturalHeight, p = regl.timer.backgroundImageFit;
      var m = larg, g = haut, k = 0, C = 0;
      if (p !== "stretch") {
        var M = p === "contain" ? Math.min(larg / y, haut / h) : Math.max(larg / y, haut / h);
        m = y * M; g = h * M; k = (larg - m) / 2; C = (haut - g) / 2;
      }
      t.save(); t.globalAlpha = regl.timer.backgroundImageAlpha;
      t.drawImage(imgFond, k, C, m, g); t.restore();
      derniereFont = ""; dernierEspacement = "";
    }
    function degradeRect(x1, y1, x2, y2, c1, c2, larg, haut) {
      var g = t.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0, rgbaStr(c1)); g.addColorStop(1, rgbaStr(c2));
      t.fillStyle = g; t.fillRect(0, 0, larg, haut);
    }
    function dessinerFondTimer(regl, infos, larg, haut) {
      var y = regl.timer.backgroundGradient;
      var h = rgbaTab(regl.timer.backgroundColor, regl.timer.backgroundAlpha);
      var p = rgbaTab(regl.timer.backgroundColor2, regl.timer.backgroundAlpha2);
      if (y.indexOf("WithDeltaColor") !== -1) {
        var hsv = versHSV(infos[0], infos[1], infos[2]);
        var g = depuisHSV(hsv.h, hsv.s * .5, hsv.v * .25);
        if (y === "PlainWithDeltaColor") h = [g[0], g[1], g[2], infos[3] * 7 / 12];
        else { h = [g[0], g[1], g[2], infos[3] / 6]; p = [g[0], g[1], g[2], infos[3]]; }
      }
      if ((h[3] <= 0 && y === "Plain") || (h[3] <= 0 && p[3] <= 0)) return;
      if (y === "Horizontal" || y === "HorizontalWithDeltaColor")
        degradeRect(0, 0, larg, 0, h, p, larg, haut);
      else if (y === "Vertical" || y === "VerticalWithDeltaColor")
        degradeRect(0, 0, 0, haut, h, p, larg, haut);
      else { t.fillStyle = rgbaStr(h); t.fillRect(0, 0, larg, haut); }
    }
    function dessinerChrono(regl, big, small, infos, larg, haut) {
      var p = regl.layout.timerFontSize;
      var m = p / 50 * regl.timer.decimalsSize;
      var g = mesurer(small, m).width;
      var k = mesurer("88:88:88", p).width;
      var C = Math.max(10, k + g + 11);
      var M = (larg - 14) / (C - 14);
      var x = haut / HAUTEUR_LIGNE;
      var E = regl.timer.centerTimer ? 0 : 7;
      var T = Math.min(M, x);
      t.save();
      t.translate(larg - E, haut / 2);
      t.scale(T, T);
      t.translate(-C + E, -.5 * HAUTEUR_LIGNE);
      if (regl.timer.centerTimer) t.translate(-(larg - C * T) / 2 / T, 0);
      dessinerChronoInterne(regl, big, small, infos, C, p, m);
      t.restore();
      derniereFont = ""; dernierEspacement = "";
    }
    function dessinerChronoInterne(regl, big, small, infos, C, h, p) {
      var m = metriquesVerticales(h), g = metriquesVerticales(p);
      var k = mesurer(small, p).width;
      var M = (HAUTEUR_LIGNE - m.ascent - m.descent) / 2;
      var x = M + m.ascent + regl.layout.verticalNudge;
      var E = C - 499 - k;
      var T = C - k - 6;
      var N = M + regl.layout.verticalNudge;
      var K = M + m.ascent - g.ascent + regl.layout.verticalNudge;
      var coulGrande = regl.timer.showGradient
        ? degradeTexte(t, infos, N, N + m.ascent + m.descent) : rgbaStr(infos);
      var coulPetite = regl.timer.showGradient
        ? degradeTexte(t, infos, K, K + m.ascent + m.descent + p - h) : rgbaStr(infos);
      var F = rgbaTab(regl.layout.outlineColor, regl.layout.outlineAlpha);
      var q = rgbaTab(regl.layout.shadowColor, regl.layout.shadowAlpha);
      if (regl.layout.dropShadows && q[3] > 0) {
        dessinerTexte(big, h, E, x, 493, "far", rgbaStr(q), 1, 1, "fill");
        dessinerTexte(small, p, T, x, 257, "near", rgbaStr(q), 1, 1, "fill");
        dessinerTexte(big, h, E, x, 493, "far", rgbaStr(q), 2, 2, "fill");
        dessinerTexte(small, p, T, x, 257, "near", rgbaStr(q), 2, 2, "fill");
      }
      if (F[3] > 0) {
        dessinerTexte(big, h, E, x, 493, "far", rgbaStr(F), 0, 0, "stroke", 2.1 + h * .055);
        dessinerTexte(small, p, T, x, 257, "near", rgbaStr(F), 0, 0, "stroke", 2.1 + p * .055);
      }
      dessinerTexte(big, h, E, x, 493, "far", coulGrande, 0, 0, "fill");
      dessinerTexte(small, p, T, x, 257, "near", coulPetite, 0, 0, "fill");
    }
    function rendre(regl, etat) {
      var larg = regl.timer.width, haut = regl.timer.height;
      var infos = couleurPhase(regl, etat);
      var txt = formater(etat.elapsed || 0, regl);
      var morceaux = couper(txt);
      var cle = morceaux.big + "\0" + morceaux.small + "\0" + infos.join(",") + "\0" + larg + "x" + haut;
      if (regl !== reglCourant || etat !== etatCourant) invalider();
      reglCourant = regl; etatCourant = etat;
      if (!renduValide && cle === cleDessin) return;
      renduValide = false; cleDessin = cle;
      redimensionner(larg, haut);
      t.clearRect(0, 0, larg, haut);
      var rayon = regl.timer.radius > 0 ? regl.timer.radius + "px" : "";
      if (rayon !== rayonPrec) {
        if (rayon) canvas.style.borderRadius = rayon;
        else canvas.style.removeProperty("border-radius");
        rayonPrec = rayon;
      }
      var bordure = regl.timer.borderWidth > 0
        ? regl.timer.borderWidth + "px solid " + rgbaHexAlpha(regl.timer.borderColor, regl.timer.borderAlpha) : "0";
      if (bordure !== bordurePrec) { canvas.style.border = bordure; bordurePrec = bordure; }
      t.fillStyle = rgbaHexAlpha(regl.layout.windowBackgroundColor, regl.layout.windowBackgroundAlpha);
      t.fillRect(0, 0, larg, haut);
      dessinerImageFond(regl, larg, haut);
      dessinerFondTimer(regl, infos, larg, haut);
      dessinerChrono(regl, morceaux.big, morceaux.small, infos, larg, haut);
    }
    return { invalidate: invalider, render: rendre };
  }

  /* ============================ état & signaux ============================ */
  var reglages = lireReglages();
  var etat = { phase: "NotRunning", elapsed: 0, startedAt: 0, splits: [],
    currentSplitIndex: -1, currentComparison: "Personal Best" };
  var signaux = etatSignauxNeuf();
  function etatSignauxNeuf() {
    return { lastStartedAt: 0, lastPauseAt: 0, pauseReason: "",
      lastRuntimeEvent: "", lastRuntimeEventAt: 0, lastCoinSignalAt: 0 };
  }

  /* ============================ DOM overlay ============================ */
  var overlay = document.createElement("div");
  overlay.className = "native-timer-overlay";
  overlay.setAttribute("role", "timer");
  overlay.setAttribute("aria-label", "Cronômetro nativo LiveSplit");
  overlay.title = "LiveSplit nativo: clique para opcoes; arraste para mover; bordas ou Shift + arraste para redimensionar; duplo clique reseta.";
  var canvasInl = document.createElement("canvas");
  canvasInl.className = "native-timer-canvas";
  overlay.appendChild(canvasInl);
  var styleOverlay = document.createElement("style");
  styleOverlay.textContent =
    ".native-timer-overlay{position:fixed;margin:0;padding:0;border:0;box-sizing:border-box;" +
    "overflow:hidden;user-select:none;-webkit-user-select:none;touch-action:none;cursor:move;" +
    "transform:translateZ(0);will-change:left,top,width,height,opacity}" +
    ".native-timer-canvas{display:block;margin:0;padding:0;border:0;pointer-events:none}" +
    "@keyframes tro-timer-fade{from{opacity:0}to{opacity:1}}" +
    "@keyframes tro-timer-scale{from{opacity:0;transform:translateZ(0) scale(.92)}to{opacity:1;transform:translateZ(0) scale(1)}}" +
    ".native-timer-overlay[data-enter-animation=fade]{animation:tro-timer-fade var(--native-timer-animation-duration,.18s) ease both}" +
    ".native-timer-overlay[data-enter-animation=scale]{animation:tro-timer-scale var(--native-timer-animation-duration,.18s) ease both}" +
    /* menu (portage de .game-overlay-quick-menu, Bnkv1eCm.css) */
    ".tro-quick-menu{position:fixed;z-index:2147483000;display:flex;flex-direction:column;gap:10px;" +
    "max-height:min(640px,max(320px,100vh - 16px));overflow:auto;padding:14px;border:1px solid #2b3040;" +
    "border-radius:14px;background:#141822;color:#edf0f7;font:500 13px/1.45 Inter,system-ui,sans-serif;" +
    "box-shadow:0 18px 50px rgba(0,0,0,.55)}" +
    ".tro-quick-menu head,.tro-qm-head{display:flex;align-items:center;justify-content:space-between;gap:10px}" +
    ".tro-qm-head strong{font-size:14px;font-weight:700}" +
    ".tro-qm-head button{background:none;border:0;color:#97a0b4;font-size:16px;cursor:pointer;padding:4px 8px;border-radius:6px}" +
    ".tro-qm-head button:hover{color:#edf0f7;background:#1d2331}" +
    ".tro-qm-section{display:grid;gap:10px;padding:12px;border:1px solid #232939;border-radius:12px;background:#171c28}" +
    ".tro-qm-section>h4{margin:0;font-size:10.5px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#97a0b4}" +
    ".tro-qm-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}" +
    ".tro-qm-btn{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 12px;" +
    "border:1px solid #303850;border-radius:8px;background:#171c28;color:#edf0f7;font:600 12px/1 Inter,system-ui,sans-serif;" +
    "cursor:pointer;transition:border-color .14s,background .14s}" +
    ".tro-qm-btn:hover{border-color:#ffb020;background:#1d2331}" +
    ".tro-qm-note{margin:0;color:#97a0b4;font:500 11px/1.4 Inter,system-ui,sans-serif}" +
    ".tro-qm-toggle{display:flex;align-items:center;gap:10px;min-height:34px;margin:0;padding:6px 10px;" +
    "border:1px solid #232939;border-radius:8px;background:#12161f;color:#edf0f7;cursor:pointer;font-size:12px}" +
    ".tro-qm-toggle input{accent-color:#ffb020;margin:0}" +
    ".tro-qm-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}" +
    ".tro-qm-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}" +
    ".tro-qm-grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}" +
    ".tro-qm-field{display:grid;gap:5px;padding:7px 9px;border:1px solid #232939;border-radius:8px;background:#12161f}" +
    ".tro-qm-field label{font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:#97a0b4}" +
    ".tro-qm-field input,.tro-qm-field select{width:100%;min-width:0;background:#0b0e15;border:1px solid #303850;" +
    "border-radius:6px;color:#edf0f7;padding:5px 7px;font:600 12px/1.2 ui-monospace,Consolas,monospace}" +
    ".tro-qm-key-row{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:8px}" +
    ".tro-qm-key-row.is-listening .tro-qm-key-btn{border-color:#ffb020;color:#ffb020}" +
    ".tro-qm-key-btn{min-width:96px}kbd.tro-qm-kbd{background:#0b0e15;border:1px solid #303850;border-radius:5px;" +
    "padding:3px 8px;font:600 11px/1 ui-monospace,Consolas,monospace;color:#edf0f7}";
  document.head.appendChild(styleOverlay);

  var rendererInl = creerRenderer(canvasInl);
  var rafId = 0;
  var pointeur = null;           /* interaction glisser/redimensionner */
  var menuAncrage = null;        /* position d'ouverture du menu */
  var toucheEcoute = null;       /* id de raccourci en capture */
  var menuEl = null;
  var popup = null;              /* { window, canvas, renderer } */
  var popupOuvert = false, popupNotice = "";
  var dernierTap = 0;            /* anti double-pression (ie) */
  var minuteursRetard = [];

  /* ============================ affichage (P/D/…) ============================ */
  function overlayActif() {
    return routeReborn() && reglages.overlay.enabled && reglages.overlay.visible;
  }
  function doitRendre() { return overlayActif() || !!(popup && popup.window && !popup.window.closed); }
  function appliquer() {
    overlay.style.width = reglages.timer.width + "px";
    overlay.style.height = reglages.timer.height + "px";
    appliquerAncrage(overlay, reglages);
    overlay.style.zIndex = String(routeReborn() ? zindexJeu(reglages.overlay.zIndex) : (Number(reglages.overlay.zIndex) || 1));
    overlay.style.opacity = String(reglages.layout.opacity);
    overlay.style.display = overlayActif() ? "block" : "none";
    overlay.style.background = rgbaHexAlpha(reglages.layout.windowBackgroundColor, reglages.layout.windowBackgroundAlpha);
    overlay.style.border = reglages.timer.borderWidth > 0
      ? reglages.timer.borderWidth + "px solid " + rgbaHexAlpha(reglages.timer.borderColor, reglages.timer.borderAlpha)
      : "0";
    overlay.style.borderRadius = reglages.timer.radius + "px";
    overlay.style.setProperty("--native-timer-animation-duration", reglages.layout.animationDuration + "ms");
    overlay.dataset.enterAnimation = reglages.layout.enterAnimation;
    overlay.style.pointerEvents = (reglages.overlay.passThroughWhileRunning && etat.phase === "Running") ? "none" : "auto";
    overlay.dataset.phase = etat.phase;
    overlay.dataset.automation = reglages.automation.enabled ? "enabled" : "disabled";
    if (signaux.pauseReason) overlay.dataset.autoReason = signaux.pauseReason;
    else delete overlay.dataset.autoReason;
    if (signaux.lastRuntimeEvent) overlay.dataset.autoEvent = signaux.lastRuntimeEvent;
    else delete overlay.dataset.autoEvent;
    canvasInl.style.width = reglages.timer.width + "px";
    canvasInl.style.height = reglages.timer.height + "px";
    bornerFenetre(false);
  }
  function rendre() {
    if (overlayActif()) rendererInl.render(reglages, etat);
    rendrePopup();
  }
  function rafraichir() {
    appliquer(); rendre();
    if (etat.phase === "Running") lancerBoucle(); else arreterBoucle();
  }
  function bornerFenetre(sauver) {
    var maxG = Math.max(0, window.innerWidth - reglages.timer.width);
    var maxH = Math.max(0, window.innerHeight - reglages.timer.height);
    var g = bornInt(borne(reglages.overlay.left, 0, maxG), 0, 1e5);
    var h = bornInt(borne(reglages.overlay.top, 0, maxH), 0, 1e5);
    var bouge = g !== reglages.overlay.left || h !== reglages.overlay.top;
    reglages.overlay.left = g; reglages.overlay.top = h;
    appliquerAncrage(overlay, reglages);
    if (sauver && bouge) sauver();
  }

  /* ============================ boucle rAF (Ce/$/B) ============================ */
  function lancerBoucle() {
    if (!rafId && !document.hidden && doitRendre())
      rafId = window.requestAnimationFrame(boucle);
  }
  function boucle() {
    rafId = 0;
    if (etat.phase === "Running") {
      etat.elapsed = performance.now() - etat.startedAt;
      if (!document.hidden && doitRendre()) rendre();
      lancerBoucle();
    }
  }
  function arreterBoucle() {
    if (rafId) { window.cancelAnimationFrame(rafId); rafId = 0; }
  }

  /* ============================ actions (Ie/ye/Ze/je/Ye/we/be) ============================ */
  function demarrerOuSplit() {
    signaux.pauseReason = "";
    if (etat.phase === "Running") {
      etat.phase = "Ended";
      etat.elapsed = performance.now() - etat.startedAt;
      etat.splits.push(etat.elapsed);
    } else if (etat.phase === "Paused") {
      etat.phase = "Running";
      etat.startedAt = performance.now() - etat.elapsed;
    } else if (etat.phase === "NotRunning") {
      etat.phase = "Running"; etat.elapsed = 0;
      etat.startedAt = performance.now();
      signaux.lastStartedAt = etat.startedAt;
      etat.splits = []; etat.currentSplitIndex = 0;
    } else if (etat.phase === "Ended") { reinitialiser(); return; }
    rafraichir();
  }
  function reinitialiser() {
    razSignaux();
    etat.phase = "NotRunning"; etat.elapsed = 0; etat.startedAt = 0;
    etat.currentSplitIndex = -1; etat.splits = [];
    rafraichir();
  }
  function annulerSplit() {
    if (etat.phase !== "Ended" || etat.splits.length <= 0) return;
    signaux.pauseReason = "";
    etat.splits.pop();
    etat.phase = "Running";
    etat.startedAt = performance.now() - etat.elapsed;
    rafraichir();
  }
  function basculerPause() {
    signaux.pauseReason = "";
    if (etat.phase === "Running") {
      etat.elapsed = performance.now() - etat.startedAt;
      etat.phase = "Paused";
    } else if (etat.phase === "Paused") {
      etat.phase = "Running";
      etat.startedAt = performance.now() - etat.elapsed;
    } else if (etat.phase === "NotRunning") { demarrerOuSplit(); return; }
    rafraichir();
  }
  function departAuto() {
    signaux.pauseReason = "";
    signaux.lastStartedAt = performance.now();
    etat.phase = "Running"; etat.elapsed = 0;
    etat.startedAt = signaux.lastStartedAt;
    etat.splits = []; etat.currentSplitIndex = 0;
    rafraichir();
  }
  function pauseAuto(raison) {
    if (etat.phase !== "Running") return;
    var maintenant = performance.now();
    etat.elapsed = maintenant - etat.startedAt;
    etat.phase = "Paused";
    signaux.pauseReason = raison;
    signaux.lastPauseAt = maintenant;
    rafraichir();
  }
  function repriseAuto() {
    if (etat.phase !== "Paused") return;
    etat.phase = "Running";
    etat.startedAt = performance.now() - etat.elapsed;
    signaux.pauseReason = "";
    rafraichir();
  }
  function razSignaux() {
    signaux = etatSignauxNeuf();
    delete overlay.dataset.autoReason;
    overlay.dataset.autoSignal = "idle";
  }
  function executerAction(action) {
    if (antiDoubleTouche()) return;
    if ((action === "startSplit" || action === "pause") && reglages.hotkeys.hotkeyDelay > 0) {
      var id = window.setTimeout(function () {
        minuteursRetard = minuteursRetard.filter(function (x) { return x !== id; });
        appliquerAction(action);
      }, reglages.hotkeys.hotkeyDelay * 1e3);
      minuteursRetard.push(id);
      return;
    }
    appliquerAction(action);
  }
  function appliquerAction(action) {
    if (action === "startSplit") demarrerOuSplit();
    else if (action === "reset") reinitialiser();
    else if (action === "undoSplit") annulerSplit();
    else if (action === "pause") basculerPause();
    /* « skipSplit » : sans effet dans l'implémentation d'origine */
  }
  function antiDoubleTouche() {
    if (!reglages.hotkeys.doubleTapPrevention) {
      dernierTap = performance.now(); return false;
    }
    var maintenant = performance.now();
    var fenetre = etat.phase === "Ended" ? 600 : 300;
    if (maintenant - dernierTap <= fenetre) return true;
    dernierTap = maintenant;
    return false;
  }

  /* ============================ persistance ============================ */
  function sauver() { ecrireReglages(reglages); }
  function patchSection(section, patch) {
    reglages[section] = Object.assign({}, reglages[section], patch);
    reglages = normaliser(reglages);
    rafraichir(); sauver();
  }

  /* ============================ interactions pointeur (Oe/tt/Qe/nt/Ae/ve) ============================ */
  function zoneBordure(e) {
    var r = overlay.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top;
    var g = x <= BORD_REDIM, d = x >= r.width - BORD_REDIM;
    var h = y <= BORD_REDIM, b = y >= r.height - BORD_REDIM;
    if (h && g) return "top-left";
    if (h && d) return "top-right";
    if (b && g) return "bottom-left";
    if (b && d) return "bottom-right";
    if (g) return "left";
    if (d) return "right";
    if (h) return "top";
    if (b) return "bottom";
    return "";
  }
  function majCurseur(e) {
    if (overlay.style.pointerEvents === "none") return;
    var zone = reglages.overlay.allowResizing ? zoneBordure(e) : "";
    var c = "move";
    if (zone === "top-left" || zone === "bottom-right") c = "nwse-resize";
    else if (zone === "top-right" || zone === "bottom-left") c = "nesw-resize";
    else if (zone === "left" || zone === "right") c = "ew-resize";
    else if (zone === "top" || zone === "bottom") c = "ns-resize";
    overlay.style.cursor = c;
  }
  overlay.addEventListener("pointerdown", function (e) {
    if (e.button !== 0 || overlay.style.pointerEvents === "none") return;
    if (reglages.overlay.anchor !== "free") {
      var r = overlay.getBoundingClientRect();
      reglages.overlay.anchor = "free";
      reglages.overlay.left = Math.round(r.left);
      reglages.overlay.top = Math.round(r.top);
      appliquer();
    }
    var zone = reglages.overlay.allowResizing
      ? (e.shiftKey ? "bottom-right" : zoneBordure(e)) : "";
    pointeur = {
      id: e.pointerId, mode: zone ? "resize" : "move", hit: zone,
      x: e.clientX, y: e.clientY,
      left: reglages.overlay.left, top: reglages.overlay.top,
      width: reglages.timer.width, height: reglages.timer.height,
      pointerType: e.pointerType || "mouse", moved: false
    };
    try { overlay.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  overlay.addEventListener("pointermove", function (e) {
    if (!pointeur) { majCurseur(e); return; }
    if (e.pointerId !== pointeur.id) return;
    var dx = e.clientX - pointeur.x, dy = e.clientY - pointeur.y;
    if (Math.abs(dx) > SEUIL_DEPLACEMENT || Math.abs(dy) > SEUIL_DEPLACEMENT) pointeur.moved = true;
    if (pointeur.moved && pointeur.mode === "resize") redimensionner(dx, dy);
    else if (pointeur.moved) {
      reglages.overlay.left = pointeur.left + dx;
      reglages.overlay.top = pointeur.top + dy;
      appliquer();
    }
    e.preventDefault();
  });
  overlay.addEventListener("pointerup", function (e) {
    if (!pointeur || e.pointerId !== pointeur.id) return;
    var aBouge = pointeur.moved, mode = pointeur.mode;
    pointeur = null;
    try { overlay.releasePointerCapture(e.pointerId); } catch (err) {}
    majCurseur(e);
    if (aBouge) sauver();
    else if (mode === "move") ouvrirMenu(e.clientX, e.clientY);
  });
  overlay.addEventListener("pointercancel", function () { pointeur = null; });
  overlay.addEventListener("dblclick", function (e) { e.preventDefault(); reinitialiser(); });
  overlay.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  function redimensionner(dx, dy) {
    var zone = pointeur.hit;
    var gauche = pointeur.left, haut = pointeur.top;
    var larg = pointeur.width, haut2 = pointeur.height;
    if (zone.indexOf("right") !== -1)
      larg = borne(pointeur.width + dx, 50, Math.min(500, window.innerWidth - pointeur.left));
    if (zone.indexOf("bottom") !== -1)
      haut2 = borne(pointeur.height + dy, 20, Math.min(150, window.innerHeight - pointeur.top));
    if (zone.indexOf("left") !== -1) {
      larg = borne(pointeur.width - dx, 50, Math.min(500, pointeur.left + pointeur.width));
      gauche = pointeur.left + (pointeur.width - larg);
    }
    if (zone.indexOf("top") !== -1) {
      haut2 = borne(pointeur.height - dy, 20, Math.min(150, pointeur.top + pointeur.height));
      haut = pointeur.top + (pointeur.height - haut2);
    }
    reglages.overlay.left = Math.round(gauche);
    reglages.overlay.top = Math.round(haut);
    reglages.timer.width = Math.round(larg);
    reglages.timer.height = Math.round(haut2);
    appliquer(); rendre();
  }
  window.addEventListener("resize", function () { bornerFenetre(true); rendre(); }, { passive: true });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { arreterBoucle(); return; }
    if (etat.phase === "Running") {
      etat.elapsed = performance.now() - etat.startedAt;
      rendre(); lancerBoucle();
    }
  });

  /* ============================ raccourcis clavier ============================ */
  document.addEventListener("keydown", function (e) {
    /* capture d'un nouveau raccourci (mode écoute du menu) */
    if (toucheEcoute) {
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") { toucheEcoute = null; rafraichirMenu(); return; }
      var patch = {}; patch[toucheEcoute] = normToucheEvenement(e);
      patchSection("hotkeys", patch);
      toucheEcoute = null; rafraichirMenu();
      return;
    }
    if (!reglages.overlay.enabled || !reglages.hotkeys.keyboardShortcuts) return;
    var cible = e.target;
    if (cible && (cible.isContentEditable || cible.tagName === "INPUT" ||
      cible.tagName === "TEXTAREA" || cible.tagName === "SELECT")) return;
    if (toucheModificatrice(e)) return;
    var t = normToucheEvenement(e);
    var action = null;
    for (var i = 0; i < TOUCHES_DEFS.length; i++)
      if (touchesEgales(reglages.hotkeys[TOUCHES_DEFS[i].id], t)) { action = TOUCHES_DEFS[i].action; break; }
    if (!action) return;
    if (reglages.hotkeys.preventDefaultHotkeys) { e.preventDefault(); e.stopPropagation(); }
    executerAction(action);
  }, true);

  /* ============================ automatisation (écoute du jeu) ============================ */
  function evenementReborn(type) { return String(type || "").indexOf("reborn:") === 0; }
  function estDepartReborn(t) { return t === "reborn:runStarted"; }
  function estReprise(t) { return t === "reborn:resume" || t === "reborn:runResumed"; }
  function repriseAutorisee(t) {
    return t === "reborn:runResumed" ? true : signaux.pauseReason === "pause";
  }
  function estPauseJeu(t) { return t === "reborn:pause"; }
  function estPiece(t) { return t === "reborn:coinCollected"; }
  function estMort(t) {
    return t === "reborn:playerDied" || t === "reborn:saveMeShown" ||
      t === "reborn:runEnded" || t === "reborn:gameEnded";
  }
  function departAutorise(type) {
    if (etat.phase === "NotRunning" || etat.phase === "Ended") return true;
    var maintenant = performance.now();
    if (etat.phase === "Running") {
      var depart = signaux.lastStartedAt || etat.startedAt || 0;
      return !!(depart && maintenant - depart >= GARDE_STARTAUDIO_MS && type === "unity:startAudio");
    }
    if (etat.phase !== "Paused") return false;
    return (!signaux.lastPauseAt || maintenant - signaux.lastPauseAt >= REPIF_PAUSE_MS) &&
      (signaux.pauseReason === "coin" || signaux.pauseReason === "death");
  }
  function signalPieceAutorise() {
    var maintenant = performance.now();
    var depart = signaux.lastStartedAt || etat.startedAt || 0;
    if (depart && maintenant - depart < DEBUT_PIECE_MS) return false;
    if (signaux.lastCoinSignalAt && maintenant - signaux.lastCoinSignalAt < ENTRE_PIECES_MS) return false;
    signaux.lastCoinSignalAt = maintenant;
    return true;
  }
  window.addEventListener("tro:unity-runtime-event", function (e) {
    var type = (e.detail && e.detail.type) || "";
    var surReborn = routeReborn();
    if (!reglages.overlay.enabled || !reglages.overlay.visible ||
        !reglages.automation.enabled) return;
    if (evenementReborn(type)) {
      if (!surReborn) return;
      signaux.lastRuntimeEvent = type;
      signaux.lastRuntimeEventAt = performance.now();
      overlay.dataset.autoSignal = type || "runtime";
      overlay.dataset.autoEvent = type || "runtime";
      if (reglages.automation.startOnGameplay && estDepartReborn(type)) { departAuto(); return; }
      if (estReprise(type) && repriseAutorisee(type)) { repriseAuto(); return; }
      if (reglages.automation.pauseOnDeath && estMort(type) && etat.phase === "Running") { pauseAuto("death"); return; }
      if (reglages.automation.pauseOnCoin && estPiece(type) && etat.phase === "Running" && signalPieceAutorise()) { pauseAuto("coin"); return; }
      if (estPauseJeu(type) && etat.phase === "Running") pauseAuto("pause");
      return;
    }
    if (surReborn) return;
    /* hors routes reborn : ponts poki/unity du site d'origine */
    var departGen = type === "poki:gameplayStart" || type === "poki:roundStart" || type === "unity:startAudio";
    if (departGen || type === "poki:roundEnd") {
      signaux.lastRuntimeEvent = type;
      signaux.lastRuntimeEventAt = performance.now();
      overlay.dataset.autoSignal = type || "runtime";
      overlay.dataset.autoEvent = type || "runtime";
    }
    if (reglages.automation.startOnGameplay && departGen && departAutorise(type)) { departAuto(); return; }
    if (reglages.automation.pauseOnDeath && type === "poki:roundEnd" && etat.phase === "Running") { pauseAuto("death"); return; }
  });

  /* drapeau de compatibilité avec le moniteur de pièces d'origine */
  function majDrapeauPiece() {
    var actif = !!(reglages.overlay.enabled && reglages.overlay.visible &&
      reglages.automation.enabled && reglages.automation.pauseOnCoin);
    if (window.__troNativeTimerCoinAutomationEnabled !== actif) {
      window.__troNativeTimerCoinAutomationEnabled = actif;
      window.dispatchEvent(new CustomEvent("tro:native-timer-coin-automation-change",
        { detail: { enabled: actif } }));
    }
  }

  /* ============================ popup externe (PiP) ============================ */
  function fermerPopup() {
    if (popup && popup.window && !popup.window.closed) {
      try { popup.window.close(); } catch (e) {}
    }
    popup = null; popupOuvert = false; popupNotice = "";
    appliquer(); rendre();
  }
  function rendrePopup() {
    if (!popup || !popup.canvas) return;
    if (!popup.window || popup.window.closed) { fermerPopup(); rafraichirMenu(); return; }
    popup.canvas.style.width = reglages.timer.width + "px";
    popup.canvas.style.height = reglages.timer.height + "px";
    popup.window.document.documentElement.style.setProperty("--tro-timer-popup-width", reglages.timer.width + "px");
    popup.window.document.documentElement.style.setProperty("--tro-timer-popup-height", reglages.timer.height + "px");
    if (!popup.renderer) popup.renderer = creerRenderer(popup.canvas);
    popup.renderer.render(reglages, etat);
  }
  function ouvrirPopup() {
    if (popup && popup.window && !popup.window.closed) {
      popup.window.focus(); rendrePopup(); popupNotice = "";
      rafraichirMenu(); return;
    }
    var requestWindow = window.documentPictureInPicture &&
      window.documentPictureInPicture.requestWindow;
    if (typeof requestWindow !== "function") {
      popupNotice = "Popup externo nao esta disponivel neste navegador.";
      rafraichirMenu(); return;
    }
    var larg = bornInt(borne(reglages.timer.width, 180, 640), 180, 640);
    var haut = bornInt(borne(reglages.timer.height, 70, 360), 70, 360);
    requestWindow.call(window.documentPictureInPicture,
      { width: larg, height: haut }).then(function (win) {
      win.document.open();
      win.document.write(
        '<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n' +
        '  <meta name="viewport" content="width=device-width, initial-scale=1">\n' +
        "  <title>TRO Timer</title>\n  <style>\n" +
        "    :root { color-scheme: dark; font-family: Inter, Arial, sans-serif; }\n" +
        "    * { box-sizing: border-box; }\n" +
        "    html, body { width: 100%; height: 100%; margin: 0; background: transparent; color: #f8f8f8; overflow: hidden; }\n" +
        "    body { display: grid; place-items: center; padding: 0; }\n" +
        "    main { width: var(--tro-timer-popup-width, 100vw); height: var(--tro-timer-popup-height, 100vh); display: grid; place-items: center; background: transparent; }\n" +
        "    canvas { display: block; width: var(--tro-timer-popup-width, 100%); height: var(--tro-timer-popup-height, 100%); max-width: 100vw; max-height: 100vh; background: transparent; }\n" +
        "  </style>\n</head>\n<body>\n  <main>\n" +
        '    <canvas id="tro-timer-popup-canvas"></canvas>\n' +
        "  </main>\n</body>\n</html>");
      win.document.close();
      popup = {
        window: win,
        canvas: win.document.getElementById("tro-timer-popup-canvas"),
        renderer: null
      };
      win.addEventListener("pagehide", function () {
        popup = null; popupOuvert = false;
        appliquer(); rendre(); rafraichirMenu();
      });
      popupOuvert = true; popupNotice = "";
      rendrePopup(); rafraichirMenu();
    }).catch(function () {
      popupNotice = "Popup externo nao esta disponivel neste navegador.";
      rafraichirMenu();
    });
  }

  /* ============================ menu d'options (Bn/Di) ============================ */
  function el(tag, attrs, texte) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") n.className = attrs[k];
      else if (k === "checked") n.checked = !!attrs[k];
      else if (k.indexOf("on") === 0 && typeof attrs[k] === "function")
        n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    if (texte != null) n.textContent = texte;
    return n;
  }
  function sectionMenu(titre) {
    var s = el("section", { class: "tro-qm-section" });
    s.appendChild(el("h4", null, titre));
    return s;
  }
  function champNumerique(label, valeur, min, max, pas, surChangement, suffixe) {
    var f = el("div", { class: "tro-qm-field" });
    f.appendChild(el("label", null, label + (suffixe || "")));
    var i = el("input", { type: "number", min: String(min), max: String(max),
      step: String(pas == null ? 1 : pas), value: String(valeur) });
    i.addEventListener("change", function () {
      surChangement(parseFloat(i.value) || 0);
    });
    f.appendChild(i);
    return f;
  }
  function champSelect(label, valeur, options, surChangement) {
    var f = el("div", { class: "tro-qm-field" });
    f.appendChild(el("label", null, label));
    var s = el("select");
    options.forEach(function (o) {
      var opt = el("option", { value: o[1] }, o[0]);
      if (o[1] === valeur) opt.selected = true;
      s.appendChild(opt);
    });
    s.addEventListener("change", function () { surChangement(s.value); });
    f.appendChild(s);
    return f;
  }
  function champBascule(label, coche, surChangement) {
    var l = el("label", { class: "tro-qm-toggle" });
    var i = el("input", { type: "checkbox" });
    i.checked = !!coche;
    i.addEventListener("change", function () { surChangement(i.checked); });
    l.appendChild(i);
    l.appendChild(el("span", null, label));
    return l;
  }
  function champCouleur(label, couleur, alpha, surCouleur, surAlpha) {
    var f = el("div", { class: "tro-qm-field" });
    f.appendChild(el("label", null, label));
    var rangee = el("div", null);
    rangee.style.cssText = "display:flex;gap:6px;align-items:center";
    var c = el("input", { type: "color", value: hexValide(couleur) });
    c.style.cssText = "width:34px;height:26px;padding:0;border:1px solid #303850;border-radius:6px;background:#0b0e15";
    c.addEventListener("input", function () { surCouleur(c.value); });
    var a = el("input", { type: "range", min: "0", max: "1", step: "0.05", value: String(alpha) });
    a.style.cssText = "flex:1;accent-color:#ffb020";
    a.addEventListener("input", function () { surAlpha(parseFloat(a.value)); });
    rangee.appendChild(c); rangee.appendChild(a);
    f.appendChild(rangee);
    return f;
  }
  function boutonAction(texte, surClic) {
    return el("button", { class: "tro-qm-btn", type: "button", onclick: surClic }, texte);
  }
  function construireMenu(x, y) {
    var m = el("section", { class: "tro-quick-menu", role: "dialog",
      "aria-label": "Cronômetro" });
    /* tête */
    var tete = el("div", { class: "tro-qm-head" });
    tete.appendChild(el("strong", null, "Cronômetro"));
    tete.appendChild(el("button", { type: "button", "aria-label": "Fechar menu",
      onclick: function () { fermerMenu(); } }, "✕"));
    m.appendChild(tete);

    /* Ações */
    var a = sectionMenu("Ações");
    var r1 = el("div", { class: "tro-qm-row" });
    r1.appendChild(boutonAction("Iniciar / Split", function () { demarrerOuSplit(); rafraichirMenu(); }));
    r1.appendChild(boutonAction("Resetar", function () { reinitialiser(); rafraichirMenu(); }));
    a.appendChild(r1);
    var r2 = el("div", { class: "tro-qm-row" });
    r2.appendChild(boutonAction(popup ? "Focar popup" : "Abrir popup", ouvrirPopup));
    r2.appendChild(boutonAction("Fechar popup", function () { fermerPopup(); rafraichirMenu(); }));
    a.appendChild(r2);
    if (popupNotice) a.appendChild(el("p", { class: "tro-qm-note" }, popupNotice));
    m.appendChild(a);

    /* Básico */
    var b = sectionMenu("Básico");
    b.appendChild(champBascule("Clique alterna", reglages.behavior.clickToggles,
      function (v) { patchSection("behavior", { clickToggles: v }); }));
    b.appendChild(champBascule("Touch inicia/reseta", reglages.behavior.touchStartReset,
      function (v) { patchSection("behavior", { touchStartReset: v }); }));
    b.appendChild(champBascule("Atalhos de teclado", reglages.hotkeys.keyboardShortcuts,
      function (v) { patchSection("hotkeys", { keyboardShortcuts: v }); }));
    m.appendChild(b);

    /* Auto */
    var au = sectionMenu("Auto");
    au.appendChild(champBascule("Modo automático", reglages.automation.enabled,
      function (v) { patchSection("automation", { enabled: v }); majDrapeauPiece(); }));
    au.appendChild(champBascule("Iniciar partida", reglages.automation.startOnGameplay,
      function (v) { patchSection("automation", { startOnGameplay: v }); }));
    au.appendChild(champBascule("Pausar moeda", reglages.automation.pauseOnCoin,
      function (v) { patchSection("automation", { pauseOnCoin: v }); majDrapeauPiece(); }));
    au.appendChild(champBascule("Pausar morte", reglages.automation.pauseOnDeath,
      function (v) { patchSection("automation", { pauseOnDeath: v }); }));
    m.appendChild(au);

    /* Overlay */
    var ov = sectionMenu("Overlay");
    var g4 = el("div", { class: "tro-qm-grid4" });
    g4.appendChild(champNumerique("X", reglages.overlay.left, 0, 1e5, 1,
      function (v) { patchSection("overlay", { left: v }); }));
    g4.appendChild(champNumerique("Y", reglages.overlay.top, 0, 1e5, 1,
      function (v) { patchSection("overlay", { top: v }); }));
    g4.appendChild(champNumerique("Largura", reglages.timer.width, 50, 500, 1,
      function (v) { patchSection("timer", { width: v }); }));
    g4.appendChild(champNumerique("Altura", reglages.timer.height, 20, 150, 1,
      function (v) { patchSection("timer", { height: v }); }));
    ov.appendChild(g4);
    var g2a = el("div", { class: "tro-qm-grid2" });
    g2a.appendChild(champNumerique("Z Index", reglages.overlay.zIndex, 1, 2147483647, 1,
      function (v) { patchSection("overlay", { zIndex: v }); }));
    g2a.appendChild(champNumerique("Opacidade", reglages.layout.opacity, .1, 1, .01,
      function (v) { patchSection("layout", { opacity: v }); }));
    ov.appendChild(g2a);
    ov.appendChild(champBascule("Permitir redimensionar", reglages.overlay.allowResizing,
      function (v) { patchSection("overlay", { allowResizing: v }); }));
    ov.appendChild(champBascule("Mouse atravessa enquanto roda", reglages.overlay.passThroughWhileRunning,
      function (v) { patchSection("overlay", { passThroughWhileRunning: v }); }));
    m.appendChild(ov);

    /* Render */
    var re = sectionMenu("Render");
    var g3r = el("div", { class: "tro-qm-grid3" });
    g3r.appendChild(champSelect("Formato", reglages.timer.digitsFormat,
      [["1", "1"], ["00:01", "00:01"], ["0:00:01", "0:00:01"], ["00:00:01", "00:00:01"]],
      function (v) { patchSection("timer", { digitsFormat: v }); }));
    g3r.appendChild(champSelect("Precisão", reglages.timer.accuracy,
      [["—", ""], [".2", ".2"], [".23", ".23"], [".234", ".234"]],
      function (v) { patchSection("timer", { accuracy: v }); }));
    g3r.appendChild(champSelect("Fundo", reglages.timer.backgroundGradient,
      FONDS.map(function (f) { return [f, f]; }),
      function (v) { patchSection("timer", { backgroundGradient: v }); }));
    re.appendChild(g3r);
    var g2r = el("div", { class: "tro-qm-grid2" });
    g2r.appendChild(champNumerique("Decimais", reglages.timer.decimalsSize, 10, 50, 1,
      function (v) { patchSection("timer", { decimalsSize: v }); }));
    g2r.appendChild(champNumerique("Deslocamento vertical", reglages.layout.verticalNudge, -20, 20, .5,
      function (v) { patchSection("layout", { verticalNudge: v }); }));
    re.appendChild(g2r);
    re.appendChild(champBascule("Centralizar", reglages.timer.centerTimer,
      function (v) { patchSection("timer", { centerTimer: v }); }));
    re.appendChild(champBascule("Gradiente no texto", reglages.timer.showGradient,
      function (v) { patchSection("timer", { showGradient: v }); }));
    re.appendChild(champBascule("Sobrescrever cor", reglages.timer.overrideSplitColors,
      function (v) { patchSection("timer", { overrideSplitColors: v }); }));
    m.appendChild(re);

    /* Aparência */
    var ap = sectionMenu("Aparência");
    var g3a = el("div", { class: "tro-qm-grid3" });
    var fPolice = el("div", { class: "tro-qm-field" });
    fPolice.appendChild(el("label", null, "Fonte"));
    var inPolice = el("input", { type: "text", value: reglages.layout.timerFontFamily });
    inPolice.addEventListener("change", function () {
      patchSection("layout", { timerFontFamily: inPolice.value });
    });
    fPolice.appendChild(inPolice);
    g3a.appendChild(fPolice);
    g3a.appendChild(champNumerique("Tamanho", reglages.layout.timerFontSize, 12, 120, .25,
      function (v) { patchSection("layout", { timerFontSize: v }); }));
    g3a.appendChild(champSelect("Peso", reglages.layout.timerFontWeight,
      POIDS.map(function (p) { return [p, p]; }),
      function (v) { patchSection("layout", { timerFontWeight: v }); }));
    ap.appendChild(g3a);
    ap.appendChild(champBascule("Sombras no texto", reglages.layout.dropShadows,
      function (v) { patchSection("layout", { dropShadows: v }); }));
    var gCouleurs = el("div", { class: "tro-qm-grid3" });
    gCouleurs.appendChild(champCouleur("Rodando", reglages.layout.aheadGainingTimeColor, reglages.layout.aheadGainingTimeAlpha,
      function (v) { patchSection("layout", { aheadGainingTimeColor: v }); },
      function (v) { patchSection("layout", { aheadGainingTimeAlpha: v }); }));
    gCouleurs.appendChild(champCouleur("Parado", reglages.layout.notRunningColor, reglages.layout.notRunningAlpha,
      function (v) { patchSection("layout", { notRunningColor: v }); },
      function (v) { patchSection("layout", { notRunningAlpha: v }); }));
    gCouleurs.appendChild(champCouleur("Pausado", reglages.layout.pausedColor, reglages.layout.pausedAlpha,
      function (v) { patchSection("layout", { pausedColor: v }); },
      function (v) { patchSection("layout", { pausedAlpha: v }); }));
    gCouleurs.appendChild(champCouleur("Finalizado", reglages.layout.personalBestColor, reglages.layout.personalBestAlpha,
      function (v) { patchSection("layout", { personalBestColor: v }); },
      function (v) { patchSection("layout", { personalBestAlpha: v }); }));
    gCouleurs.appendChild(champCouleur("Fundo janela", reglages.layout.windowBackgroundColor, reglages.layout.windowBackgroundAlpha,
      function (v) { patchSection("layout", { windowBackgroundColor: v }); },
      function (v) { patchSection("layout", { windowBackgroundAlpha: v }); }));
    gCouleurs.appendChild(champCouleur("Sombra", reglages.layout.shadowColor, reglages.layout.shadowAlpha,
      function (v) { patchSection("layout", { shadowColor: v }); },
      function (v) { patchSection("layout", { shadowAlpha: v }); }));
    ap.appendChild(gCouleurs);
    m.appendChild(ap);

    /* Atalhos */
    var at = sectionMenu("Atalhos");
    var g2t = el("div", { class: "tro-qm-grid2" });
    g2t.appendChild(champNumerique("Atraso", reglages.hotkeys.hotkeyDelay, 0, 60, .25,
      function (v) { patchSection("hotkeys", { hotkeyDelay: v }); }, " (s)"));
    g2t.appendChild(champBascule("Prevenir toque duplo", reglages.hotkeys.doubleTapPrevention,
      function (v) { patchSection("hotkeys", { doubleTapPrevention: v }); }));
    at.appendChild(g2t);
    TOUCHES_DEFS.forEach(function (def) {
      var rangee = el("div", { class: "tro-qm-key-row" + (toucheEcoute === def.id ? " is-listening" : "") });
      rangee.appendChild(el("span", { class: "settings-key-label", style: "font-size:12px;color:#97a0b4" }, def.label));
      var btn = el("button", { class: "tro-qm-btn tro-qm-key-btn", type: "button",
        "aria-label": "Mapear " + def.label });
      if (toucheEcoute === def.id) btn.textContent = "Pressione uma tecla...";
      else {
        var kbd = el("kbd", { class: "tro-qm-kbd" }, libCombinaise(reglages.hotkeys[def.id]));
        btn.appendChild(kbd);
      }
      btn.addEventListener("click", function () { toucheEcoute = def.id; rafraichirMenu(); });
      rangee.appendChild(btn);
      var effacer = el("button", { class: "tro-qm-btn", type: "button",
        "aria-label": "Limpar " + def.label }, "✕");
      effacer.addEventListener("click", function () {
        var p = {}; p[def.id] = null;
        patchSection("hotkeys", p); rafraichirMenu();
      });
      rangee.appendChild(effacer);
      at.appendChild(rangee);
    });
    m.appendChild(at);

    m.appendChild(boutonAction("Resetar posição", function () {
      patchSection("overlay", { left: 16, top: 16 });
      fermerMenu();
    }));
    return m;
  }
  function rafraichirMenu() {
    if (!menuEl || !menuAncrage) return;
    var x = menuAncrage.x, y = menuAncrage.y;
    var ecoute = toucheEcoute;
    fermerMenu(false);        /* reconstruction : la capture en cours est conservée */
    toucheEcoute = ecoute;
    ouvrirMenu(x, y);
  }
  function ouvrirMenu(x, y) {
    fermerMenu(false);
    menuAncrage = { x: x, y: y };
    menuEl = construireMenu(x, y);
    document.body.appendChild(menuEl);
    var largeur = Math.min(440, Math.max(300, window.innerWidth - 16));
    menuEl.style.width = largeur + "px";
    var mx = bornInt(borne(x + 12, 8, Math.max(8, window.innerWidth - largeur - 8)), 0, 1e6);
    var my = bornInt(borne(y + 12, 8, Math.max(8, window.innerHeight - 80)), 0, 1e6);
    menuEl.style.left = mx + "px";
    menuEl.style.top = my + "px";
    document.addEventListener("pointerdown", fermerMenuSiDehors, true);
    document.addEventListener("keydown", fermerMenuSiEscape, true);
  }
  function fermerMenuSiDehors(e) {
    if (menuEl && menuEl.contains(e.target)) return;
    fermerMenu();
  }
  function fermerMenuSiEscape(e) {
    if (e.key === "Escape" && !toucheEcoute) fermerMenu();
  }
  function fermerMenu(effacerEcoute) {
    if (menuEl && menuEl.parentNode) menuEl.parentNode.removeChild(menuEl);
    menuEl = null; menuAncrage = null;
    if (effacerEcoute !== false) toucheEcoute = null;
    document.removeEventListener("pointerdown", fermerMenuSiDehors, true);
    document.removeEventListener("keydown", fermerMenuSiEscape, true);
  }

  /* ============================ démarrage ============================ */
  document.body.appendChild(overlay);
  rafraichir();
  majDrapeauPiece();
  window.addEventListener("pagehide", function () {
    arreterBoucle();
    minuteursRetard.forEach(window.clearTimeout);
    minuteursRetard = [];
    if (popup && popup.window && !popup.window.closed) {
      try { popup.window.close(); } catch (e) {}
    }
    popup = null;
  });
  /* la vue jeu du miroir peut apparaître après le chargement : réévaluer l'affichage */
  setInterval(function () {
    var actifAvant = overlay.style.display !== "none";
    if (actifAvant !== overlayActif()) { appliquer(); rendre(); }
    if (etat.phase === "Running" && !rafId) lancerBoucle();
  }, 500);
})();
