const { airtableFetch, json, normalize, readInviteCode, validateInviteCode } = require('./_airtable');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' });

  try {
    const inviteCode = readInviteCode(event);
    if (!(await validateInviteCode(inviteCode))) return json(401, { error: 'Invite code not recognized.' });

    const table = process.env.AIRTABLE_REGISTRY_TABLE || 'Registry';
    const data = await airtableFetch('AIRTABLE_REGISTRY_BASE_ID', table, '?sort%5B0%5D%5Bfield%5D=Name&sort%5B0%5D%5Bdirection%5D=asc');
    const items = (data.records || []).map((record) => ({
      id: record.id,
      name: normalize(record.fields.Name),
      image: Array.isArray(record.fields.Image) ? record.fields.Image[0]?.url : normalize(record.fields.Image),
      price: Number(record.fields.Price || 0),
      quantity: Number(record.fields.Quantity || 1),
      claimed: Number(record.fields.Claimed || 0)
    })).filter((item) => item.name);

    return json(200, { items });
  } catch (error) {
    return json(500, { error: error.message || 'Unable to load registry.' });
  }
};
