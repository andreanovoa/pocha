/* Pocha — cuentas y partidas guardadas en Firebase. */
/* Pocha — accounts and saved games on Firebase. */
(function () {
  'use strict';

  var SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
  var EMAIL_KEY = 'pocha:emailForSignIn';
  var config = window.POCHA_FIREBASE;
  var enabled = !!(config && config.apiKey && config.projectId);

  var listeners = [];
  var state = { ready: !enabled, user: null, error: null };
  var auth = null;
  var db = null;
  var booting = null;

  function emit() {
    listeners.forEach(function (fn) { try { fn(state); } catch (e) { /* sigue / carry on */ } });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function remember(key, value) {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch (e) { /* modo privado */ }
  }

  function recall(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  function here() {
    return window.location.origin + window.location.pathname;
  }

  // termina el inicio de sesión cuando se vuelve desde el enlace del correo
  // completes the sign-in when coming back from the email link
  function finishEmailLink() {
    var href = window.location.href;
    if (!auth.isSignInWithEmailLink(href)) return Promise.resolve();
    var email = recall(EMAIL_KEY) || window.prompt('Email');
    if (!email) return Promise.resolve();
    return auth.signInWithEmailLink(email, href).then(function () {
      remember(EMAIL_KEY, null);
    }).catch(function (err) {
      state.error = err.code || 'auth/error';
    }).then(function () {
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      }
    });
  }

  function boot() {
    if (!enabled) return Promise.resolve();
    if (booting) return booting;
    booting = loadScript(SDK + 'firebase-app-compat.js')
      .then(function () {
        return Promise.all([
          loadScript(SDK + 'firebase-auth-compat.js'),
          loadScript(SDK + 'firebase-firestore-compat.js')
        ]);
      })
      .then(function () {
        var app = window.firebase.initializeApp(config);
        auth = app.auth();
        db = app.firestore();
        return finishEmailLink();
      })
      .then(function () {
        // errores al volver de la página de Google / errors on coming back from Google's page
        return auth.getRedirectResult().catch(function (err) {
          state.error = err.code || 'auth/error';
        });
      })
      .then(function () {
        auth.onAuthStateChanged(function (user) {
          state.user = user ? {
            uid: user.uid,
            name: user.displayName || '',
            email: user.email || ''
          } : null;
          state.ready = true;
          emit();
        });
      })
      .catch(function (err) {
        state.ready = true;
        state.error = 'cloud/unavailable';
        emit();
        throw err;
      });
    return booting;
  }

  function games() {
    if (!state.user) return Promise.reject(new Error('auth/required'));
    return db.collection('users').doc(state.user.uid).collection('games');
  }

  window.PochaCloud = {
    enabled: enabled,
    state: function () { return state; },

    onChange: function (fn) {
      listeners.push(fn);
      boot().catch(function () { /* ya avisado / already reported */ });
    },

    // la app instalada va a la página de Google y vuelve; el navegador usa una ventana
    // the installed app goes to Google's page and back; the browser uses a pop-up
    signInGoogle: function (useRedirect) {
      var provider = new window.firebase.auth.GoogleAuthProvider();
      if (useRedirect) return auth.signInWithRedirect(provider);
      return auth.signInWithPopup(provider).catch(function (err) {
        if (err && err.code === 'auth/popup-blocked') return auth.signInWithRedirect(provider);
        throw err;
      });
    },

    sendEmailLink: function (email) {
      return auth.sendSignInLinkToEmail(email, { url: here(), handleCodeInApp: true })
        .then(function () { remember(EMAIL_KEY, email); });
    },

    signOut: function () { return auth.signOut(); },

    // el id de la partida hace que volver a guardarla la sobrescriba en vez de duplicarla
    // the game id makes saving it again overwrite it instead of duplicating it
    saveGame: function (id, data) {
      return Promise.resolve(games()).then(function (col) {
        var doc = Object.assign({}, data, { savedAt: window.firebase.firestore.FieldValue.serverTimestamp() });
        return col.doc(id).set(doc);
      });
    },

    listGames: function () {
      return Promise.resolve(games()).then(function (col) {
        return col.orderBy('startedAt', 'desc').limit(500).get();
      }).then(function (snap) {
        return snap.docs.map(function (d) {
          var data = d.data();
          data.id = d.id;
          return data;
        });
      });
    },

    deleteGame: function (id) {
      return Promise.resolve(games()).then(function (col) { return col.doc(id).delete(); });
    }
  };
})();
