const { airtableFetch, json, normalize, required } = require('./_airtable');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
  try {
    const payload = JSON.parse(event.body || '{}');
    if (!process.env.AIRTABLE_INVITES_TABLE) return json(503, { error: 'Address collection is not configured yet.' });
    if (normalize(payload.website)) return json(400, { error: 'Unable to save that address.' });
    if (Date.now() - Number(payload.loadedAt || 0) < 1200) return json(400, { error: 'Please wait a moment and try again.' });
    if (required(payload, ['name', 'street', 'city', 'state', 'zip'])) return json(400, { error: 'Please enter your name and complete mailing address.' });
    await airtableFetch('AIRTABLE_INVITES_BASE_ID', process.env.AIRTABLE_INVITES_TABLE, '', {
      method: 'POST',
      body: JSON.stringify({ records: [{ fields: {
        'Household Name': normalize(payload.name), 'Street Address': normalize(payload.street),
        City: normalize(payload.city), State: normalize(payload.state).toUpperCase(),
        Zip: normalize(payload.zip), 'Address Updated At': new Date().toISOString()
      } }] })
    });
    return json(200, { ok: true });
  } catch (error) {
    return json(500, { error: error.message || 'Unable to save that address.' });
  }
};
