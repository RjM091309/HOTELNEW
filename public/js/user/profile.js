(function () {
  const photoInput = document.getElementById('profilePhotoInput');
  const photoPreview = document.getElementById('profilePhotoPreview');
  const chooseBtn = document.getElementById('profilePhotoChooseBtn');
  const nameForm = document.getElementById('profileNameForm');
  const passwordForm = document.getElementById('profilePasswordForm');

  function notify(icon, title, text) {
    if (typeof Swal !== 'undefined') {
      Swal.fire({ icon, title, text });
    } else {
      alert(title + (text ? ': ' + text : ''));
    }
  }

  // Reflect a fresh name/photo into the navbar immediately, without
  // requiring a full reload or a new login (the navbar's own username/avatar
  // are rendered server-side from the JWT, which still holds the old values
  // until the user logs in again).
  function updateNavbar({ fullname, photoUrl }) {
    if (fullname) {
      document.querySelectorAll('.navbar .username').forEach((el) => { el.textContent = fullname; });
    }
    if (photoUrl) {
      document.querySelectorAll('.navbar .dropdown-toggle img.img-circle').forEach((el) => { el.src = photoUrl; });
    }
  }

  if (chooseBtn && photoInput) {
    chooseBtn.addEventListener('click', function () {
      photoInput.click();
    });

    photoInput.addEventListener('change', function () {
      const file = photoInput.files && photoInput.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('photo', file);

      fetch('/user_info/profile/photo', { method: 'POST', body: formData })
        .then((r) => r.json())
        .then((data) => {
          if (!data.success) {
            notify('error', 'Upload failed', data.message);
            return;
          }
          const url = data.data.photoUrl + '?t=' + Date.now();
          photoPreview.src = url;
          updateNavbar({ photoUrl: url });
          notify('success', 'Photo updated', '');
        })
        .catch(() => notify('error', 'Upload failed', 'Please try again.'))
        .finally(() => { photoInput.value = ''; });
    });
  }

  if (nameForm) {
    nameForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const fullname = document.getElementById('profileFullname').value.trim();
      if (!fullname) return;

      fetch('/user_info/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullname })
      })
        .then((r) => r.json())
        .then((data) => {
          if (!data.success) {
            notify('error', 'Update failed', data.message);
            return;
          }
          updateNavbar({ fullname });
          notify('success', 'Profile updated', '');
        })
        .catch(() => notify('error', 'Update failed', 'Please try again.'));
    });
  }

  if (passwordForm) {
    passwordForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const currentPassword = document.getElementById('profileCurrentPassword').value;
      const newPassword = document.getElementById('profileNewPassword').value;
      const confirmPassword = document.getElementById('profileConfirmPassword').value;

      if (newPassword !== confirmPassword) {
        notify('warning', 'Passwords do not match', 'Please re-enter your new password.');
        return;
      }

      fetch('/user_info/profile/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
      })
        .then((r) => r.json())
        .then((data) => {
          if (!data.success) {
            notify('error', 'Password change failed', data.message);
            return;
          }
          passwordForm.reset();
          notify('success', 'Password changed', 'Use your new password next time you log in.');
        })
        .catch(() => notify('error', 'Password change failed', 'Please try again.'));
    });
  }
})();
