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

function normalizeZip(value) {
  const cleanValue = normalize(value);
  if (/^\d+$/.test(cleanValue)) return Number(cleanValue);
  return cleanValue;
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

function invitePartyName(record) {
  return normalize(record?.fields?.['Party Names'] || record?.fields?.['Invite Code']);
}

async function findInvite(inviteCode) {
  if (!inviteCode || inviteCode.length < 2 || inviteCode.length > 120) return null;
  const table = process.env.AIRTABLE_INVITES_TABLE;
  if (!table) return { id: inviteCode, fields: { 'Party Names': inviteCode } };

  if (/^rec[a-zA-Z0-9]{10,}$/.test(inviteCode)) {
    try {
      return await airtableFetch('AIRTABLE_INVITES_BASE_ID', table, `/${encodeURIComponent(inviteCode)}`);
    } catch (error) {
      if (/not found/i.test(error.message || '')) return null;
      throw error;
    }
  }

  const formula = encodeURIComponent(`{Party Names} = '${escapeFormulaValue(inviteCode)}'`);
  let data;
  try {
    data = await airtableFetch('AIRTABLE_INVITES_BASE_ID', table, `?maxRecords=1&filterByFormula=${formula}`);
  } catch (error) {
    if (/Unknown field names/i.test(error.message || '')) {
      const legacyFormula = encodeURIComponent(`{Invite Code} = '${escapeFormulaValue(inviteCode)}'`);
      try {
        data = await airtableFetch('AIRTABLE_INVITES_BASE_ID', table, `?maxRecords=1&filterByFormula=${legacyFormula}`);
      } catch (legacyError) {
        if (/Unknown field names/i.test(legacyError.message || '')) return null;
        throw legacyError;
      }
    } else {
      throw error;
    }
  }
  return data.records?.[0] || null;
}

function matchScore(name, query) {
  const candidate = name.toLocaleLowerCase();
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (candidate === terms.join(' ')) return 0;
  if (terms.some((term) => candidate.split(/[^a-z0-9]+/).includes(term))) return 1;
  if (terms.every((term) => candidate.includes(term))) return 2;
  return 3;
}

async function searchInvites(query) {
  const cleanQuery = normalize(query);
  if (cleanQuery.length < 2 || cleanQuery.length > 80) return [];
  const table = process.env.AIRTABLE_INVITES_TABLE;
  if (!table) return [{ token: cleanQuery, name: cleanQuery }];

  const formula = encodeURIComponent(`SEARCH(LOWER('${escapeFormulaValue(cleanQuery)}'), LOWER({Party Names}))`);
  let data;
  try {
    data = await airtableFetch('AIRTABLE_INVITES_BASE_ID', table, `?maxRecords=10&filterByFormula=${formula}`);
  } catch (error) {
    if (/Unknown field names/i.test(error.message || '')) {
      throw new Error('Invite search is misconfigured. Add a "Party Names" field to the Invites table.');
    }
    throw error;
  }

  return (data.records || [])
    .map((record) => {
      const name = invitePartyName(record);
      return { token: name, name };
    })
    .filter((match) => match.name)
    .sort((a, b) => matchScore(a.name, cleanQuery) - matchScore(b.name, cleanQuery) || a.name.localeCompare(b.name));
}

function codepoints(value) {
  return Array.from(String(value || ''))
    .map((char) => char.charCodeAt(0).toString(16).padStart(4, '0'))
    .join(' ');
}

function stripLeadingBom(value) {
  return String(value || '').replace(/^\uFEFF/, '');
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

async function getAirtableFieldName(baseIdEnvName, table, fieldName) {
  const baseId = getBaseId(baseIdEnvName);
  const metadata = await airtableRequest(`${AIRTABLE_API}/meta/bases/${encodeURIComponent(baseId)}/tables`);
  if (!metadata.ok) return fieldName;

  const matchedTable = (metadata.data.tables || []).find((item) => item.name === table || item.id === table);
  const matchedField = matchedTable?.fields.find((field) => stripLeadingBom(field.name) === fieldName);
  return matchedField?.name || fieldName;
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
  return Boolean(await findInvite(inviteCode));
}

module.exports = {
  airtableFetch,
  getAirtableFieldName,
  findInvite,
  json,
  inspectAirtableConfig,
  normalize,
  normalizeZip,
  readInviteCode,
  required,
  searchInvites,
  validateInviteCode
};

