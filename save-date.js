const heroImage = document.querySelector('.save-hero__art');
const section = document.querySelector('#mailing-address');
const addressForm = document.querySelector('[data-address-form]');
const addressStatus = document.querySelector('[data-address-status]');
const thanks = document.querySelector('[data-address-thanks]');
const loadedAt = document.querySelector('[data-loaded-at]');
const confirmationImage = new Image();
const confirmationImageReady = new Promise((resolve) => {
  confirmationImage.onload = () => {
    if (confirmationImage.decode) confirmationImage.decode().catch(() => {}).then(resolve);
    else resolve();
  };
  confirmationImage.onerror = resolve;
});
confirmationImage.src = './assets/jack-liza-field.jpg';

function revealHero() {
  if (document.documentElement.classList.contains('hero-ready')) return;
  document.documentElement.classList.add('hero-ready');
}

if (heroImage) {
  const minimumRevealTime = new Promise((resolve) => window.setTimeout(resolve, 700));
  const imageLoaded = heroImage.complete
    ? Promise.resolve()
    : new Promise((resolve) => {
        heroImage.addEventListener('load', resolve, { once: true });
        heroImage.addEventListener('error', resolve, { once: true });
      });
  const imageReady = imageLoaded.then(() => {
    if (heroImage.naturalWidth && heroImage.decode) return heroImage.decode().catch(() => {});
  });
  // Keep the page usable if a connection stalls indefinitely.
  const fallback = new Promise((resolve) => window.setTimeout(resolve, 20000));
  Promise.all([minimumRevealTime, Promise.race([imageReady, fallback])]).then(revealHero);
} else {
  revealHero();
}

function setStatus(node, message = '', error = false) {
  node.textContent = message;
  node.classList.toggle('error', error);
}

function setLoading(button, loading, label) {
  if (!button) return;
  if (loading) {
    button.dataset.label = button.textContent;
    button.textContent = label;
    button.disabled = true;
    button.classList.add('is-loading');
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
    button.classList.remove('is-loading');
  }
}

loadedAt.value = String(Date.now());

addressForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = addressForm.querySelector('button[type="submit"]');
  const payload = Object.fromEntries(new FormData(addressForm).entries());
  setLoading(button, true, 'Saving…');
  setStatus(addressStatus);
  try {
    const response = await fetch('/.netlify/functions/address', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to save your address.');
    button.textContent = 'Preparing…';
    await confirmationImageReady;
    addressForm.hidden = true;
    thanks.hidden = false;
    section.classList.add('is-complete');
    thanks.focus();
  } catch (error) {
    setStatus(addressStatus, error.message || 'We couldn’t save that address. Please try again.', true);
  } finally {
    setLoading(button, false);
  }
});
