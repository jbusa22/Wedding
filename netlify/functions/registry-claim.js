const { airtableFetch, json, normalize, readInviteCode, validateInviteCode } = require('./_airtable');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });

  try {
    const payload = JSON.parse(event.body || '{}');
    const inviteCode = readInviteCode(event, payload);
    const itemId = normalize(payload.itemId);
    const requestedQuantity = Number(payload.quantity);
    if (!(await validateInviteCode(inviteCode))) return json(401, { error: 'Invite code not recognized.' });
    if (!itemId) return json(400, { error: 'Gift is required.' });
    if (!Number.isInteger(requestedQuantity) || requestedQuantity < 0) return json(400, { error: 'Choose a valid gift quantity.' });

    const table = process.env.AIRTABLE_REGISTRY_TABLE || 'Registry';
    const current = await airtableFetch('AIRTABLE_REGISTRY_BASE_ID', table, `/${encodeURIComponent(itemId)}`);
    const quantity = Number(current.fields.Quantity || 1);
    const claimed = Number(current.fields.Claimed || 0);
    let claims = {};
    try { claims = JSON.parse(normalize(current.fields['Claims By Party']) || '{}'); } catch { claims = {}; }
    const currentPartyQuantity = Number(claims[inviteCode] || 0);
    const nextClaimed = Math.max(0, claimed - currentPartyQuantity + requestedQuantity);
    if (requestedQuantity > quantity || nextClaimed > quantity) return json(409, { error: 'That many gifts are not available.' });
    if (requestedQuantity) claims[inviteCode] = requestedQuantity;
    else delete claims[inviteCode];

    await airtableFetch('AIRTABLE_REGISTRY_BASE_ID', table, '', {
      method: 'PATCH',
      body: JSON.stringify({
        records: [{
          id: itemId,
          fields: {
            Claimed: nextClaimed,
            'Claims By Party': JSON.stringify(claims),
            'Last Claimed By Code': inviteCode,
            'Last Claimed At': new Date().toISOString()
          }
        }]
      })
    });

    return json(200, { ok: true, quantity: requestedQuantity });
  } catch (error) {
    return json(500, { error: error.message || 'Unable to claim gift.' });
  }
};
