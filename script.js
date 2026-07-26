const INVITE_CODE_KEY = 'weddingInviteCode';

const header = document.querySelector('.site-header');
const progressBar = document.querySelector('.page-progress span');
const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');
const codeDialog = document.querySelector('#code-dialog');
const codeForm = document.querySelector('#code-form');
const codeStatus = document.querySelector('[data-code-status]');
const partyResults = document.querySelector('[data-party-results]');
const accessGate = document.querySelector('[data-access-gate]');
const gateStatus = document.querySelector('[data-gate-status]');
const privateContent = document.querySelector('[data-private-content]');
const registryGrid = document.querySelector('#registry-grid');
const registryEmpty = document.querySelector('[data-registry-empty]');
const registryStatus = document.querySelector('[data-registry-status]');
const rsvpForm = document.querySelector('#rsvp-form');
const rsvpStatus = document.querySelector('[data-rsvp-status]');
const rsvpSubmit = document.querySelector('[data-rsvp-submit]');
const loadedAtInput = document.querySelector('[data-loaded-at]');
const privatePage = document.body.dataset.privatePage || '';
let suppressInvitePrompt = false;

function updateChrome() {
  if (!header || !progressBar) return;
  header.classList.toggle('scrolled', document.body.classList.contains('inner-page') || window.scrollY > 30);
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  progressBar.style.width = `${scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0}%`;
}

function closeMenu() {
  if (!menuToggle || !nav) return;
  menuToggle.setAttribute('aria-expanded', 'false');
  nav.classList.remove('open');
  document.body.classList.remove('menu-open');
}

if (menuToggle && nav) {
  menuToggle.addEventListener('click', () => {
    const willOpen = menuToggle.getAttribute('aria-expanded') !== 'true';
    menuToggle.setAttribute('aria-expanded', String(willOpen));
    nav.classList.toggle('open', willOpen);
    document.body.classList.toggle('menu-open', willOpen);
  });
  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
}

window.addEventListener('scroll', updateChrome, { passive: true });
updateChrome();

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px' });

document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element));

function resetLoadedAt() {
  if (loadedAtInput) loadedAtInput.value = String(Date.now());
}

resetLoadedAt();

function getCookie(name) {
  return document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`))
    ?.split('=')[1] || '';
}

function getInviteCode() {
  return window.localStorage.getItem(INVITE_CODE_KEY) || decodeURIComponent(getCookie(INVITE_CODE_KEY));
}

function setInviteCode(code) {
  const cleanCode = code.trim();
  window.localStorage.setItem(INVITE_CODE_KEY, cleanCode);
  document.cookie = `${INVITE_CODE_KEY}=${encodeURIComponent(cleanCode)}; Max-Age=2592000; SameSite=Lax; Path=/`;
}

function clearInviteCode() {
  window.localStorage.removeItem(INVITE_CODE_KEY);
  document.cookie = `${INVITE_CODE_KEY}=; Max-Age=0; SameSite=Lax; Path=/`;
}

function status(node, message, isError = false) {
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('error', isError);
}

function openCodeDialog() {
  if (!codeDialog) return;
  status(codeStatus, '');
  if (partyResults) partyResults.innerHTML = '';
  codeDialog.showModal();
}

function dismissCodeDialog() {
  if (!codeDialog) return;
  suppressInvitePrompt = true;
  codeDialog.close();
  window.setTimeout(() => { suppressInvitePrompt = false; }, 300);
}

function showPrivateContent() {
  if (accessGate) accessGate.hidden = true;
  if (privateContent) privateContent.hidden = false;
  status(gateStatus, '');
  resetLoadedAt();
  requestAnimationFrame(() => {
    privateContent?.querySelectorAll('.reveal').forEach((element) => element.classList.add('visible'));
  });
}

function showAccessGate(message = '', isError = false) {
  if (accessGate) accessGate.hidden = false;
  if (privateContent) privateContent.hidden = true;
  status(gateStatus, message, isError);
}

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  const inviteCode = getInviteCode();
  if (inviteCode) headers.set('X-Invite-Code', inviteCode);
  return fetch(path, { ...options, headers });
}

async function validateInviteCode(code) {
  const response = await fetch('/.netlify/functions/invite', {
    headers: { 'X-Invite-Code': code }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Unable to check that code.');
    error.status = response.status;
    throw error;
  }
}

async function activateParty(token) {
  await validateInviteCode(token);
  setInviteCode(token);
  codeDialog?.close();
  showPrivateContent();
  if (privatePage === 'registry') await loadRegistry();
  if (privatePage === 'rsvp') await loadRsvp();
}

function renderPartyMatches(matches) {
  if (!partyResults) return;
  partyResults.innerHTML = '';
  if (!matches.length) {
    const message = document.createElement('p');
    message.className = 'party-no-results';
    message.textContent = 'No matching party found. Try another first or last name.';
    partyResults.appendChild(message);
    return;
  }

  const heading = document.createElement('p');
  heading.className = 'party-results-label';
  heading.textContent = matches.length === 1 ? 'Is this your party?' : 'Choose your party';
  partyResults.appendChild(heading);
  matches.forEach((match) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'party-result';
    button.dataset.partyToken = match.token;
    button.textContent = match.name;
    partyResults.appendChild(button);
  });
}

async function searchParties(query) {
  const response = await fetch(`/.netlify/functions/invite?q=${encodeURIComponent(query)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to search invitations.');
  renderPartyMatches(data.matches || []);
}

function money(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function renderRegistry(items) {
  if (!registryGrid) return;
  registryGrid.innerHTML = '';
  registryEmpty.hidden = items.length > 0;

  items.forEach((item) => {
    const remaining = Math.max(Number(item.quantity || 0) - Number(item.claimed || 0), 0);
    const claimedByYou = Math.max(Number(item.claimedByYou || 0), 0);
    const availableToYou = remaining + claimedByYou;
    const claimControls = claimedByYou
      ? `<div class="registry-claim-editor">
          <button class="outline-button" type="button" data-claim-item="${escapeHtml(item.id)}" data-claim-quantity="${claimedByYou - 1}">${claimedByYou === 1 ? 'Remove' : '−'}</button>
          <span>Your claim: ${claimedByYou}</span>
          <button class="outline-button" type="button" data-claim-item="${escapeHtml(item.id)}" data-claim-quantity="${claimedByYou + 1}" ${claimedByYou >= availableToYou ? 'disabled' : ''} aria-label="Claim one more">+</button>
        </div>`
      : `<button class="button button-dark full" type="button" ${remaining ? '' : 'disabled'} data-claim-item="${escapeHtml(item.id)}" data-claim-quantity="1">${remaining ? 'Claim gift' : 'Claimed'}</button>`;
    const card = document.createElement('article');
    card.className = 'registry-card';
    card.innerHTML = `
      <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">
      <div class="registry-card-body">
        <h3>${escapeHtml(item.name)}</h3>
        <div class="registry-meta"><span>${money(item.price)}</span><span>${remaining} left</span></div>
        ${claimControls}
      </div>
    `;
    registryGrid.appendChild(card);
  });
}

async function loadRegistry() {
  if (!registryGrid || !getInviteCode()) {
    showAccessGate();
    return;
  }

  showPrivateContent();
  status(registryStatus, 'Loading registry…');
  registryGrid.setAttribute('aria-busy', 'true');

  try {
    const response = await apiFetch('/.netlify/functions/registry');
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'Unable to load registry.');
      error.status = response.status;
      throw error;
    }
    renderRegistry(data.items || []);
    status(registryStatus, '');
  } catch (error) {
    renderRegistry([]);
    if (error.status === 401) {
      clearInviteCode();
      showAccessGate('We couldn’t find that party. Please search again.', true);
    } else {
      status(registryStatus, 'The live registry is temporarily unavailable. Please try again later.', true);
    }
  } finally {
    registryGrid.removeAttribute('aria-busy');
  }
}

async function updateGiftClaim(itemId, quantity) {
  if (!getInviteCode()) {
    showAccessGate();
    openCodeDialog();
    return;
  }

  status(registryStatus, 'Updating your gift claim…');
  try {
    const response = await apiFetch('/.netlify/functions/registry-claim', {
      method: 'POST',
      body: JSON.stringify({ itemId, quantity })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'Unable to claim gift.');
      error.status = response.status;
      throw error;
    }
    await loadRegistry();
    status(registryStatus, quantity ? 'Your gift claim has been updated.' : 'Your gift claim has been removed.');
  } catch (error) {
    if (error.status === 401) {
      clearInviteCode();
      showAccessGate('That party is no longer available. Please search again.', true);
    } else {
      status(registryStatus, error.message, true);
    }
  }
}

document.querySelectorAll('[data-open-code]').forEach((button) => {
  button.addEventListener('click', openCodeDialog);
});

document.querySelectorAll('[data-change-code]').forEach((button) => {
  button.addEventListener('click', () => {
    clearInviteCode();
    showAccessGate();
    openCodeDialog();
  });
});

document.querySelector('[data-close-code]')?.addEventListener('click', dismissCodeDialog);

codeDialog?.addEventListener('cancel', () => {
  suppressInvitePrompt = true;
  window.setTimeout(() => { suppressInvitePrompt = false; }, 300);
});

codeForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (suppressInvitePrompt) return;

  const query = String(new FormData(codeForm).get('partySearch') || '').trim();
  if (query.length < 2) {
    status(codeStatus, 'Enter at least two letters of your name.', true);
    return;
  }

  const submitButton = codeForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  status(codeStatus, 'Searching invitations…');

  try {
    await searchParties(query);
    status(codeStatus, '');
  } catch (error) {
    status(codeStatus, 'We couldn’t search invitations right now. Please try again shortly.', true);
  } finally {
    submitButton.disabled = false;
  }
});

partyResults?.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-party-token]');
  if (!button) return;
  button.disabled = true;
  status(codeStatus, 'Opening your party…');
  try {
    await activateParty(button.dataset.partyToken);
  } catch (error) {
    status(codeStatus, 'We couldn’t open that party. Please search again.', true);
    button.disabled = false;
  }
});

document.querySelector('[data-refresh-registry]')?.addEventListener('click', loadRegistry);

registryGrid?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-claim-item]');
  if (button) updateGiftClaim(button.dataset.claimItem, Number(button.dataset.claimQuantity));
});

function fillRsvpForm(values) {
  if (!rsvpForm || !values) return;
  Object.entries(values).forEach(([name, value]) => {
    const field = rsvpForm.elements.namedItem(name);
    if (field) field.value = value ?? '';
  });
}

async function loadRsvp() {
  if (!rsvpForm || !getInviteCode()) return;
  status(rsvpStatus, 'Loading your RSVP…');
  try {
    const response = await apiFetch('/.netlify/functions/rsvp');
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'Unable to load RSVP.');
      error.status = response.status;
      throw error;
    }
    if (data.rsvp) {
      fillRsvpForm(data.rsvp);
      if (rsvpSubmit) rsvpSubmit.innerHTML = 'Update our RSVP <span>→</span>';
      status(rsvpStatus, 'Your saved RSVP is ready to edit.');
    } else {
      if (rsvpSubmit) rsvpSubmit.innerHTML = 'Send our RSVP <span>→</span>';
      status(rsvpStatus, '');
    }
    resetLoadedAt();
  } catch (error) {
    if (error.status === 401) {
      clearInviteCode();
      showAccessGate('We couldn’t find that party. Please search again.', true);
    } else {
      status(rsvpStatus, error.message, true);
    }
  }
}

rsvpForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!getInviteCode()) {
    showAccessGate();
    openCodeDialog();
    return;
  }

  const payload = Object.fromEntries(new FormData(rsvpForm).entries());
  status(rsvpStatus, 'Sending RSVP…');
  try {
    const response = await apiFetch('/.netlify/functions/rsvp', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'Unable to send RSVP.');
      error.status = response.status;
      throw error;
    }
    status(rsvpStatus, data.updated ? 'RSVP updated. Thank you.' : 'RSVP received. Thank you.');
    if (rsvpSubmit) rsvpSubmit.innerHTML = 'Update our RSVP <span>→</span>';
    resetLoadedAt();
  } catch (error) {
    if (error.status === 401) {
      clearInviteCode();
      showAccessGate('We couldn’t find that party. Please search again.', true);
    } else {
      status(rsvpStatus, error.message, true);
    }
  }
});

if (privatePage) {
  if (getInviteCode()) {
    showPrivateContent();
    if (privatePage === 'registry') loadRegistry();
    if (privatePage === 'rsvp') loadRsvp();
  } else {
    showAccessGate();
  }
}
