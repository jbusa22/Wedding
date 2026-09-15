const CODE_KEY = 'weddingInviteCode';
const heroImage = document.querySelector('.save-hero__art');
const section = document.querySelector('#mailing-address');
const searchForm = document.querySelector('[data-party-search-form]');
const searchStatus = document.querySelector('[data-search-status]');
const results = document.querySelector('[data-party-results]');
const addressForm = document.querySelector('[data-address-form]');
const addressStatus = document.querySelector('[data-address-status]');
const selectedParty = document.querySelector('[data-selected-party]');
const thanks = document.querySelector('[data-address-thanks]');
const loadedAt = document.querySelector('[data-loaded-at]');
let activeParty = null;

function revealHero() {
  if (document.documentElement.classList.contains('hero-ready')) return;
  document.documentElement.classList.add('hero-ready');
}

if (heroImage) {
  const minimumRevealTime = new Promise((resolve) => window.setTimeout(resolve, 700));
  const imageReady = heroImage.complete
    ? (heroImage.decode?.() || Promise.resolve()).catch(() => {})
    : new Promise((resolve) => {
        heroImage.addEventListener('load', resolve, { once: true });
        heroImage.addEventListener('error', resolve, { once: true });
      });
  Promise.all([minimumRevealTime, imageReady]).then(revealHero);
  window.setTimeout(revealHero, 5000);
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

function saveCode(code) {
  localStorage.setItem(CODE_KEY, code);
  document.cookie = `${CODE_KEY}=${encodeURIComponent(code)}; Max-Age=2592000; SameSite=Lax; Path=/`;
}

function showAddressForm(match, saved = null) {
  activeParty = match;
  saveCode(match.token);
  selectedParty.textContent = match.name;
  searchForm.hidden = true;
  results.innerHTML = '';
  thanks.hidden = true;
  addressForm.hidden = false;
  loadedAt.value = String(Date.now());
  if (saved) {
    for (const key of ['street', 'city', 'state', 'zip']) addressForm.elements[key].value = saved[key] || '';
  }
  addressForm.elements.street.focus();
}

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = String(new FormData(searchForm).get('partySearch') || '').trim();
  const button = searchForm.querySelector('button');
  setLoading(button, true, 'Searching…');
  setStatus(searchStatus);
  results.innerHTML = '';
  try {
    const response = await fetch(`/.netlify/functions/invite?q=${encodeURIComponent(query)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to search invitations.');
    const matches = data.matches || [];
    if (!matches.length) {
      setStatus(searchStatus, 'We couldn’t find that name. Try another person in your household.', true);
      return;
    }
    results.innerHTML = matches.map((match, index) => `<button class="party-choice" type="button" data-index="${index}"><span>${escapeHtml(match.name)}</span><span aria-hidden="true">→</span></button>`).join('');
    results.querySelectorAll('button').forEach((choice) => {
      choice.addEventListener('click', () => loadParty(matches[Number(choice.dataset.index)], choice));
    });
  } catch (error) {
    setStatus(searchStatus, error.message || 'We couldn’t search right now. Please try again.', true);
  } finally {
    setLoading(button, false);
  }
});

async function loadParty(match, button) {
  setLoading(button, true, 'Opening…');
  try {
    const response = await fetch('/.netlify/functions/address', { headers: { 'X-Invite-Code': match.token } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to open that household.');
    showAddressForm(match, data.address);
  } catch (error) {
    setLoading(button, false);
    setStatus(searchStatus, error.message, true);
  }
}

addressForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = addressForm.querySelector('button[type="submit"]');
  const payload = Object.fromEntries(new FormData(addressForm).entries());
  setLoading(button, true, 'Saving…');
  setStatus(addressStatus);
  try {
    const response = await fetch('/.netlify/functions/address', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Invite-Code': activeParty.token },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to save your address.');
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

document.querySelector('[data-change-household]').addEventListener('click', () => {
  activeParty = null;
  addressForm.reset();
  addressForm.hidden = true;
  searchForm.hidden = false;
  setStatus(searchStatus);
  setStatus(addressStatus);
  document.querySelector('#party-search').focus();
});

document.querySelector('[data-edit-address]').addEventListener('click', () => {
  section.classList.remove('is-complete');
  thanks.hidden = true;
  addressForm.hidden = false;
  loadedAt.value = String(Date.now());
  addressForm.elements.street.focus();
});

function escapeHtml(value) {
  return String(value).replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}
