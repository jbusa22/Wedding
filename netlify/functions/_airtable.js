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

function codepoints(value) {
  return Array.from(String(value || ''))
    .map((char) => char.charCodeAt(0).toString(16).padStart(4, '0'))
    .join(' ');
}

async function airtableRequest(url) {
  const token = getToken();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    data
  };
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

async function inspectAirtableConfig() {
  const checks = [
    ['Invites', 'AIRTABLE_INVITES_BASE_ID', 'AIRTABLE_INVITES_TABLE'],
    ['Registry', 'AIRTABLE_REGISTRY_BASE_ID', 'AIRTABLE_REGISTRY_TABLE'],
    ['RSVP', 'AIRTABLE_RSVP_BASE_ID', 'AIRTABLE_RSVP_TABLE']
  ];

  const diagnostics = {
    tokenConfigured: Boolean(process.env.AIRTABLE_TOKEN),
    checks: []
  };

  for (const [label, baseEnvName, tableEnvName] of checks) {
    const baseId = process.env[baseEnvName] || '';
    const table = process.env[tableEnvName] || '';
    const check = {
      label,
      baseEnvName,
      baseId,
      tableEnvName,
      table,
      tableCodepoints: codepoints(table)
    };

    if (!baseId || !table) {
      check.error = `${baseEnvName} or ${tableEnvName} is missing.`;
      diagnostics.checks.push(check);
      continue;
    }

    const metadata = await airtableRequest(`${AIRTABLE_API}/meta/bases/${encodeURIComponent(baseId)}/tables`);
    check.metadataStatus = metadata.status;

    if (metadata.ok) {
      const tables = metadata.data.tables || [];
      const matchedTable = tables.find((item) => item.name === table || item.id === table);
      check.availableTables = tables.map((item) => item.name);
      check.matchedTable = Boolean(matchedTable);
      check.fields = matchedTable
        ? matchedTable.fields.map((field) => ({
          name: field.name,
          codepoints: codepoints(field.name)
        }))
        : [];
    } else {
      check.metadataError = metadata.data.error || metadata.data;
      const records = await airtableRequest(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?maxRecords=1`);
      check.recordsStatus = records.status;
      check.recordsError = records.ok ? null : records.data.error || records.data;
      check.sampleFields = records.ok
        ? (records.data.records || []).map((record) => Object.keys(record.fields || {}))
        : [];
    }

    diagnostics.checks.push(check);
  }

  const invitesBaseId = process.env.AIRTABLE_INVITES_BASE_ID || '';
  const invitesTable = process.env.AIRTABLE_INVITES_TABLE || '';
  if (invitesBaseId && invitesTable) {
    const formula = encodeURIComponent("{Invite Code} = 'DIAGNOSTIC_TEST'");
    const formulaResult = await airtableRequest(`${AIRTABLE_API}/${encodeURIComponent(invitesBaseId)}/${encodeURIComponent(invitesTable)}?maxRecords=1&filterByFormula=${formula}`);
    diagnostics.inviteFormulaTest = {
      status: formulaResult.status,
      ok: formulaResult.ok,
      error: formulaResult.ok ? null : formulaResult.data.error || formulaResult.data
    };
  }

  return diagnostics;
}

async function validateInviteCode(inviteCode) {
  if (!inviteCode || inviteCode.length < 3 || inviteCode.length > 40) return false;
  const table = process.env.AIRTABLE_INVITES_TABLE;
  if (!table) return true;

  const formula = encodeURIComponent(`{Invite Code} = '${escapeFormulaValue(inviteCode)}'`);
  let data;
  try {
    data = await airtableFetch('AIRTABLE_INVITES_BASE_ID', table, `?maxRecords=1&filterByFormula=${formula}`);
  } catch (error) {
    if (/Unknown field names/i.test(error.message || '')) {
      throw new Error('Invite validation is misconfigured. Check that AIRTABLE_INVITES_BASE_ID points to the Invites base, AIRTABLE_INVITES_TABLE points to the Invites table, and that table has a field named "Invite Code".');
    }
    throw error;
  }
  return Array.isArray(data.records) && data.records.length > 0;
}

module.exports = {
  airtableFetch,
  json,
  inspectAirtableConfig,
  normalize,
  readInviteCode,
  required,
  validateInviteCode
};

