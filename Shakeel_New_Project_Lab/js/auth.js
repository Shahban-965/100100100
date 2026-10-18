/* ═══════════════════════════════════════════════════
   LabDesk — passcode gate  (default: 45637189230)
   ═══════════════════════════════════════════════════ */
'use strict';

const Auth = (() => {
  const PIN_KEY = 'snpl.pin.v1';       // sha256 hash of the passcode
  const SES_KEY = 'snpl.session.v1';   // sessionStorage flag
  const DEFAULT_PIN = '45637189230';
  let booted = false;

  async function hashPin(pin) { return sha256(String(pin).trim()); }

  async function ensureDefault() {
    if (!localStorage.getItem(PIN_KEY)) {
      localStorage.setItem(PIN_KEY, await hashPin(DEFAULT_PIN));
    }
  }

  async function verify(pin) {
    await ensureDefault();
    return (await hashPin(pin)) === localStorage.getItem(PIN_KEY);
  }

  async function changePin(oldPin, newPin) {
    if (!(await verify(oldPin))) return { ok: false, error: 'Current passcode is wrong.' };
    if (!/^\d{6,24}$/.test(newPin)) return { ok: false, error: 'New passcode must be 6–24 digits.' };
    localStorage.setItem(PIN_KEY, await hashPin(newPin));
    return { ok: true };
  }

  const isAuthed = () => sessionStorage.getItem(SES_KEY) === '1';
  const login = () => sessionStorage.setItem(SES_KEY, '1');
  const logout = () => sessionStorage.removeItem(SES_KEY);

  /* ── wire the login screen ── */
  function init(onSuccess) {
    if (booted) return; booted = true;
    const form = $('#loginForm');
    const input = $('#pinInput');
    const err = $('#loginErr');
    const eye = $('#pinEye');

    eye.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      eye.style.color = show ? 'var(--ink)' : '';
      input.focus();
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const pin = input.value.trim();
      if (!pin) { err.textContent = 'Please enter the lab passcode.'; shake(); return; }
      if (await verify(pin)) {
        err.textContent = '';
        login();
        toast('Welcome back, Shakeel — lab unlocked');
        onSuccess();
      } else {
        err.textContent = 'Wrong passcode. Hint: it was given to you (11 digits).';
        shake();
      }
    });
  }

  const shake = () => {
    const f = $('#loginForm');
    f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
    $('#pinInput').select();
  };

  return { init, verify, changePin, isAuthed, login, logout, DEFAULT_PIN };
})();
