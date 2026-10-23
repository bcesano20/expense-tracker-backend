const { resolveTimeZone } = require('../utils/timeZone');

// The frontend sends the browser's timezone in the X-Timezone header on every request
// (Intl.DateTimeFormat().resolvedOptions().timeZone). The server clock is UTC, so this is the
// only way to know what "the current month" is for the user. Missing or invalid values fall
// back to the default zone, so this middleware never rejects a request.
const timeZoneMiddleware = (req, res, next) => {
  req.timeZone = resolveTimeZone(req.get('x-timezone'));
  next();
};

module.exports = timeZoneMiddleware;
