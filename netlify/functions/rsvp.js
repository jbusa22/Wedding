const { airtableFetch, getAirtableFieldName, json, normalize, normalizeZip, readInviteCode, required, validateInviteCode } = require('./_airtable');

const tableName = () => process.env.AIRTABLE_RSVP_TABLE || 'RSVPs';

async function findRsvp(inviteCode, inviteCodeField) {
  const formula = encodeURIComponent(`{${inviteCodeField}} = '${String(inviteCode).replace(/'/g, "\\'")}'`);
  const data = await airtableFetch('AIRTABLE_RSVP_BASE_ID', tableName(), `?maxRecords=1&filterByFormula=${formula}`);
  return data.records?.[0] || null;
}

function serializeRsvp(record) {
  if (!record) return null;
  const fields = record.fields || {};
  return {
    primaryName: normalize(fields['Primary Name']),
    email: normalize(fields.Email),
    phone: normalize(fields.Phone),
    street: normalize(fields['Street Address']),
    city: normalize(fields.City),
    state: normalize(fields.State),
    zip: normalize(fields.Zip),
    attending: normalize(fields.Attending),
    guestNames: normalize(fields['Guest Names']),
    mealChoices: normalize(fields['Meal Choices']),
    dietaryRestrictions: normalize(fields['Dietary Restrictions']),
    songRequest: normalize(fields['Song Request']),
    notes: normalize(fields.Notes)
  };
}

exports.handler = async (event) => {
  if (!['GET', 'POST'].includes(event.httpMethod)) return json(405, { error: 'Method not allowed.' });

  try {
    const payload = event.httpMethod === 'POST' ? JSON.parse(event.body || '{}') : {};
    const inviteCode = readInviteCode(event, payload);

    if (!(await validateInviteCode(inviteCode))) return json(401, { error: 'Invite code not recognized.' });

    const table = tableName();
    const inviteCodeField = await getAirtableFieldName('AIRTABLE_RSVP_BASE_ID', table, 'Invite Code');
    const existing = await findRsvp(inviteCode, inviteCodeField);
    if (event.httpMethod === 'GET') return json(200, { rsvp: serializeRsvp(existing) });

    if (normalize(payload.website)) return json(400, { error: 'Unable to submit RSVP.' });
    if (Date.now() - Number(payload.loadedAt || 0) < 3000) return json(400, { error: 'Please wait a few seconds before trying again.' });

    const missing = required(payload, ['primaryName', 'email', 'street', 'city', 'state', 'zip', 'attending']);
    if (missing) return json(400, { error: missing });

    await airtableFetch('AIRTABLE_RSVP_BASE_ID', table, '', {
      method: existing ? 'PATCH' : 'POST',
      body: JSON.stringify({
        records: [{
          ...(existing ? { id: existing.id } : {}),
          fields: {
            [inviteCodeField]: inviteCode,
            'Primary Name': normalize(payload.primaryName),
            Email: normalize(payload.email),
            Phone: normalize(payload.phone),
            'Street Address': normalize(payload.street),
            City: normalize(payload.city),
            State: normalize(payload.state).toUpperCase(),
            Zip: normalizeZip(payload.zip),
            Attending: normalize(payload.attending),
            'Guest Names': normalize(payload.guestNames),
            'Meal Choices': normalize(payload.mealChoices),
            'Dietary Restrictions': normalize(payload.dietaryRestrictions),
            'Song Request': normalize(payload.songRequest),
            Notes: normalize(payload.notes),
            'Submitted At': new Date().toISOString()
          }
        }]
      })
    });

    return json(200, { ok: true, updated: Boolean(existing) });
  } catch (error) {
    return json(500, { error: error.message || 'Unable to submit RSVP.' });
  }
};
