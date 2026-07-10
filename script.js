const INVITE_CODE_KEY = 'weddingInviteCode';

const header = document.querySelector('.site-header');
const progressBar = document.querySelector('.page-progress span');
const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');
const codeDialog = document.querySelector('#code-dialog');
const codeForm = document.querySelector('#code-form');
const codeStatus = document.querySelector('[data-code-status]');
const accessGate = document.querySelector('[data-access-gate]');
const gateStatus = document.querySelector('[data-gate-status]');
const privateContent = document.querySelector('[data-private-content]');
const registryGrid = document.querySelector('#registry-grid');
const registryEmpty = document.querySelector('[data-registry-empty]');
const registryStatus = document.querySelector('[data-registry-status]');
const rsvpForm = document.querySelector('#rsvp-form');
const rsvpStatus = document.querySelector('[data-rsvp-status]');
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
    const card = document.createElement('article');
    card.className = 'registry-card';
    card.innerHTML = `
      <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">
      <div class="registry-card-body">
        <h3>${escapeHtml(item.name)}</h3>
        <div class="registry-meta"><span>${money(item.price)}</span><span>${remaining} left</span></div>
        <button class="button button-dark full" type="button" ${remaining ? '' : 'disabled'} data-claim="${escapeHtml(item.id)}">${remaining ? 'Claim gift' : 'Claimed'}</button>
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
      showAccessGate('That invite code wasn’t recognized. Please try again.', true);
    } else {
      status(registryStatus, 'The live registry is temporarily unavailable. Please try again later.', true);
    }
  } finally {
    registryGrid.removeAttribute('aria-busy');
  }
}

async function claimGift(itemId) {
  if (!getInviteCode()) {
    showAccessGate();
    openCodeDialog();
    return;
  }

  status(registryStatus, 'Claiming gift…');
  try {
    const response = await apiFetch('/.netlify/functions/registry-claim', {
      method: 'POST',
      body: JSON.stringify({ itemId })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'Unable to claim gift.');
      error.status = response.status;
      throw error;
    }
    status(registryStatus, 'Gift claimed. Thank you.');
    await loadRegistry();
  } catch (error) {
    if (error.status === 401) {
      clearInviteCode();
      showAccessGate('That invite code is no longer valid. Please try again.', true);
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

  const code = String(new FormData(codeForm).get('inviteCode') || '').trim();
  if (code.length < 3) {
    status(codeStatus, 'Enter the code from your invitation.', true);
    return;
  }

  const submitButton = codeForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  status(codeStatus, 'Checking your code…');

  try {
    await validateInviteCode(code);
    setInviteCode(code);
    codeDialog.close();
    showPrivateContent();
    if (privatePage === 'registry') await loadRegistry();
  } catch (error) {
    status(codeStatus, error.status === 401 ? 'That code wasn’t recognized. Check the invitation and try again.' : 'We couldn’t check that code right now. Please try again shortly.', true);
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector('[data-refresh-registry]')?.addEventListener('click', loadRegistry);

registryGrid?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-claim]');
  if (button) claimGift(button.dataset.claim);
});

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
    status(rsvpStatus, 'RSVP received. Thank you.');
    rsvpForm.reset();
    resetLoadedAt();
  } catch (error) {
    if (error.status === 401) {
      clearInviteCode();
      showAccessGate('That invite code wasn’t recognized. Please try again.', true);
    } else {
      status(rsvpStatus, error.message, true);
    }
  }
});

if (privatePage) {
  if (getInviteCode()) {
    showPrivateContent();
    if (privatePage === 'registry') loadRegistry();
  } else {
    showAccessGate();
  }
}
