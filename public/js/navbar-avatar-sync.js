// Keeps the navbar's name/avatar current after a profile edit, on every
// other page too - navbar.ejs renders those from the JWT payload, which
// still holds whatever FULLNAME/photo was true at login time until the user
// logs in again. This just patches the DOM after a live fetch, same pattern
// as the rest of the dashboard's "refresh from server" widgets.
(function () {
  const usernameEl = document.querySelector('.navbar .username');
  const avatarEl = document.getElementById('navbarAvatarImg');
  // Same staleness applies to the lock screen's avatar/name (lock-screen.ejs
  // also renders them from the JWT payload).
  const lockAvatarEl = document.getElementById('lockScreenAvatar');
  const lockNameEl = document.getElementById('lockScreenName');
  if (!usernameEl && !avatarEl && !lockAvatarEl && !lockNameEl) return;

  fetch('/user_info/api/current-user')
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data || !data.success || !data.data) return;
      if (usernameEl && data.data.FULLNAME) {
        usernameEl.textContent = ' ' + data.data.FULLNAME + ' ';
      }
      if (lockNameEl && data.data.FULLNAME) {
        lockNameEl.textContent = data.data.FULLNAME;
      }
      if (data.data.PROFILE_PHOTO) {
        const url = '/uploads/avatars/' + data.data.PROFILE_PHOTO;
        if (avatarEl) avatarEl.src = url;
        if (lockAvatarEl) lockAvatarEl.src = url;
      }
    })
    .catch(() => { /* stay on the SSR-rendered default */ });
})();
