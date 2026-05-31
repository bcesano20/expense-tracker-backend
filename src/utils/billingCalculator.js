/**
 * Calculate in which month should the expense be billed?
 * 
 * Rule: If the billing cycle ends on the 25th and the purchase is made on the 26th,
 * then it is billed the following month
 * 
 * @param {Date} expenseDate
 * @param {Number} cardCloseDay
 * @returns {Object} { billingMonth: 1-12, billingYear: 2026 }
 */
function calculateBillingMonth(expenseDate, cardCloseDay) {
  const day = expenseDate.getDate();
  const month = expenseDate.getMonth() + 1; // 0-based a 1-based
  const year = expenseDate.getFullYear();

  // If the expense occurs AFTER the closing date → next month
  if (day > cardCloseDay) {
    if (month === 12) {
      return { billingMonth: 1, billingYear: year + 1 };
    }
    return { billingMonth: month + 1, billingYear: year };
  }

  // If on or before the closing date → same month
  return { billingMonth: month, billingYear: year };
}

module.exports = { calculateBillingMonth };
