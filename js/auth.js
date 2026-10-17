/* ==========================================================================
   auth.js — the door. Password never stored in plain text: only its SHA-256
   hash lives in localStorage. Same default hash as the previous IT-Lab app,
   so the old password still opens this one (snl.authHash is honoured first).
   Session = 12 h · 5 wrong tries → 30 s cooldown.
   ========================================================================== */
(function (w) {
  'use strict';
  var SNL = w.SNL, U = SNL.U, esc = U.esc;
  var DEFAULT_HASH = 'ee0c6e3f1c167b1730c645bd6509ee4760cf8556a0909302ca51954520b3230c';
  var SKEY = 'snpl.session', HKEY = 'snpl.authHash', OLDB = 'snl.authHash', NKEY = 'snpl.user', TTL = 12 * 36e5;
  var tries = 0, locked = 0, tick = null;

  function sha(s) { return U.hash(s); }
  var WEAK = !((w.crypto || {}).subtle && w.crypto.subtle.digest);   // plain http has no WebCrypto
  function hash() { return localStorage.getItem(HKEY) || localStorage.getItem(OLDB) || DEFAULT_HASH; }
  function session() { try { var s = JSON.parse(localStorage.getItem(SKEY) || 'null'); return (s && s.t && Date.now() - s.t < TTL) ? s : null; } catch (e) { return null; } }
  function finish(name) {
    localStorage.setItem(SKEY, JSON.stringify({ t: Date.now(), who: name || localStorage.getItem(NKEY) || 'Lab incharge' }));
    return true;
  }
  function put(pw, name) {
    if (WEAK && !localStorage.getItem(HKEY) && !localStorage.getItem(OLDB)) {
      /* first sign-in on an insecure origin: no SHA-256 available, so this device
         keeps its own (weaker) hash instead of locking everybody out */
      return sha(pw).then(function (h) { localStorage.setItem(HKEY, h); return finish(name); });
    }
    return sha(pw).then(function (h) { return h === hash() ? finish(name) : false; });
  }

  var A = SNL.auth = {
    ok: function () { return !!session(); },
    user: function () { var s = session(); return s ? (s.who || 'Lab incharge') : ''; },
    left: function () { var s = session(); return s ? Math.max(0, TTL - (Date.now() - s.t)) : 0; },
    hash: hash,
    logout: function () {
      localStorage.removeItem(SKEY);
      try { SNL.db.log('settings', 'Logout', '', 'Signed out'); } catch (e) { }
      w.location.reload();
    },
    change: function (cur, next, again) {
      if (String(next).length < 4) return Promise.reject(new Error('New password is too short'));
      if (next !== again) return Promise.reject(new Error('The two new passwords do not match'));
      return sha(cur).then(function (h) {
        if (h !== hash()) throw new Error('Current password is not right');
        return sha(next);
      }).then(function (nh) {
        localStorage.setItem(HKEY, nh);
        try { SNL.db.log('settings', 'Password', '', 'Login password changed on this device'); } catch (e) { }
        return true;
      });
    },
    changePw: function () {
      var wrap = U.el('div', 'form');
      wrap.innerHTML = '<div class="fld w12"><label>Current password</label><input class="inp" type="password" data-p="c" data-focus></div>' +
        '<div class="fld w6"><label>New password</label><input class="inp" type="password" data-p="n"></div>' +
        '<div class="fld w6"><label>Repeat it</label><input class="inp" type="password" data-p="a"></div>' +
        '<div class="fld w12"><span class="fld-hint">Only the SHA-256 hash is stored in this browser. If you forget it, clear site data and the default password works again.</span></div>';
      SNL.ui.modal({
        narrow: true, title: 'Change the login password', sub: SNL.db.settings().org, node: wrap,
        foot: [{ label: 'Cancel' }, {
          label: 'Change it', kind: 'primary', primary: true, fn: function () {
            var g = function (k) { return wrap.querySelector('[data-p="' + k + '"]').value; };
            A.change(g('c'), g('n'), g('a')).then(function () { SNL.ui.toast('Password changed', 'ok'); }, function (e) { SNL.ui.toast(e.message, 'err'); throw e; });
          }
        }]
      });
    },
    /** paints the gate unless a session is alive, then calls ready() */
    require: function (ready) {
      if (A.ok()) { ready(); return; }
      gate(ready);
    }
  };

  /* ------------------------------ the gate ---------------------------- */
  function gate(ready) {
    var set = SNL.db.settings();
    var box = U.el('div', 'login');
    box.setAttribute('role', 'main');
    box.innerHTML =
      '<form class="login-card" novalidate>' +
      '<div class="login-mark" aria-hidden="true"></div>' +
      '<h2>Lab&nbsp;Desk</h2>' +
      '<p class="sub">' + esc(set.org) + ' · the ledger opens with your password. Everything stays in this browser unless Live sync is switched on.</p>' +
      '<div class="fld"><label for="pw">Password</label>' +
      '<div class="pw"><input class="inp" id="pw" type="password" autocomplete="current-password" placeholder="••••••••" required>' +
      '<button class="chip" type="button" data-peek aria-label="Show password"><span class="gi gi-eye gi-sm"></span></button></div></div>' +
      (WEAK ? '<p class="note" style="margin:0 0 10px">This page is not on https, so the browser will not share SHA-256 with the app. A device-local password is created from what you type now — use it only on this machine, or open the site over https for the shared hash.</p>' : '') +
      '<p class="login-err" data-err></p>' +
      '<label class="check" style="margin:2px 0 14px"><input type="checkbox" name="who" checked><span>Keep me signed in on this device for 12 hours</span></label>' +
      '<button class="chip chip-solid" style="width:100%;padding:11px" type="submit"><span class="gi gi-lock gi-sm"></span><em>Open the ledger</em></button>' +
      '<div class="login-foot"><span>Ctrl + K jumps anywhere · Esc closes dialogs</span><span data-clock class="mono"></span></div>' +
      '</form>';
    document.body.appendChild(box);
    var form = box.querySelector('form'), inp = box.querySelector('#pw'), err = box.querySelector('[data-err]');
    var clk = box.querySelector('[data-clock]');
    tick = setInterval(function () {
      if (!box.isConnected) { clearInterval(tick); tick = null; return; }
      clk.textContent = U.time(new Date(), true);
      if (locked) {
        var rest = Math.ceil((locked - Date.now()) / 1000);
        if (rest <= 0) { locked = 0; err.textContent = ''; inp.disabled = false; }
        else err.textContent = 'Too many tries — locked for ' + rest + ' s';
      }
    }, 500);
    box.querySelector('[data-peek]').onclick = function () { inp.type = inp.type === 'password' ? 'text' : 'password'; inp.focus(); };
    form.onsubmit = function (e) {
      e.preventDefault();
      if (locked) return;
      var v = inp.value;
      if (!v) { err.textContent = 'Type the password first'; return; }
      inp.disabled = true;
      put(v).then(function (ok) {
        inp.disabled = false;
        if (!ok) {
          tries++;
          if (tries >= 5) { locked = Date.now() + 30000; err.textContent = 'Too many tries — locked for 30 s'; }
          else err.textContent = 'Wrong password · ' + (5 - tries) + ' try left before a 30 s pause';
          inp.select();
          return;
        }
        try { localStorage.setItem(NKEY, 'Lab incharge'); } catch (e2) { }
        err.textContent = '';
        clearInterval(tick || 0);
        box.style.transition = 'opacity .2s'; box.style.opacity = '0';
        setTimeout(function () { box.remove(); ready(); }, 160);
      }).catch(function (e2) { inp.disabled = false; err.textContent = e2.message; });
    };
    setTimeout(function () { inp.focus(); }, 90);
  }
})(window);
