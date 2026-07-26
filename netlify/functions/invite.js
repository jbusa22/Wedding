const { json, readInviteCode, searchInvites, validateInviteCode } = require('./_airtable');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' });

  try {
    const query = String(event.queryStringParameters?.q || '').trim();
    if (query) {
      if (query.length < 2) return json(400, { error: 'Enter at least two letters of your name.' });
      return json(200, { matches: await searchInvites(query) });
    }

    const inviteCode = readInviteCode(event);
    if (!(await validateInviteCode(inviteCode))) return json(401, { error: 'Invite code not recognized.' });
    return json(200, { ok: true });
  } catch (error) {
    return json(500, { error: error.message || 'Unable to check invite code.' });
  }
};
