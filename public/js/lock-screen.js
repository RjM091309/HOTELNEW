// Client-side "lock the screen" feature - blurs/blocks the page and requires
// the logged-in user's own password to resume. Does NOT touch the session/
// JWT (unlike Log Out), so unlocking just resumes exactly where they were.
// The lock survives a reload/new tab in the same browser via localStorage
// (see the inline script in layout.ejs that runs before the page paints),
// but is only ever cleared by a correct password check against the server -
// clearing localStorage by hand still leaves the account itself untouched.
(function () {
  function lockSystem() {
    try { localStorage.setItem('systemLocked', '1'); } catch (e) {}
    document.body.classList.add('system-locked');
    setTimeout(function () {
      const pwField = document.getElementById('lockScreenPassword');
      if (pwField) pwField.focus();
    }, 50);
  }
  window.lockSystem = lockSystem;

  function unlockSystem() {
    try { localStorage.removeItem('systemLocked'); } catch (e) {}
    document.body.classList.remove('system-locked');
  }

  document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('lockScreenForm');
    const pwField = document.getElementById('lockScreenPassword');
    const errorEl = document.getElementById('lockScreenError');
    if (!form) return;

    // If we loaded already locked (see layout.ejs's early inline script),
    // put focus on the password field right away.
    if (document.body.classList.contains('system-locked') && pwField) {
      setTimeout(function () { pwField.focus(); }, 100);
    }

    const card = document.querySelector('.lock-screen-card');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const password = pwField.value;
      if (!password) return;

      errorEl.hidden = true;
      const submitBtn = form.querySelector('button[type="submit"]');
      const submitBtnOriginalHtml = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) submitBtn.disabled = true;

      fetch('/user_info/profile/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success) {
            pwField.value = '';
            errorEl.hidden = true;
            // Brief "Unlocked" confirmation on the button before the card
            // fades/scales out (see body.system-locked transitions in
            // lock-screen.ejs), rather than snapping away instantly.
            if (submitBtn) {
              submitBtn.innerHTML = '<i class="fa fa-check"></i> Unlocked';
              submitBtn.classList.add('lock-screen-unlock-btn--success');
            }
            setTimeout(function () {
              unlockSystem();
              // Reset the button back to normal after the card has fully
              // faded, ready for next time the screen locks.
              setTimeout(function () {
                if (submitBtn) {
                  submitBtn.innerHTML = submitBtnOriginalHtml;
                  submitBtn.classList.remove('lock-screen-unlock-btn--success');
                  submitBtn.disabled = false;
                }
              }, 400);
            }, 450);
          } else {
            errorEl.textContent = data.message || 'Incorrect password.';
            errorEl.hidden = false;
            pwField.value = '';
            pwField.focus();
            if (submitBtn) submitBtn.disabled = false;
            if (card) {
              card.classList.remove('lock-screen-shake');
              // Force reflow so the animation can replay on consecutive wrong attempts.
              void card.offsetWidth;
              card.classList.add('lock-screen-shake');
            }
          }
        })
        .catch(() => {
          errorEl.textContent = 'Could not verify password. Please try again.';
          errorEl.hidden = false;
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  });
})();
