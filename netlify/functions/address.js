const { airtableFetch, findInvite, json, normalize, normalizeZip, readInviteCode, required } = require('./_airtable');
const tableName = () => process.env.AIRTABLE_INVITES_TABLE;

function serializeAddress(invite) {
  const fields = invite?.fields || {};
  return { street: normalize(fields['Street Address']), city: normalize(fields.City), state: normalize(fields.State), zip: normalize(fields.Zip) };
}

exports.handler = async (event) => {
  if (!['GET', 'POST'].includes(event.httpMethod)) return json(405, { error: 'Method not allowed.' });
  try {
    const payload = event.httpMethod === 'POST' ? JSON.parse(event.body || '{}') : {};
    const inviteCode = readInviteCode(event, payload);
    const invite = await findInvite(inviteCode);
    if (!invite) return json(401, { error: 'Invitation not recognized.' });
    if (!tableName()) return json(503, { error: 'Address collection is not configured yet.' });
    if (event.httpMethod === 'GET') return json(200, { householdName: normalize(invite.fields?.['Household Name']), address: serializeAddress(invite) });
    if (normalize(payload.website)) return json(400, { error: 'Unable to save that address.' });
    if (Date.now() - Number(payload.loadedAt || 0) < 1200) return json(400, { error: 'Please wait a moment and try again.' });
    if (required(payload, ['street', 'city', 'state', 'zip'])) return json(400, { error: 'Please complete the full mailing address.' });
    await airtableFetch('AIRTABLE_INVITES_BASE_ID', tableName(), '', {
      method: 'PATCH',
      body: JSON.stringify({ records: [{ id: invite.id, fields: {
        'Street Address': normalize(payload.street), City: normalize(payload.city), State: normalize(payload.state).toUpperCase(), Zip: normalizeZip(payload.zip), 'Address Updated At': new Date().toISOString()
      } }] })
    });
    return json(200, { ok: true });
  } catch (error) {
    return json(500, { error: error.message || 'Unable to save that address.' });
  }
};
