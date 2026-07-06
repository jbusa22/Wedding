const INVITE_CODE_KEY = 'weddingInviteCode';
const codeDialog = document.querySelector('#code-dialog');
const codeForm = document.querySelector('#code-form');
const codeStatus = document.querySelector('[data-code-status]');
const registryGrid = document.querySelector('#registry-grid');
const registryStatus = document.querySelector('[data-registry-status]');
const rsvpStatus = document.querySelector('[data-rsvp-status]');
const loadedAtInput = document.querySelector('[data-loaded-at]');

loadedAtInput.value = String(Date.now());

const demoRegistryItems = [
  { id: 'demo-1', name: 'Dinnerware Set', image: 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=900&q=80', price: 120, quantity: 2, claimed: 0 },
  { id: 'demo-2', name: 'Honeymoon Fund', image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80', price: 75, quantity: 20, claimed: 4 },
  { id: 'demo-3', name: 'Espresso Machine', image: 'https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?auto=format&fit=crop&w=900&q=80', price: 450, quantity: 1, claimed: 0 }
];

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

function openCodeDialog() {
  codeStatus.textContent = '';
  codeStatus.classList.remove('error');
  codeDialog.showModal();
}

function ensureInviteCode() {
  if (!getInviteCode()) openCodeDialog();
}

function status(node, message, isError = false) {
  node.textContent = message;
  node.classList.toggle('error', isError);
}

function formatDiagnostics(diagnostics) {
  if (!diagnostics) return '';
  return `\n\nAirtable diagnostics:\n${JSON.stringify(diagnostics, null, 2)}`;
}

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  const inviteCode = getInviteCode();
  if (inviteCode) headers.set('X-Invite-Code', inviteCode);
  return fetch(path, { ...options, headers });
}

function money(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function renderRegistry(items) {
  registryGrid.innerHTML = '';
  const visibleItems = items.length ? items : demoRegistryItems;
  visibleItems.forEach((item) => {
    const remaining = Math.max(Number(item.quantity || 0) - Number(item.claimed || 0), 0);
    const card = document.createElement('article');
    card.className = 'registry-card';
    card.innerHTML = `
      <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">
      <div class="registry-card-body">
        <h3>${escapeHtml(item.name)}</h3>
        <div class="registry-meta"><span>${money(item.price)}</span><span>${remaining} left</span></div>
        <button class="primary-button full" type="button" ${remaining ? '' : 'disabled'} data-claim="${escapeHtml(item.id)}">${remaining ? 'Claim Gift' : 'Claimed'}</button>
      </div>
    `;
    registryGrid.appendChild(card);
  });
}

async function loadRegistry() {
  if (!getInviteCode()) {
    renderRegistry([]);
    status(registryStatus, 'Enter your invite code to load the live registry.');
    return;
  }

  status(registryStatus, 'Loading registry...');
  try {
    const response = await apiFetch('/.netlify/functions/registry');
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || 'Unable to load registry.');
      error.diagnostics = data.diagnostics;
      throw error;
    }
    renderRegistry(data.items || []);
    status(registryStatus, '');
  } catch (error) {
    renderRegistry([]);
    status(registryStatus, `${error.message} Showing sample gifts for now.${formatDiagnostics(error.diagnostics)}`, true);
  }
}

async function claimGift(itemId) {
  ensureInviteCode();
  if (!getInviteCode()) return;
  status(registryStatus, 'Claiming gift...');
  try {
    const response = await apiFetch('/.netlify/functions/registry-claim', {
      method: 'POST',
      body: JSON.stringify({ itemId })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to claim gift.');
    status(registryStatus, 'Gift claimed. Thank you.');
    await loadRegistry();
  } catch (error) {
    status(registryStatus, error.message, true);
  }
}

document.querySelectorAll('[data-open-code]').forEach((button) => {
  button.addEventListener('click', openCodeDialog);
});

codeForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(codeForm);
  const code = String(formData.get('inviteCode') || '').trim();
  if (code.length < 3) {
    status(codeStatus, 'Enter the code from your invitation.', true);
    return;
  }
  setInviteCode(code);
  codeDialog.close();
  loadRegistry();
});

document.querySelectorAll('[data-protected]').forEach((section) => {
  section.addEventListener('focusin', ensureInviteCode);
});

document.querySelectorAll('a[href="#rsvp"], a[href="#registry"]').forEach((link) => {
  link.addEventListener('click', () => setTimeout(ensureInviteCode, 200));
});

document.querySelector('[data-refresh-registry]').addEventListener('click', loadRegistry);

registryGrid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-claim]');
  if (!button) return;
  claimGift(button.dataset.claim);
});

document.querySelector('#rsvp-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  ensureInviteCode();
  if (!getInviteCode()) return;

  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  status(rsvpStatus, 'Sending RSVP...');
  try {
    const response = await apiFetch('/.netlify/functions/rsvp', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to send RSVP.');
    status(rsvpStatus, 'RSVP received. Thank you.');
    form.reset();
    loadedAtInput.value = String(Date.now());
  } catch (error) {
    status(rsvpStatus, error.message, true);
  }
});

renderRegistry([]);
if (getInviteCode()) loadRegistry();


