(function () {
  'use strict';

  function noop() {}
  function resolved(value) {
    return Promise.resolve(value);
  }

  const fallbackSdk = {
    init: function () { return resolved(); },
    commercialBreak: function () { return resolved(); },
    rewardedBreak: function () { return resolved({ completed: true }); },
    customEvent: noop,
    destroyAd: noop,
    displayAd: noop,
    gameInteractive: noop,
    gameLoadingFinished: noop,
    gameLoadingProgress: noop,
    gameLoadingStart: noop,
    gameplayStart: noop,
    gameplayStop: noop,
    happyTime: noop,
    roundEnd: noop,
    roundStart: noop,
    sendHighscore: noop,
    setDebug: noop,
    setPlayerAge: noop,
    togglePlayerAdvertisingConsent: noop,
    toggleNonPersonalized: noop
  };

  window.PokiSDK = Object.assign({}, fallbackSdk, window.PokiSDK || {});
  window.pokiReady = true;
  window.pokiAdBlock = false;
  window.__moscowBridgeEvents = window.__moscowBridgeEvents || [];

  function record(type, detail) {
    window.__moscowBridgeEvents.push({
      type,
      detail: detail || null,
      time: Date.now()
    });
    try {
      document.documentElement.dataset.moscowBridgeInstalled = 'true';
      document.documentElement.dataset.moscowBridgeLastEvent = type;
      document.documentElement.dataset.moscowBridgeEventCount = String(window.__moscowBridgeEvents.length);
      if (detail && detail.objectName) document.documentElement.dataset.moscowPokiObject = String(detail.objectName);
    } catch (_) {}
  }

  record('bridge-installed');

  function sendUnityMessage(method, value) {
    const target = window.__pokiUnityObjectName || window.pokiBridge;
    const game = window.unityGame || window.__unityInstance || window.gameInstance;
    if (!target || !game || typeof game.SendMessage !== 'function') return false;

    try {
      if (typeof value === 'undefined') {
        game.SendMessage(target, method);
      } else {
        game.SendMessage(target, method, value);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function keepSendingReady(attempt) {
    if (sendUnityMessage('ready')) return;
    if (!window.__pokiUnityObjectName || attempt > 140) return;

    window.setTimeout(function () {
      keepSendingReady(attempt + 1);
    }, 50);
  }

  window.initPokiBridge = function (objectName) {
    record('initPokiBridge', { objectName: objectName });
    window.__pokiUnityObjectName = objectName;
    window.pokiBridge = objectName;
    keepSendingReady(0);
    return window.PokiSDK;
  };

  window.commercialBreak = function () {
    record('commercialBreak');
    return Promise.resolve(window.PokiSDK.commercialBreak()).then(function () {
      sendUnityMessage('commercialBreakCompleted');
      window.PokiSDK.gameplayStart();
    });
  };

  window.rewardedBreak = function () {
    record('rewardedBreak');
    return Promise.resolve(window.PokiSDK.rewardedBreak()).then(function (result) {
      const completed = result === true || (result && result.completed === true);
      sendUnityMessage('rewardedBreakCompleted', String(completed));
      return completed;
    });
  };

  window.my4399UnityModule = function (moduleConfig) {
    record('my4399UnityModule');
    if (typeof window.UnityModule === 'function') return window.UnityModule(moduleConfig);
    if (typeof window.Module === 'function') return window.Module(moduleConfig);
    throw new Error('Unity framework loaded, but no UnityModule/Module factory was exposed.');
  };

  window.__blockUnityExternalOpenURL = function (url) {
    try {
      return new URL(url, window.location.href).origin !== window.location.origin;
    } catch (_) {
      return true;
    }
  };

  window.__blockUnityExternalEval = function (code) {
    const value = String(code || '').toLowerCase();
    return value.includes('debugger') ||
      value.includes('sitelock') ||
      value.includes('poki.com') ||
      value.includes('game-cdn.poki.com') ||
      value.includes('po.ki/sitelockredirect') ||
      value.includes('games.poki.com/458768/crossyroad') ||
      value.includes('ahr0cdovl3bvlmtpl3npdgvsb2nrcmvkaxjly3q') ||
      value.includes('top.location') ||
      value.includes('window.location') ||
      value.includes('location.href');
  };

  window.__handleUnityEvalJS = function (code) {
    const source = String(code || '');

    if (window.__blockUnityExternalEval(source)) {
      record('blocked-eval');
      return;
    }

    try {
      // Moscow uses Unity ExternalEval for the Poki bridge bootstrap.
      // Keep that path alive, while the domain-lock script above is filtered out.
      return (0, eval)(source);
    } catch (error) {
      record('eval-error', { message: String(error && error.message || error) });
    }
  };
})();
