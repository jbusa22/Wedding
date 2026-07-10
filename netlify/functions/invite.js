const { json, readInviteCode, validateInviteCode } = require('./_airtable');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' });

  try {
    const inviteCode = readInviteCode(event);
    if (!(await validateInviteCode(inviteCode))) return json(401, { error: 'Invite code not recognized.' });
    return json(200, { ok: true });
  } catch (error) {
    return json(500, { error: error.message || 'Unable to check invite code.' });
  }
};
