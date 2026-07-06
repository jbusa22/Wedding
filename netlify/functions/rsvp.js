const { airtableFetch, getAirtableFieldName, json, normalize, readInviteCode, required, validateInviteCode } = require('./_airtable');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });

  try {
    const payload = JSON.parse(event.body || '{}');
    const inviteCode = readInviteCode(event, payload);

    if (normalize(payload.website)) return json(400, { error: 'Unable to submit RSVP.' });
    if (Date.now() - Number(payload.loadedAt || 0) < 3000) return json(400, { error: 'Please try submitting again.' });
    if (!(await validateInviteCode(inviteCode))) return json(401, { error: 'Invite code not recognized.' });

    const missing = required(payload, ['primaryName', 'email', 'street', 'city', 'state', 'zip', 'attending']);
    if (missing) return json(400, { error: missing });

    const table = process.env.AIRTABLE_RSVP_TABLE || 'RSVPs';
    const inviteCodeField = await getAirtableFieldName('AIRTABLE_RSVP_BASE_ID', table, 'Invite Code');
    await airtableFetch('AIRTABLE_RSVP_BASE_ID', table, '', {
      method: 'POST',
      body: JSON.stringify({
        records: [{
          fields: {
            [inviteCodeField]: inviteCode,
            'Primary Name': normalize(payload.primaryName),
            Email: normalize(payload.email),
            Phone: normalize(payload.phone),
            'Street Address': normalize(payload.street),
            City: normalize(payload.city),
            State: normalize(payload.state).toUpperCase(),
            Zip: normalize(payload.zip),
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

    return json(200, { ok: true });
  } catch (error) {
    return json(500, { error: error.message || 'Unable to submit RSVP.' });
  }
};
