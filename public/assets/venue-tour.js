(() => {
  'use strict';

  const photos = Array.from(document.querySelectorAll('[data-venue-photo]'));
  const dialog = document.querySelector('.venue-tour-lightbox');
  // The image links still work when the browser has no native dialog support.
  if (!photos.length || !dialog || typeof dialog.showModal !== 'function') return;

  const image = dialog.querySelector('.venue-tour-lightbox-image');
  const title = dialog.querySelector('#venue-lightbox-title');
  const count = dialog.querySelector('.venue-tour-lightbox-count');
  let currentIndex = 0;
  let opener = null;

  function showPhoto(index) {
    currentIndex = (index + photos.length) % photos.length;
    const photo = photos[currentIndex];
    image.src = photo.href;
    image.alt = photo.querySelector('img').alt;
    title.textContent = photo.dataset.title;
    count.textContent = `${currentIndex + 1} / ${photos.length}`;
  }

  photos.forEach((photo, index) => {
    photo.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      opener = photo;
      showPhoto(index);
      dialog.showModal();
      document.body.classList.add('venue-tour-photo-open');
    });
  });

  dialog.querySelector('.venue-tour-lightbox-close').addEventListener('click', () => dialog.close());
  dialog.querySelector('.venue-tour-lightbox-prev').addEventListener('click', () => showPhoto(currentIndex - 1));
  dialog.querySelector('.venue-tour-lightbox-next').addEventListener('click', () => showPhoto(currentIndex + 1));
  dialog.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      showPhoto(currentIndex + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('venue-tour-photo-open');
    opener?.focus({ preventScroll: true });
  });
})();
