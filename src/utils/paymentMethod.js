const { PaymentMethod } = require('@prisma/client');

const CARD_METHODS = [PaymentMethod.DEBIT, PaymentMethod.CREDIT];
const NON_CARD_METHODS = [PaymentMethod.CASH, PaymentMethod.TRANSFER, PaymentMethod.OTHER];

// Returns the value when it is a PaymentMethod, or null otherwise.
const normalizePaymentMethod = (value) =>
  Object.values(PaymentMethod).includes(value) ? value : null;

module.exports = { CARD_METHODS, NON_CARD_METHODS, normalizePaymentMethod };
