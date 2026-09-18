document.querySelectorAll('[data-staff-gallery]').forEach((gallery) => {
  const photos = [...gallery.querySelectorAll('[data-staff-photo]')];
  const controls = gallery.querySelector('[data-gallery-controls]');
  const buttons = [...controls.querySelectorAll('[data-photo-target]')];

  function showPhoto(photoId) {
    if (!photos.some((photo) => photo.id === photoId)) return;
    photos.forEach((photo) => {
      photo.classList.toggle('staff-photo--primary', photo.id === photoId);
      photo.classList.toggle('staff-photo--secondary', photo.id !== photoId);
    });
    buttons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.photoTarget === photoId));
    });
  }

  buttons.forEach((button) => {
    button.addEventListener('click', () => showPhoto(button.dataset.photoTarget));
  });
  // Keep both photos visible; the controls swap the large and inset frames.
  showPhoto(buttons[0].dataset.photoTarget);
  controls.hidden = false;
});
