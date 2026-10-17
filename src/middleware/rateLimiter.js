const { ERROR_MESSAGES } = require('../helpers/constants');
const rateLimit = require('express-rate-limit');

const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 10;

// Limits login/register attempts per IP to slow down brute-force attacks
const authLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  limit: AUTH_MAX_ATTEMPTS,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: 'TOO_MANY_REQUESTS',
    message: ERROR_MESSAGES.TOO_MANY_ATTEMPTS,
  },
});

module.exports = { authLimiter };
