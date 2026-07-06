const AIRTABLE_API = 'https://api.airtable.com/v0';

function getToken() {
  const { AIRTABLE_TOKEN } = process.env;
  if (!AIRTABLE_TOKEN) {
    throw new Error('AIRTABLE_TOKEN is not configured.');
  }
  return AIRTABLE_TOKEN;
}

function getBaseId(baseIdEnvName) {
  const baseId = process.env[baseIdEnvName];
  if (!baseId) {
    throw new Error(`${baseIdEnvName} is not configured.`);
  }
  return baseId;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

function readCookie(header, name) {
  return String(header || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.split('=')[1] || '';
}

function readInviteCode(event, payload = {}) {
  const cookieCode = readCookie(event.headers.cookie, 'weddingInviteCode');
  return String(event.headers['x-invite-code'] || payload.inviteCode || decodeURIComponent(cookieCode) || '').trim();
}

function normalize(value) {
  return String(value || '').trim();
}

function required(payload, fields) {
  const missing = fields.filter((field) => !normalize(payload[field]));
  if (missing.length) {
    return `${missing.join(', ')} required.`;
  }
  return '';
}

function escapeFormulaValue(value) {
  return String(value).replace(/'/g, "\\'");
}

async function airtableFetch(baseIdEnvName, table, path = '', options = {}) {
  const token = getToken();
  const baseId = getBaseId(baseIdEnvName);
  const tableName = encodeURIComponent(table);
  const response = await fetch(`${AIRTABLE_API}/${baseId}/${tableName}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || 'Airtable request failed.');
  }
  return data;
}

async function validateInviteCode(inviteCode) {
  if (!inviteCode || inviteCode.length < 3 || inviteCode.length > 40) return false;
  const table = process.env.AIRTABLE_INVITES_TABLE;
  if (!table) return true;

  const formula = encodeURIComponent(`{Invite Code} = '${escapeFormulaValue(inviteCode)}'`);
  const data = await airtableFetch('AIRTABLE_INVITES_BASE_ID', table, `?maxRecords=1&filterByFormula=${formula}`);
  return Array.isArray(data.records) && data.records.length > 0;
}

module.exports = {
  airtableFetch,
  json,
  normalize,
  readInviteCode,
  required,
  validateInviteCode
};

