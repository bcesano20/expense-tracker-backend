// Used when the client does not send a timezone, or sends one that does not exist.
// Some of the production users are in Argentina.
const DEFAULT_TIME_ZONE = 'America/Argentina/Buenos_Aires';

// Returns a valid IANA timezone name (e.g. "Europe/Madrid"). Anything missing or unknown falls
// back to the default instead of failing: `Intl.DateTimeFormat` throws a RangeError for a bad name.
// Intl is only used to VALIDATE: the name is returned as the client sent it, because
// resolvedOptions().timeZone rewrites some names to old aliases (Argentina/Buenos_Aires becomes
// America/Buenos_Aires) and the API would then answer with a name the client never sent.
const resolveTimeZone = (value) => {
  if (typeof value !== 'string' || value.trim() === '') return DEFAULT_TIME_ZONE;

  const timeZone = value.trim();

  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
};

// The month and year it currently is in the given timezone. The same instant can be a different
// month in two zones (2026-10-31 23:30 UTC is already November in Madrid, still October in Buenos
// Aires). `now` can be injected so the month boundaries are testable.
const getCurrentMonth = (timeZone, now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now);

  const read = (type) => Number(parts.find((part) => part.type === type).value);

  return { month: read('month'), year: read('year') };
};

module.exports = { DEFAULT_TIME_ZONE, resolveTimeZone, getCurrentMonth };
