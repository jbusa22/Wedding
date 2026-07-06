const { airtableFetch, json, normalize, readInviteCode, validateInviteCode } = require('./_airtable');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });

  try {
    const payload = JSON.parse(event.body || '{}');
    const inviteCode = readInviteCode(event, payload);
    const itemId = normalize(payload.itemId);
    if (!(await validateInviteCode(inviteCode))) return json(401, { error: 'Invite code not recognized.' });
    if (!itemId) return json(400, { error: 'Gift is required.' });

    const table = process.env.AIRTABLE_REGISTRY_TABLE || 'Registry';
    const current = await airtableFetch('AIRTABLE_REGISTRY_BASE_ID', table, `/${encodeURIComponent(itemId)}`);
    const quantity = Number(current.fields.Quantity || 1);
    const claimed = Number(current.fields.Claimed || 0);
    if (claimed >= quantity) return json(409, { error: 'This gift has already been fully claimed.' });

    await airtableFetch('AIRTABLE_REGISTRY_BASE_ID', table, '', {
      method: 'PATCH',
      body: JSON.stringify({
        records: [{
          id: itemId,
          fields: {
            Claimed: claimed + 1,
            'Last Claimed By Code': inviteCode,
            'Last Claimed At': new Date().toISOString()
          }
        }]
      })
    });

    return json(200, { ok: true });
  } catch (error) {
    return json(500, { error: error.message || 'Unable to claim gift.' });
  }
};
