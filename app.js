/* Pocha — marcador bilingüe. Estado, reglas de puntuación e interfaz. */
/* Pocha — bilingual scoreboard. State, scoring rules and interface. */
(function () {
  'use strict';

  var DECK = 40;
  var LS = {
    roster: 'pocha:roster',
    lineup: 'pocha:lineup',
    game: 'pocha:game',
    sheet: 'pocha:sheetUrl',
    lang: 'pocha:lang'
  };

  /* ---------- almacenamiento local ---------- */

  function load(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function save(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* modo privado */ }
  }

  function drop(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* modo privado */ }
  }

  function rememberNames(names) {
    var roster = load(LS.roster, []);
    names.forEach(function (n) {
      if (n && roster.indexOf(n) === -1) roster.push(n);
    });
    save(LS.roster, roster.slice(-40));
  }

  /* ---------- idioma / language ---------- */

  var DICT = window.POCHA_I18N;

  function preferredLang() {
    var stored = load(LS.lang, null);
    return stored === 'en' ? 'en' : 'es';
  }

  var lang = preferredLang();

  function t(key) {
    var value = DICT[lang][key];
    if (typeof value !== 'function') return value;
    return value.apply(null, Array.prototype.slice.call(arguments, 1));
  }

  var HASHES = { docs: '#reglas', table: '#tabla', stats: '#estadisticas' };

  function viewOf(hash) {
    for (var name in HASHES) {
      if (HASHES[name] === hash) return name;
    }
    return 'game';
  }

  function hrefOf(name) {
    return HASHES[name] || window.location.pathname;
  }

  var view = viewOf(window.location.hash);

  function setView(next) {
    if (next === view) return;
    rememberSetup();
    view = next;
    if (window.history && window.history.pushState) {
      window.history.pushState(null, '', hrefOf(next));
    } else {
      window.location.hash = HASHES[next] || '';
    }
    render();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  window.addEventListener('hashchange', function () {
    var next = viewOf(window.location.hash);
    if (next === view) return;
    rememberSetup();
    view = next;
    render();
  });

  var captureSetup = null; // devuelto por la pantalla de configuración / set by the setup screen

  // guarda lo escrito antes de rehacer la página / keeps what is typed before the page is rebuilt
  function rememberSetup() {
    if (captureSetup) save(LS.lineup, captureSetup());
  }

  function setLang(next) {
    if (next === lang) return;
    rememberSetup();
    lang = next;
    save(LS.lang, lang);
    document.documentElement.lang = lang;
    render();
  }

  /* ---------- reglas del juego ---------- */

  function buildRounds(numPlayers, repeatMiddle) {
    var maxCards = Math.floor(DECK / numPlayers);
    var rounds = [];
    var i;
    for (i = 1; i <= maxCards; i++) rounds.push(i);
    var repeats = repeatMiddle ? (numPlayers - 1) * numPlayers : numPlayers - 1;
    for (i = 0; i < repeats; i++) rounds.push(maxCards);
    for (i = maxCards - 1; i >= 1; i--) rounds.push(i);
    return rounds;
  }

  function points(bid, won) {
    return bid === won ? 10 + 5 * bid : -5 * Math.abs(bid - won);
  }

  function dealerOf(game, roundIdx) {
    return (game.firstDealer + roundIdx) % game.players.length;
  }

  function totalsAfter(game, roundCount) {
    var totals = game.players.map(function () { return 0; });
    for (var r = 0; r < roundCount && r < game.results.length; r++) {
      var res = game.results[r];
      for (var p = 0; p < game.players.length; p++) {
        totals[p] += points(res.bids[p], res.won[p]);
      }
    }
    return totals;
  }

  function ranking(game) {
    var played = game.results.length;
    var totals = totalsAfter(game, played);
    var last = played ? game.results[played - 1] : null;
    return game.players
      .map(function (name, i) {
        var hits = 0;
        game.results.forEach(function (res) { if (res.bids[i] === res.won[i]) hits += 1; });
        return {
          name: name,
          index: i,
          total: totals[i],
          hits: hits,
          played: played,
          last: last ? points(last.bids[i], last.won[i]) : null
        };
      })
      .sort(function (a, b) { return b.total - a.total || b.hits - a.hits; });
  }

  /* ---------- utilidades ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /* ---------- estado de la aplicación ---------- */

  var root = document.getElementById('pocha-app');
  if (!root) return;

  var game = load(LS.game, null);
  var draft = null; // { bids: [], won: [] } de la ronda en curso

  function newId() {
    var bytes = new Uint8Array(10);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  // las partidas de antes de las cuentas no tenían id / games from before accounts had no id
  if (game && game.players && !game.id) { game.id = newId(); save(LS.game, game); }

  function newDraft() {
    return {
      bids: game.players.map(function () { return null; }),
      won: game.players.map(function () { return null; })
    };
  }

  function persist() { save(LS.game, game); }

  /* ---------- pantalla de configuración ---------- */

  function renderSetup() {
    var lineup = load(LS.lineup, { players: ['', '', '', ''], firstDealer: 0, repeatMiddle: false });
    var names = (lineup.players || []).slice();
    while (names.length < 3) names.push('');

    var card = el('section', 'card');
    card.appendChild(el('h2', 'card-title', t('newGame')));

    var topRow = el('div', 'row');

    var countField = el('div', 'field');
    countField.appendChild(el('label', null, t('playersLabel')));
    var countInput = el('input');
    countInput.type = 'number';
    countInput.min = '3';
    countInput.max = '10';
    countInput.value = String(names.length);
    countField.appendChild(countInput);
    topRow.appendChild(countField);

    var dealerField = el('div', 'field');
    dealerField.appendChild(el('label', null, t('dealsFirst')));
    var dealerPick = el('div', 'dealer-pick');
    var dealerSelect = el('select');
    dealerPick.appendChild(dealerSelect);
    var diceBtn = el('button', 'dice', '\uD83C\uDFB2');
    diceBtn.type = 'button';
    diceBtn.title = t('drawDealer');
    diceBtn.setAttribute('aria-label', t('drawDealer'));
    dealerPick.appendChild(diceBtn);
    dealerField.appendChild(dealerPick);
    topRow.appendChild(dealerField);

    var switchLabel = el('label', 'switch');
    var repeatInput = el('input');
    repeatInput.type = 'checkbox';
    repeatInput.checked = !!lineup.repeatMiddle;
    switchLabel.appendChild(repeatInput);
    switchLabel.appendChild(el('span', null, t('repeatLong')));
    topRow.appendChild(switchLabel);

    card.appendChild(topRow);

    var seatHint = el('p', 'hint seat-hint', t('seatHint'));
    seatHint.style.marginTop = '1rem';
    card.appendChild(seatHint);

    var playersBox = el('div', 'players');
    playersBox.style.marginTop = '0.6rem';
    card.appendChild(playersBox);

    var datalist = el('datalist');
    datalist.id = 'pocha-roster';
    load(LS.roster, []).forEach(function (n) {
      var opt = el('option');
      opt.value = n;
      datalist.appendChild(opt);
    });
    card.appendChild(datalist);

    var roster = load(LS.roster, []);
    if (roster.length) {
      card.appendChild(el('p', 'hint', t('rosterHint')));
      var rosterBox = el('div', 'roster');
      roster.forEach(function (n) {
        var b = el('button', null, n);
        b.type = 'button';
        b.addEventListener('click', function () {
          var slots = playersBox.querySelectorAll('input');
          for (var i = 0; i < slots.length; i++) {
            if (!slots[i].value.trim()) {
              slots[i].value = n;
              typed[i] = n;
              syncDealer();
              return;
            }
          }
        });
        rosterBox.appendChild(b);
      });
      card.appendChild(rosterBox);
    }

    var seatOrder = el('p', 'seat-order');
    card.appendChild(seatOrder);

    var preview = el('p', 'hint');
    card.appendChild(preview);

    var actions = el('div', 'actions');
    var startBtn = el('button', 'primary', t('start'));
    startBtn.type = 'button';
    actions.appendChild(startBtn);
    var forgetBtn = el('button', 'ghost', t('forget'));
    forgetBtn.type = 'button';
    forgetBtn.addEventListener('click', function () {
      if (window.confirm(t('confirmForget'))) {
        drop(LS.roster);
        render();
      }
    });
    actions.appendChild(forgetBtn);
    card.appendChild(actions);

    root.appendChild(card);

    captureSetup = function () {
      return {
        players: currentNamesRaw(),
        firstDealer: parseInt(dealerSelect.value, 10) || 0,
        repeatMiddle: repeatInput.checked
      };
    };

    // los nombres viven aquí, no en el DOM, para que no se pierdan al rehacer los huecos
    // the names live here, not in the DOM, so that rebuilding the seats does not lose them
    var typed = names.slice();

    function currentNamesRaw() {
      return typed.slice(0, seatCount()).map(function (name) { return (name || '').trim(); });
    }

    function seatCount() {
      var n = parseInt(countInput.value, 10);
      if (isNaN(n)) return typed.length;
      return Math.max(3, Math.min(10, n));
    }

    function currentNames() {
      var out = [];
      var seats = seatCount();
      for (var i = 0; i < seats; i++) {
        out.push((typed[i] || '').trim() || t('playerN', i + 1));
      }
      return out;
    }

    function syncDealer() {
      var chosen = dealerSelect.value;
      clear(dealerSelect);
      currentNames().forEach(function (n, i) {
        var opt = el('option', null, n);
        opt.value = String(i);
        dealerSelect.appendChild(opt);
      });
      dealerSelect.value = chosen !== '' && Number(chosen) < currentNames().length ? chosen : '0';
      syncPreview();
    }

    function syncPreview() {
      var names = currentNames();
      var n = names.length;
      clear(seatOrder);
      seatOrder.appendChild(el('span', 'seat-label', t('seatLabel')));
      names.forEach(function (name, i) {
        if (i > 0) seatOrder.appendChild(el('span', 'seat-arrow', '\u2192'));
        seatOrder.appendChild(el('span', 'seat-name', name));
      });
      seatOrder.appendChild(el('span', 'seat-arrow', '\u21A9'));

      var rounds = buildRounds(n, repeatInput.checked);
      var maxCards = Math.floor(DECK / n);
      preview.textContent = t('preview', n, maxCards, rounds.length);
    }

    function syncSlots() {
      var n = seatCount();
      while (typed.length < n) typed.push('');
      if (playersBox.children.length === n) { syncDealer(); return; }
      clear(playersBox);
      for (var i = 0; i < n; i++) {
        playersBox.appendChild(seatSlot(i));
      }
      syncDealer();
    }

    function seatSlot(i) {
      var slot = el('div', 'player-slot');
      slot.appendChild(el('span', 'idx', String(i + 1)));
      var input = el('input');
      input.type = 'text';
      input.setAttribute('list', 'pocha-roster');
      input.placeholder = t('playerN', i + 1);
      input.value = typed[i] || '';
      input.autocomplete = 'off';
      input.addEventListener('input', function () {
        typed[i] = input.value;
        syncDealer();
      });
      slot.appendChild(input);
      return slot;
    }

    function randomIndex(n) {
      var crypto = window.crypto || window.msCrypto;
      if (crypto && crypto.getRandomValues) {
        var limit = Math.floor(4294967296 / n) * n;
        var buf = new Uint32Array(1);
        do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
        return buf[0] % n;
      }
      return Math.floor(Math.random() * n);
    }

    function drawDealer() {
      var n = currentNames().length;
      var winner = randomIndex(n);
      var rolls = n * 2 + winner;
      var step = 0;
      diceBtn.disabled = true;
      diceBtn.classList.add('rolling');
      (function tick() {
        dealerSelect.value = String(step % n);
        step += 1;
        if (step <= rolls) {
          window.setTimeout(tick, 60 + 12 * step);
        } else {
          dealerSelect.value = String(winner);
          diceBtn.disabled = false;
          diceBtn.classList.remove('rolling');
          dealerField.classList.add('drawn');
          window.setTimeout(function () { dealerField.classList.remove('drawn'); }, 900);
        }
      })();
    }

    diceBtn.addEventListener('click', drawDealer);

    countInput.addEventListener('input', syncSlots);
    countInput.addEventListener('change', function () {
      countInput.value = String(seatCount());
      syncSlots();
    });
    repeatInput.addEventListener('change', syncPreview);
    syncSlots();
    dealerSelect.value = String(Math.min(lineup.firstDealer || 0, names.length - 1));

    startBtn.addEventListener('click', function () {
      var players = currentNames();
      var firstDealer = parseInt(dealerSelect.value, 10) || 0;
      rememberNames(players);
      save(LS.lineup, { players: players, firstDealer: firstDealer, repeatMiddle: repeatInput.checked });
      game = {
        players: players,
        firstDealer: firstDealer,
        repeatMiddle: repeatInput.checked,
        rounds: buildRounds(players.length, repeatInput.checked),
        results: [],
        startedAt: new Date().toISOString(),
        id: newId()
      };
      draft = newDraft();
      persist();
      render();
    });
  }

  /* ---------- pantalla de partida ---------- */

  function renderGame() {
    captureSetup = null;
    var roundIdx = game.results.length;
    var finished = roundIdx >= game.rounds.length;
    if (!draft) draft = newDraft();

    // en pantallas anchas la ronda y el marcador van lado a lado / side by side on wide screens
    var grid = el('div', 'game-grid');
    grid.appendChild(finished ? winnerCard() : roundCard(roundIdx));
    grid.appendChild(standingsCard());
    root.appendChild(grid);
    root.appendChild(historyCard());
    root.appendChild(exportCard(finished));
  }

  function roundCard(roundIdx) {
    var cards = game.rounds[roundIdx];
    var dealer = dealerOf(game, roundIdx);
    var card = el('section', 'card');

    var head = el('div', 'round-head');
    head.appendChild(el('span', 'big', t('roundOf', roundIdx + 1, game.rounds.length)));
    head.appendChild(el('span', 'meta', t('cardsEach', cards)));
    head.appendChild(el('span', 'chip dealer', t('dealsChip', game.players[dealer])));
    head.appendChild(el('span', 'meta', t('rowOrder')));
    card.appendChild(head);

    var header = el('div', 'bids-head');
    header.appendChild(el('span', null, t('colPlayer')));
    header.appendChild(el('span', null, t('colBid')));
    header.appendChild(el('span', null, t('colTricks')));
    card.appendChild(header);

    var box = el('div', 'bids');
    var order = [];
    for (var k = 1; k <= game.players.length; k++) order.push((dealer + k) % game.players.length);

    order.forEach(function (p) {
      var row = el('div', 'bid-row' + (p === dealer ? ' is-dealer' : ''));
      row.appendChild(el('div', 'who', game.players[p]));
      row.appendChild(numberInput(cards, draft.bids, p));
      row.appendChild(numberInput(cards, draft.won, p));
      box.appendChild(row);
    });
    card.appendChild(box);

    var tally = el('p', 'tally');
    card.appendChild(tally);

    var alert = el('div', 'round-alert');
    alert.style.display = 'none';
    card.appendChild(alert);

    var actions = el('div', 'actions');
    var confirmBtn = el('button', 'primary', t('saveRound'));
    confirmBtn.type = 'button';
    actions.appendChild(confirmBtn);
    if (game.results.length > 0) {
      var undoBtn = el('button', 'ghost', t('undoRound'));
      undoBtn.type = 'button';
      undoBtn.addEventListener('click', function () {
        var last = game.results.pop();
        delete game.finishedAt;
        persist();
        draft = { bids: last.bids.slice(), won: last.won.slice() };
        render();
      });
      actions.appendChild(undoBtn);
    }
    card.appendChild(actions);

    function sum(list) {
      return list.reduce(function (a, b) { return a + (b || 0); }, 0);
    }

    function refresh() {
      var bidsDone = draft.bids.every(function (v) { return v !== null; });
      var wonDone = draft.won.every(function (v) { return v !== null; });
      var bidSum = sum(draft.bids);
      var wonSum = sum(draft.won);
      var counts = [];

      counts.push(bidsDone ? t('bidsSum', bidSum, cards) : t('bidsMissing'));
      if (wonDone) counts.push(t('tricksSum', wonSum, cards));
      tally.textContent = counts.join(' · ') + '.';

      // las apuestas sólo casan cuando está anotada la última / the bids can only match once the last one is in
      var bidsTie = bidsDone && bidSum === cards;
      var tricksOff = wonDone && wonSum !== cards;
      clear(alert);
      if (bidsTie) alert.appendChild(el('span', 'bad', t('bidsTie', cards)));
      if (tricksOff) alert.appendChild(el('span', 'warn', t('tricksCheck', wonSum, cards)));
      alert.style.display = bidsTie || tricksOff ? 'block' : 'none';

      tally.className = 'tally' + (bidsDone && wonDone && !bidsTie && !tricksOff ? ' ok' : '');
      // ni una ronda con las apuestas casadas ni unas bazas que no cuadran se guardan
      // neither matching bids nor tricks that do not add up are saved
      confirmBtn.disabled = !(bidsDone && wonDone) || bidsTie || tricksOff;
    }

    box.addEventListener('input', refresh);
    refresh();

    confirmBtn.addEventListener('click', function () {
      game.results.push({
        cards: cards,
        dealer: dealer,
        bids: draft.bids.slice(),
        won: draft.won.slice()
      });
      draft = newDraft();
      var done = game.results.length >= game.rounds.length;
      if (done) game.finishedAt = new Date().toISOString();
      persist();
      render();
      if (done && signedIn()) saveToCloud();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    return card;
  }

  function numberInput(max, store, index) {
    var wrap = el('span', 'stepper');
    var input = el('input');
    input.type = 'number';
    input.min = '0';
    input.max = String(max);
    input.inputMode = 'numeric';
    input.value = store[index] === null ? '' : String(store[index]);
    input.addEventListener('input', function () {
      if (input.value === '') { store[index] = null; return; }
      var v = parseInt(input.value, 10);
      if (isNaN(v)) { store[index] = null; return; }
      v = Math.max(0, Math.min(max, v));
      input.value = String(v);
      store[index] = v;
    });

    // botones − / + para tablets, donde teclear un número es más lento que tocar
    // − / + buttons for tablets, where typing a number is slower than tapping
    function step(delta) {
      var current = store[index] === null ? (delta > 0 ? -1 : 1) : store[index];
      input.value = String(Math.max(0, Math.min(max, current + delta)));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    [['\u2212', -1], ['+', 1]].forEach(function (pair, i) {
      var b = el('button', 'step', pair[0]);
      b.type = 'button';
      b.tabIndex = -1;
      b.setAttribute('aria-hidden', 'true');
      b.addEventListener('click', function () { step(pair[1]); });
      if (i === 0) wrap.appendChild(b);
      else { wrap.appendChild(input); wrap.appendChild(b); }
    });
    return wrap;
  }

  function standingsCard() {
    var card = el('section', 'card');
    card.appendChild(el('h2', 'card-title', t('standings')));
    var box = el('div', 'standings');
    var order = ranking(game);
    order.forEach(function (entry, i) {
      var item = el('div', 'standing' + (i === 0 && entry.played ? ' lead' : ''));

      var head = el('div', 'standing-head');
      head.appendChild(el('span', 'pos', (i + 1)));
      head.appendChild(el('span', 'nm', entry.name));
      if (entry.last !== null) {
        head.appendChild(el('span', 'delta ' + (entry.last >= 0 ? 'up' : 'down'),
          (entry.last > 0 ? '+' : '') + entry.last));
      }
      item.appendChild(head);

      var foot = el('div', 'standing-foot');
      var pts = el('span', 'pts');
      pts.appendChild(el('strong', null, String(entry.total)));
      pts.appendChild(el('span', 'pts-unit', t('pointsUnit')));
      foot.appendChild(pts);
      foot.appendChild(el('span', 'hits', t('hitsOf', entry.hits, entry.played)));
      item.appendChild(foot);

      box.appendChild(item);
    });
    card.appendChild(box);
    card.appendChild(el('p', 'hint', t('standingsLegend')));
    return card;
  }

  function historyCard() {
    var card = el('section', 'card');
    card.appendChild(el('h2', 'card-title', t('playedRounds')));

    if (!game.results.length) {
      card.appendChild(el('p', 'hint', t('noRounds')));
      var empty = el('div', 'actions');
      empty.appendChild(viewLink('button-link', t('fullTable'), 'table'));
      card.appendChild(empty);
      return card;
    }

    var wrap = el('div', 'table-wrap');
    var table = el('table');
    var thead = el('thead');
    var r1 = el('tr');
    var th = el('th', null, '#');
    th.rowSpan = 2;
    r1.appendChild(th);
    game.players.forEach(function (name) {
      var cell = el('th', 'group', name);
      cell.colSpan = 4;
      r1.appendChild(cell);
    });
    thead.appendChild(r1);
    var r2 = el('tr');
    game.players.forEach(function () {
      [t('shortBid'), t('shortTricks'), t('shortPoints'), t('shortTotal')].forEach(function (label, i) {
        r2.appendChild(el('th', i === 0 ? 'group' : null, label));
      });
    });
    thead.appendChild(r2);
    table.appendChild(thead);

    var tbody = el('tbody');
    var running = game.players.map(function () { return 0; });
    game.results.forEach(function (res, r) {
      var tr = el('tr');
      var dealer = res.dealer;
      var cardsCell = el('td', 'cards', String(res.cards));
      cardsCell.title = t('dealsChip', game.players[dealer]);
      tr.appendChild(cardsCell);
      game.players.forEach(function (name, p) {
        var pts = points(res.bids[p], res.won[p]);
        running[p] += pts;
        tr.appendChild(el('td', 'group' + (p === dealer ? ' deals' : ''), String(res.bids[p])));
        tr.appendChild(el('td', null, String(res.won[p])));
        tr.appendChild(el('td', pts >= 0 ? 'hit' : 'miss', (pts > 0 ? '+' : '') + pts));
        tr.appendChild(el('td', 'total', String(running[p])));
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    card.appendChild(wrap);
    card.appendChild(el('p', 'hint', t('tableLegend')));

    var actions = el('div', 'actions');
    actions.appendChild(viewLink('button-link', t('fullTable'), 'table'));
    card.appendChild(actions);
    return card;
  }

  function winnerCard() {
    var card = el('section', 'card winner');
    var order = ranking(game);
    card.appendChild(el('div', 'trophy', '🏆'));
    card.appendChild(el('div', 'nm', order[0].name));
    card.appendChild(el('p', 'hint', t('winsWith', order[0].total)));
    return card;
  }

  /* ---------- exportación y hoja de cálculo ---------- */

  function gamePayload() {
    var order = ranking(game);
    return {
      startedAt: game.startedAt,
      finishedAt: new Date().toISOString(),
      players: game.players,
      rounds: game.rounds.length,
      roundsPlayed: game.results.length,
      repeatMiddle: game.repeatMiddle,
      totals: totalsAfter(game, game.results.length),
      standings: order.map(function (e, i) {
        return { position: i + 1, name: e.name, total: e.total, won: i === 0 };
      }),
      results: game.results
    };
  }

  function toCsv() {
    var head = t('csvHeaders');
    var lines = [];
    lines.push([head.round, head.cards, head.deals].concat(game.players.map(function (n) {
      return [n + ' ' + head.bid, n + ' ' + head.tricks, n + ' ' + head.points, n + ' ' + head.total];
    }).reduce(function (a, b) { return a.concat(b); }, [])).join(','));
    var running = game.players.map(function () { return 0; });
    game.results.forEach(function (res, r) {
      var row = [r + 1, res.cards, game.players[res.dealer]];
      game.players.forEach(function (n, p) {
        var pts = points(res.bids[p], res.won[p]);
        running[p] += pts;
        row.push(res.bids[p], res.won[p], pts, running[p]);
      });
      lines.push(row.join(','));
    });
    lines.push([head.totalRow, '', ''].concat(game.players.map(function (n, p) {
      return ['', '', '', running[p]];
    }).reduce(function (a, b) { return a.concat(b); }, [])).join(','));
    return lines.join('\n');
  }

  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var a = el('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function stamp() {
    return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  }

  function exportCard(finished) {
    var card = el('section', 'card');
    card.appendChild(el('h2', 'card-title', t('saveShare')));

    var status = el('div', 'banner');
    status.style.display = 'none';
    card.appendChild(status);

    function report(text, tone) {
      status.className = 'banner' + (tone ? ' ' + tone : '');
      status.textContent = text;
      status.style.display = 'block';
    }

    var actions = el('div', 'actions');

    var csvBtn = el('button', null, t('downloadCsv'));
    csvBtn.type = 'button';
    csvBtn.disabled = !game.results.length;
    csvBtn.addEventListener('click', function () {
      download('pocha-' + stamp() + '.csv', toCsv(), 'text/csv;charset=utf-8');
    });
    actions.appendChild(csvBtn);

    var sheetBtn = el('button', finished ? 'primary' : '', t('sendSheets'));
    sheetBtn.type = 'button';
    sheetBtn.disabled = !game.results.length;
    actions.appendChild(sheetBtn);

    var newBtn = el('button', 'ghost', t('newGameBtn'));
    newBtn.type = 'button';
    newBtn.addEventListener('click', function () {
      if (game.results.length && !finished &&
          !window.confirm(t('confirmNew'))) return;
      drop(LS.game);
      game = null;
      draft = null;
      render();
    });
    actions.appendChild(newBtn);

    card.appendChild(actions);

    if (cloud.enabled) card.appendChild(cloudSaveRow());

    var details = el('details', 'sync');
    details.appendChild(el('summary', null, t('sheetsSection')));
    var field = el('div', 'field');
    field.style.marginTop = '0.6rem';
    field.appendChild(el('label', null, t('sheetsUrlLabel')));
    var urlInput = el('input');
    urlInput.type = 'url';
    urlInput.placeholder = 'https://script.google.com/macros/s/.../exec';
    urlInput.value = load(LS.sheet, '') || '';
    urlInput.addEventListener('change', function () { save(LS.sheet, urlInput.value.trim()); });
    field.appendChild(urlInput);
    details.appendChild(field);
    details.appendChild(el('p', 'hint', t('sheetsUrlHint')));
    card.appendChild(details);

    sheetBtn.addEventListener('click', function () {
      var url = (load(LS.sheet, '') || '').trim();
      if (!url) {
        details.open = true;
        urlInput.focus();
        report(t('sheetsNeedUrl'), 'bad');
        return;
      }
      sheetBtn.disabled = true;
      report(t('sheetsSending'));
      window.fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(gamePayload())
      }).then(function () {
        report(t('sheetsSent'), 'ok');
      }).catch(function () {
        report(t('sheetsFailed'), 'bad');
      }).then(function () {
        sheetBtn.disabled = false;
      });
    });

    return card;
  }

  /* ---------- cuentas y estadísticas / accounts and stats ---------- */

  var cloud = window.PochaCloud || { enabled: false };
  var account = cloud.enabled ? cloud.state() : { ready: true, user: null };
  var stats = { uid: null, status: 'idle', games: [], error: null };
  var saving = { status: 'idle', error: null }; // guardado de la partida en curso

  function signedIn() { return !!(cloud.enabled && account.user); }

  function refreshView() {
    rememberSetup();
    render();
  }

  function cloudPayload() {
    return {
      startedAt: game.startedAt || new Date().toISOString(),
      finishedAt: game.finishedAt || null,
      finished: game.results.length >= game.rounds.length,
      players: game.players,
      firstDealer: game.firstDealer,
      repeatMiddle: !!game.repeatMiddle,
      rounds: game.rounds,
      results: game.results
    };
  }

  function saveToCloud() {
    if (!signedIn() || !game || !game.results.length) return;
    var rounds = game.results.length;
    saving = { status: 'saving', error: null };
    refreshView();
    cloud.saveGame(game.id, cloudPayload()).then(function () {
      if (game && game.results.length === rounds) {
        game.cloudRounds = rounds;
        persist();
      }
      saving = { status: 'idle', error: null };
      stats.status = 'idle'; // la próxima visita a las estadísticas recarga / the next stats visit reloads
    }).catch(function (err) {
      saving = { status: 'failed', error: err && (err.code || err.message) };
    }).then(refreshView);
  }

  function cloudSaveRow() {
    var box = el('div', 'cloud-save');
    if (!account.ready) {
      box.appendChild(el('p', 'hint', t('connecting')));
      return box;
    }
    if (!account.user) {
      box.appendChild(el('p', 'hint', t('signInToSave')));
      var go = el('div', 'actions');
      go.appendChild(viewLink('button-link', t('goSignIn'), 'stats'));
      box.appendChild(go);
      return box;
    }
    var saved = game.cloudRounds === game.results.length && game.results.length > 0;
    var row = el('div', 'actions');
    var btn = el('button', null, saving.status === 'saving' ? t('savingCloud') : t('saveCloud'));
    btn.type = 'button';
    btn.disabled = !game.results.length || saved || saving.status === 'saving';
    btn.addEventListener('click', saveToCloud);
    row.appendChild(btn);
    box.appendChild(row);
    if (saving.status === 'failed') {
      box.appendChild(el('p', 'hint bad-text', t('saveCloudFailed', saving.error)));
    } else if (saved) {
      box.appendChild(el('p', 'hint ok-text', t('savedCloud', account.user.email || account.user.name)));
    } else {
      box.appendChild(el('p', 'hint', t('saveCloudHint')));
    }
    return box;
  }

  var lastUid = null; // el estado de la nube cambia en el sitio / the cloud state changes in place

  function onAccount(next) {
    var before = lastUid;
    account = next;
    var now = account.user ? account.user.uid : null;
    lastUid = now;
    if (now !== stats.uid) stats = { uid: now, status: 'idle', games: [], error: null };
    // una partida terminada antes de entrar se guarda al entrar
    // a game finished before signing in is saved on signing in
    if (now && now !== before && game && game.players && game.finishedAt &&
        game.cloudRounds !== game.results.length) {
      saveToCloud();
      return;
    }
    refreshView();
  }

  function loadStats() {
    stats.status = 'loading';
    var uid = stats.uid;
    cloud.listGames().then(function (list) {
      if (stats.uid !== uid) return;
      stats.games = list;
      stats.status = 'ready';
      rememberNames(list.reduce(function (all, g) { return all.concat(g.players || []); }, []).reverse());
    }).catch(function (err) {
      if (stats.uid !== uid) return;
      stats.status = 'failed';
      stats.error = err && (err.code || err.message);
    }).then(function () {
      if (view === 'stats') refreshView();
    });
  }

  function nameKey(name) {
    var s = String(name || '').trim().toLowerCase();
    return s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s;
  }

  function computeStats(list) {
    var byName = {};
    var finished = 0;
    var rounds = 0;
    list.forEach(function (g) {
      if (!g.finished || !g.players || !g.results) return;
      finished += 1;
      rounds += g.results.length;
      var order = ranking(g);
      order.forEach(function (entry, pos) {
        var key = nameKey(entry.name);
        var s = byName[key];
        if (!s) {
          s = byName[key] = { name: entry.name, games: 0, wins: 0, points: 0, best: null, rounds: 0, hits: 0, over: 0, under: 0 };
        }
        s.games += 1;
        if (pos === 0) s.wins += 1;
        s.points += entry.total;
        s.best = s.best === null ? entry.total : Math.max(s.best, entry.total);
        g.results.forEach(function (res) {
          var bid = res.bids[entry.index];
          var won = res.won[entry.index];
          s.rounds += 1;
          if (bid === won) s.hits += 1;
          else if (won < bid) s.over += 1;
          else s.under += 1;
        });
      });
    });
    var players = Object.keys(byName).map(function (k) { return byName[k]; });
    players.sort(function (a, b) {
      return b.wins - a.wins || (b.wins / b.games) - (a.wins / a.games) || b.points / b.games - a.points / a.games;
    });
    return { finished: finished, rounds: rounds, players: players };
  }

  function pct(part, whole) {
    return whole ? Math.round(100 * part / whole) + '%' : '–';
  }

  function dateLabel(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function statsView() {
    if (!account.ready) {
      root.appendChild(messageCard(t('accountTitle'), t('connecting')));
      return;
    }
    if (account.error === 'cloud/unavailable') {
      root.appendChild(messageCard(t('accountTitle'), t('cloudUnavailable'), 'bad'));
      return;
    }
    if (!account.user) {
      root.appendChild(signInCard());
      return;
    }
    root.appendChild(accountCard());
    if (stats.status === 'idle') loadStats();
    if (stats.status === 'loading') {
      root.appendChild(messageCard(t('statsTitle'), t('statsLoading')));
      return;
    }
    if (stats.status === 'failed') {
      var failed = messageCard(t('statsTitle'), t('statsFailed', stats.error), 'bad');
      var again = el('div', 'actions');
      var retry = el('button', null, t('retry'));
      retry.type = 'button';
      retry.addEventListener('click', function () { stats.status = 'idle'; refreshView(); });
      again.appendChild(retry);
      failed.appendChild(again);
      root.appendChild(failed);
      return;
    }
    root.appendChild(playersStatsCard());
    root.appendChild(savedGamesCard());
  }

  function messageCard(title, text, tone) {
    var card = el('section', 'card');
    card.appendChild(el('h2', 'card-title', title));
    if (tone) {
      card.appendChild(el('div', 'banner ' + tone, text));
    } else {
      card.appendChild(el('p', 'hint', text));
    }
    return card;
  }

  function signInCard() {
    var card = el('section', 'card');
    card.appendChild(el('h2', 'card-title', t('accountTitle')));
    card.appendChild(el('p', null, t('signInIntro')));

    var status = el('div', 'banner');
    status.style.display = 'none';
    function report(text, tone) {
      status.className = 'banner' + (tone ? ' ' + tone : '');
      status.textContent = text;
      status.style.display = 'block';
    }
    if (account.error && account.error !== 'cloud/unavailable') report(t('signInFailed', account.error), 'bad');

    var actions = el('div', 'actions');
    var google = el('button', 'primary', t('signInGoogle'));
    google.type = 'button';
    google.addEventListener('click', function () {
      google.disabled = true;
      cloud.signInGoogle(installed()).catch(function (err) {
        if (err && err.code === 'auth/popup-closed-by-user') return;
        report(t('signInFailed', err && (err.code || err.message)), 'bad');
      }).then(function () { google.disabled = false; });
    });
    actions.appendChild(google);
    card.appendChild(actions);

    // el enlace del correo se abre en el navegador, no en la app instalada
    // the email link opens in the browser, not in the installed app
    if (installed()) {
      card.appendChild(status);
      card.appendChild(el('p', 'hint', t('signInPrivacy')));
      return card;
    }

    var form = el('form', 'email-form');
    var field = el('div', 'field');
    field.appendChild(el('label', null, t('emailLabel')));
    var email = el('input');
    email.type = 'email';
    email.required = true;
    email.autocomplete = 'email';
    email.placeholder = lang === 'es' ? 'nombre@ejemplo.com' : 'name@example.com';
    field.appendChild(email);
    form.appendChild(field);
    var send = el('button', null, t('emailSend'));
    send.type = 'submit';
    form.appendChild(send);
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var address = email.value.trim();
      if (!address) return;
      send.disabled = true;
      cloud.sendEmailLink(address).then(function () {
        report(t('emailSent', address), 'ok');
      }).catch(function (err) {
        report(t('signInFailed', err && (err.code || err.message)), 'bad');
      }).then(function () { send.disabled = false; });
    });
    card.appendChild(form);
    card.appendChild(status);
    card.appendChild(el('p', 'hint', t('signInPrivacy')));
    return card;
  }

  function accountCard() {
    var card = el('section', 'card account');
    var line = el('div', 'account-line');
    line.appendChild(el('span', null, t('signedInAs', account.user.name || account.user.email)));
    var out = el('button', 'ghost', t('signOut'));
    out.type = 'button';
    out.addEventListener('click', function () { cloud.signOut(); });
    line.appendChild(out);
    card.appendChild(line);
    return card;
  }

  function playersStatsCard() {
    var summary = computeStats(stats.games);
    var card = el('section', 'card');
    card.appendChild(el('h2', 'card-title', t('statsTitle')));
    if (!summary.finished) {
      card.appendChild(el('p', 'hint', t('statsEmpty')));
      return card;
    }
    card.appendChild(el('p', 'stats-summary', t('statsSummary', summary.finished, summary.rounds)));

    var wrap = el('div', 'table-wrap');
    var table = el('table', 'stats-table');
    var thead = el('thead');
    var hr = el('tr');
    ['colPlayer', 'colGames', 'colWins', 'colWinRate', 'colAvg', 'colBest', 'colHitRate', 'colMiss'].forEach(function (key) {
      hr.appendChild(el('th', null, t(key)));
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody');
    summary.players.forEach(function (s, i) {
      var tr = el('tr', i === 0 ? 'lead' : '');
      tr.appendChild(el('td', 'nm', s.name));
      tr.appendChild(el('td', null, String(s.games)));
      tr.appendChild(el('td', 'total', String(s.wins)));
      tr.appendChild(el('td', null, pct(s.wins, s.games)));
      tr.appendChild(el('td', null, String(Math.round(s.points / s.games))));
      tr.appendChild(el('td', null, String(s.best)));
      tr.appendChild(el('td', null, pct(s.hits, s.rounds)));
      tr.appendChild(el('td', 'miss-split', '↑' + s.over + ' ↓' + s.under));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    card.appendChild(wrap);
    card.appendChild(el('p', 'hint', t('statsLegend')));
    return card;
  }

  function savedGamesCard() {
    var card = el('section', 'card');
    card.appendChild(el('h2', 'card-title', t('gamesTitle')));
    if (!stats.games.length) {
      card.appendChild(el('p', 'hint', t('gamesEmpty')));
      return card;
    }
    var list = el('div', 'saved-games');
    stats.games.forEach(function (g) {
      if (!g.players || !g.results) return;
      var item = el('details', 'saved-game');
      var summary = el('summary');
      summary.appendChild(el('span', 'when', dateLabel(g.startedAt)));
      var order = ranking(g);
      if (g.finished) {
        summary.appendChild(el('span', 'who', t('wonBy', order[0].name, order[0].total)));
      } else {
        summary.appendChild(el('span', 'chip', t('unfinished', g.results.length, g.rounds.length)));
      }
      item.appendChild(summary);

      var body = el('div', 'saved-body');
      var ol = el('ol', 'saved-standings');
      order.forEach(function (e) {
        var li = el('li');
        li.appendChild(el('span', null, e.name));
        li.appendChild(el('strong', null, String(e.total)));
        ol.appendChild(li);
      });
      body.appendChild(ol);

      var actions = el('div', 'actions');
      var open = el('button', null, t('openGame'));
      open.type = 'button';
      open.addEventListener('click', function () { openSavedGame(g); });
      actions.appendChild(open);
      var del = el('button', 'ghost', t('deleteGame'));
      del.type = 'button';
      del.addEventListener('click', function () {
        if (!window.confirm(t('confirmDelete'))) return;
        del.disabled = true;
        cloud.deleteGame(g.id).then(function () {
          stats.games = stats.games.filter(function (x) { return x.id !== g.id; });
          if (game && game.id === g.id) { delete game.cloudRounds; persist(); }
        }).catch(function (err) {
          window.alert(t('statsFailed', err && (err.code || err.message)));
        }).then(refreshView);
      });
      actions.appendChild(del);
      body.appendChild(actions);
      item.appendChild(body);
      list.appendChild(item);
    });
    card.appendChild(list);
    return card;
  }

  function openSavedGame(g) {
    var busy = game && game.players && game.results.length && !game.finishedAt && game.id !== g.id;
    if (busy && !window.confirm(t('confirmReplace'))) return;
    game = {
      id: g.id,
      players: g.players.slice(),
      firstDealer: g.firstDealer || 0,
      repeatMiddle: !!g.repeatMiddle,
      rounds: g.rounds.slice(),
      results: g.results.map(function (r) {
        return { cards: r.cards, dealer: r.dealer, bids: r.bids.slice(), won: r.won.slice() };
      }),
      startedAt: g.startedAt,
      cloudRounds: g.results.length
    };
    if (g.finishedAt) game.finishedAt = g.finishedAt;
    draft = null;
    persist();
    setView(g.finished ? 'table' : 'game');
    render();
  }

  /* ---------- tabla completa / full table ---------- */

  function fullTableCard() {
    var card = el('section', 'card');
    var head = el('div', 'round-head');
    head.appendChild(el('span', 'big', t('fullTable')));
    var played = game.results.length;
    head.appendChild(el('span', 'meta', t('roundsDone', played, game.rounds.length)));
    card.appendChild(head);

    var wrap = el('div', 'table-wrap');
    var table = el('table', 'full-table');

    var thead = el('thead');
    var r1 = el('tr');
    var corner = el('th', 'cards-col', t('shortCards'));
    corner.rowSpan = 2;
    r1.appendChild(corner);
    game.players.forEach(function (name) {
      var cell = el('th', 'group', name);
      cell.colSpan = 4;
      r1.appendChild(cell);
    });
    thead.appendChild(r1);
    var r2 = el('tr');
    game.players.forEach(function () {
      [t('shortBid'), t('shortTricks'), t('shortPoints'), t('shortTotal')].forEach(function (label, i) {
        r2.appendChild(el('th', i === 0 ? 'group' : null, label));
      });
    });
    thead.appendChild(r2);
    table.appendChild(thead);

    var tbody = el('tbody');
    var running = game.players.map(function () { return 0; });
    game.rounds.forEach(function (cards, r) {
      var res = game.results[r];
      var tr = el('tr', res ? '' : 'pending');
      var dealer = dealerOf(game, r);
      var cell = el('td', 'cards-col', String(cards));
      cell.title = t('dealsChip', game.players[dealer]);
      tr.appendChild(cell);
      game.players.forEach(function (name, p) {
        if (!res) {
          tr.appendChild(el('td', 'group' + (p === dealer ? ' deals' : ''), p === dealer ? '\u25CF' : ''));
          tr.appendChild(el('td', null, ''));
          tr.appendChild(el('td', null, ''));
          tr.appendChild(el('td', null, ''));
          return;
        }
        var pts = points(res.bids[p], res.won[p]);
        running[p] += pts;
        tr.appendChild(el('td', 'group' + (p === dealer ? ' deals' : ''), String(res.bids[p])));
        tr.appendChild(el('td', null, String(res.won[p])));
        tr.appendChild(el('td', pts >= 0 ? 'hit' : 'miss', (pts > 0 ? '+' : '') + pts));
        tr.appendChild(el('td', 'total', String(running[p])));
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    var tfoot = el('tfoot');
    var tr = el('tr');
    tr.appendChild(el('td', 'cards-col', t('shortTotal')));
    game.players.forEach(function (name, p) {
      var cell = el('td', 'group total');
      cell.colSpan = 4;
      cell.textContent = String(running[p]);
      tr.appendChild(cell);
    });
    tfoot.appendChild(tr);
    table.appendChild(tfoot);

    wrap.appendChild(table);
    card.appendChild(wrap);
    card.appendChild(el('p', 'hint', t('fullTableLegend')));

    var actions = el('div', 'actions');
    actions.appendChild(viewLink('button-link primary', t('backToGame'), 'game'));
    var printBtn = el('button', null, t('printTable'));
    printBtn.type = 'button';
    printBtn.addEventListener('click', function () { window.print(); });
    actions.appendChild(printBtn);
    card.appendChild(actions);

    return card;
  }

  /* ---------- barra de idioma / language bar ---------- */

  function topBar() {
    var bar = el('div', 'top-bar');

    var tabs = el('nav', 'tabs');
    var entries = [['game', 'tabGame']];
    if (game && game.results) entries.push(['table', 'tabTable']);
    if (cloud.enabled) entries.push(['stats', 'tabStats']);
    entries.push(['docs', 'tabRules']);
    entries.forEach(function (entry) {
      tabs.appendChild(viewLink('tab' + (entry[0] === view ? ' on' : ''), t(entry[1]), entry[0]));
    });
    bar.appendChild(tabs);

    var right = el('div', 'bar-right');
    right.appendChild(themeButton());
    right.appendChild(langBar());
    bar.appendChild(right);
    return bar;
  }

  /* ---------- modo claro y oscuro / light and dark mode ---------- */

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function isDark() {
    return document.documentElement.classList.contains('dark') || document.body.classList.contains('dark');
  }

  // lo mismo que el botón del resto de la web, para que la preferencia sea común
  // the same as the button on the rest of the site, so the preference is shared
  function setTheme(mode) {
    var other = mode === 'dark' ? 'light' : 'dark';
    [document.documentElement, document.body].forEach(function (node) {
      node.classList.remove(other);
      node.classList.add(mode);
    });
    try { window.localStorage.setItem('pref-theme', mode); } catch (e) { /* modo privado */ }
    if (window.updateThemeFavicons) window.updateThemeFavicons(mode);
  }

  function themeIcon(dark) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(SVG_NS, 'path');
    // en oscuro se ofrece el sol, en claro la luna / dark offers the sun, light offers the moon
    path.setAttribute('d', dark
      ? 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42'
      : 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z');
    svg.appendChild(path);
    return svg;
  }

  function themeButton() {
    var dark = isDark();
    var btn = el('button', 'theme-toggle');
    btn.type = 'button';
    var label = dark ? t('themeLight') : t('themeDark');
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.appendChild(themeIcon(dark));
    btn.addEventListener('click', function () {
      setTheme(isDark() ? 'light' : 'dark');
      refreshView();
    });
    return btn;
  }

  function viewLink(className, label, name) {
    var link = el('a', className, label);
    link.href = hrefOf(name);
    if (name === view) link.setAttribute('aria-current', 'page');
    link.addEventListener('click', function (event) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      setView(name);
    });
    return link;
  }

  // banderas dibujadas, porque Windows muestra los emojis de bandera como letras
  // drawn flags, because Windows shows flag emoji as letters
  var FLAGS = {
    es: '<svg viewBox="0 0 750 500" aria-hidden="true"><rect width="750" height="500" fill="#c60b1e"/>' +
        '<rect y="125" width="750" height="250" fill="#ffc400"/></svg>',
    en: '<svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
        '<defs><clipPath id="pocha-uk-t"><path d="M30 15h30v15zv15H0zH0V0zV0h30z"/></clipPath></defs>' +
        '<rect width="60" height="30" fill="#012169"/>' +
        '<path d="M0 0L60 30M60 0L0 30" stroke="#fff" stroke-width="6"/>' +
        '<path d="M0 0L60 30M60 0L0 30" stroke="#c8102e" stroke-width="4" clip-path="url(#pocha-uk-t)"/>' +
        '<path d="M30 0v30M0 15h60" stroke="#fff" stroke-width="10"/>' +
        '<path d="M30 0v30M0 15h60" stroke="#c8102e" stroke-width="6"/></svg>'
  };

  function langBar() {
    var bar = el('div', 'lang-bar');
    ['es', 'en'].forEach(function (code) {
      var btn = el('button', 'lang flag' + (code === lang ? ' on' : ''));
      btn.innerHTML = FLAGS[code];
      btn.title = DICT[code].label;
      btn.setAttribute('aria-label', DICT[code].label);
      btn.type = 'button';
      btn.lang = code;
      if (code === lang) btn.setAttribute('aria-current', 'true');
      btn.addEventListener('click', function () { setLang(code); });
      bar.appendChild(btn);
    });
    return bar;
  }

  /* ---------- documentación / documentation ---------- */

  function docsSection() {
    var section = el('section', 'docs');
    t('docs').forEach(function (block) {
      if (block.h2) {
        section.appendChild(el('h2', null, block.h2));
        return;
      }
      if (block.p) {
        var para = el('p');
        para.innerHTML = block.p;
        section.appendChild(para);
        return;
      }
      if (block.ol) {
        var list = el('ol');
        block.ol.forEach(function (item) {
          var li = el('li');
          li.innerHTML = item;
          list.appendChild(li);
        });
        section.appendChild(list);
        return;
      }
      if (block.table) {
        var wrap = el('div', 'table-wrap');
        var table = el('table', 'docs-table');
        var thead = el('thead');
        var hr = el('tr');
        block.table.head.forEach(function (h) { hr.appendChild(el('th', null, h)); });
        thead.appendChild(hr);
        table.appendChild(thead);
        var tbody = el('tbody');
        block.table.rows.forEach(function (row) {
          var tr = el('tr');
          row.forEach(function (cell) { tr.appendChild(el('td', null, cell)); });
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        section.appendChild(wrap);
        return;
      }
      if (block.ranks) {
        var row = el('div', 'rank-row');
        block.ranks.forEach(function (rank, i) {
          if (i > 0) row.appendChild(el('span', 'rank-arrow', '>'));
          row.appendChild(el('span', 'rank' + (i === 0 ? ' top' : ''), rank));
        });
        section.appendChild(row);
        return;
      }
      if (block.code) {
        var pre = el('pre', 'docs-code');
        pre.appendChild(el('code', null, DICT.snippets[block.code]));
        section.appendChild(pre);
      }
    });
    return section;
  }

  /* ---------- aplicación instalada / installed app ---------- */

  function installed() {
    return !!((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone);
  }

  // la pantalla no se apaga mientras hay una partida en juego
  // the screen stays on while a game is being played
  var wakeLock = null;
  var wakeAsked = false;

  function keepAwake() {
    var playing = !!(game && game.players && !game.finishedAt) && view !== 'docs' && view !== 'stats' &&
      document.visibilityState === 'visible';
    if (playing && !wakeLock && !wakeAsked && navigator.wakeLock) {
      wakeAsked = true;
      navigator.wakeLock.request('screen').then(function (lock) {
        wakeLock = lock;
        lock.addEventListener('release', function () { wakeLock = null; });
      }).catch(function () { /* sin permiso o sin batería / not allowed or low battery */ })
        .then(function () { wakeAsked = false; });
    } else if (!playing && wakeLock) {
      wakeLock.release();
      wakeLock = null;
    }
  }

  document.addEventListener('visibilitychange', keepAwake);

  function registerWorker() {
    if (!('serviceWorker' in navigator)) return;
    var local = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
    if (window.location.protocol !== 'https:' && !local) return;
    navigator.serviceWorker.register('/pocha/sw.js', { scope: '/pocha/' }).then(function () {
      return navigator.serviceWorker.ready;
    }).then(function (reg) {
      if (!reg.active || !window.performance || !performance.getEntriesByType) return;
      var urls = performance.getEntriesByType('resource').map(function (e) { return e.name; });
      reg.active.postMessage({ cache: urls });
    }).catch(function () { /* sin modo sin conexión / no offline mode */ });
  }

  /* ---------- arranque / start ---------- */

  function render() {
    document.documentElement.lang = lang;
    document.documentElement.classList.toggle('pocha-installed', installed());
    clear(root);
    keepAwake();
    root.appendChild(topBar());
    if (view === 'docs') {
      captureSetup = null;
      root.appendChild(docsSection());
      return;
    }
    if (view === 'stats' && cloud.enabled) {
      captureSetup = null;
      statsView();
      return;
    }
    if (view === 'table' && game && game.results) {
      captureSetup = null;
      root.appendChild(fullTableCard());
      return;
    }
    if (game && game.players && game.rounds) renderGame();
    else renderSetup();
  }

  render();
  if (cloud.enabled) cloud.onChange(onAccount);
  window.addEventListener('load', registerWorker);
})();
