const { PaymentMethod } = require('@prisma/client');

const prisma = require('../helpers/prisma');
const { ERROR_MESSAGES } = require('../helpers/constants');
const { applyExpenseEffect, revertExpenseEffect } = require('../helpers/expenseEffect');
const { calculateBillingMonth } = require('../utils/billingCalculator');
const { splitAmount, parseAmount } = require('../utils/money');
const { CARD_METHODS, normalizePaymentMethod } = require('../utils/paymentMethod');

// ============================================
// CREATE EXPENSE
// ============================================
exports.createExpense = async (req, res, next) => {
  try {
    const {
      accountId,
      description,
      amount,
      date,
      categoryId,
      paymentMethod,
      cardId,
      totalInstallments,
      notes,
    } = req.body;
    const userId = req.user.id;

    // 1. VALIDATIONS
    if (!accountId || !description || !amount || !date || !categoryId || !paymentMethod) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'La cuenta, descripcion, monto, fecha, categoria y medio de pago son requeridos',
      });
    }

    // Parsed and check the amount first and the use that value in the rest of the object creation
    const parsedAmount = parseAmount(amount);

    if (!parsedAmount) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_AMOUNT',
        message: ERROR_MESSAGES.INVALID_AMOUNT,
      });
    }

    // 2. Check that the account exists and has the user's ownership
    const account = await prisma.account.findUnique({
      where: { id: parseInt(accountId) },
    });

    if (!account || account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso para agregar gastos a esta cuenta',
      });
    }

    // Check if the payment method selected is valid
    const requestedPaymentMethod = normalizePaymentMethod(paymentMethod);

    if (!requestedPaymentMethod) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PAYMENT_METHOD',
        message: ERROR_MESSAGES.INVALID_PAYMENT_METHOD,
      });
    }

    // Checking the card payment method validation
    const isCardMethod = CARD_METHODS.includes(requestedPaymentMethod);

    if (isCardMethod && !cardId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: ERROR_MESSAGES.CARD_REQUIRED_FOR_PAYMENT_METHOD,
      });
    }

    if (!isCardMethod && cardId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: ERROR_MESSAGES.CARD_NOT_ALLOWED_FOR_PAYMENT_METHOD,
      });
    }

    // 3. Logic according paymentMethod
    let expenseData = {
      accountId: parseInt(accountId),
      description: description.trim(),
      amount: parsedAmount,
      date: new Date(date),
      categoryId: parseInt(categoryId),
      paymentMethod: requestedPaymentMethod,
      notes: notes ? notes.trim() : null,
    };

    let cardData = null;
    let totalInstallmentsToCreate = [];

    // If the expense is with card
    if (isCardMethod) {
      // Check card existance
      const card = await prisma.card.findUnique({
        where: { id: parseInt(cardId) },
      });

      if (!card || card.accountId !== parseInt(accountId)) {
        return res.status(404).json({
          success: false,
          error: 'CARD_NOT_FOUND',
          message: ERROR_MESSAGES.CARD_NOT_FOUND,
        });
      }

      if (!card.isActive) {
        return res.status(400).json({
          success: false,
          error: 'CARD_CANCELLED',
          message: ERROR_MESSAGES.CARD_CANCELLED,
        });
      }

      // The requested payment method must agree with the type of the card
      const cardMethod = card.type === 'credit' ? PaymentMethod.CREDIT : PaymentMethod.DEBIT;

      if (requestedPaymentMethod !== cardMethod) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: ERROR_MESSAGES.PAYMENT_METHOD_CARD_MISMATCH,
        });
      }

      expenseData.paymentMethod = cardMethod;

      // Just the credit cards can have totalInstallments
      if (card.type === 'credit') {
        // Calculate the billing Month
        const { billingMonth, billingYear } = calculateBillingMonth(new Date(date), card.closeDay);

        expenseData.billingMonth = billingMonth;
        expenseData.billingYear = billingYear;

        cardData = {
          cardId: parseInt(cardId),
        };

        // Payment starts the month AFTER the billing/statement month
        if (totalInstallments && totalInstallments > 1) {
          // Rounded to 2 decimals; the last installment absorbs the leftover cents
          const installmentAmounts = splitAmount(parsedAmount, totalInstallments);

          for (let i = 1; i <= totalInstallments; i++) {
            let paymentMonth = billingMonth + i; // +i so first payment is billingMonth+1
            let paymentYear = billingYear;

            while (paymentMonth > 12) {
              paymentMonth -= 12;
              paymentYear += 1;
            }

            totalInstallmentsToCreate.push({
              installmentNumber: i,
              totalInstallments: totalInstallments,
              installmentAmount: installmentAmounts[i - 1],
              paymentMonth,
              paymentYear,
              cardId: parseInt(cardId),
            });
          }
        } else {
          // Single installment — paid the month after the statement closes
          let paymentMonth = billingMonth + 1;
          let paymentYear = billingYear;
          if (paymentMonth > 12) {
            paymentMonth = 1;
            paymentYear += 1;
          }

          totalInstallmentsToCreate.push({
            installmentNumber: 1,
            totalInstallments: 1,
            installmentAmount: parsedAmount,
            paymentMonth,
            paymentYear,
            cardId: parseInt(cardId),
          });
        }
      } else if (card.type === 'debit') {
        // Debit card: billed in the same month as the expense date
        const expenseDate = new Date(date);
        const billingMonth = expenseDate.getMonth() + 1;
        const billingYear = expenseDate.getFullYear();

        expenseData.billingMonth = billingMonth;
        expenseData.billingYear = billingYear;

        cardData = {
          cardId: parseInt(cardId),
        };

        // One installment for debit, born paid: the card balance was already charged
        totalInstallmentsToCreate.push({
          installmentNumber: 1,
          totalInstallments: 1,
          installmentAmount: parsedAmount,
          paymentMonth: billingMonth,
          paymentYear: billingYear,
          cardId: parseInt(cardId),
          isPayed: true,
          paidAt: new Date(),
        });
      }
    } else {
      // Expense in cash, transfer or other
      const { billingMonth, billingYear } = {
        billingMonth: new Date(date).getMonth() + 1,
        billingYear: new Date(date).getFullYear(),
      };

      expenseData.billingMonth = billingMonth;
      expenseData.billingYear = billingYear;
    }

    // 4. WRITE EVERYTHING ATOMICALLY (any error rolls back all the writes)
    const detailedExpense = await prisma.$transaction(async (tx) => {
      // Take the money from where it comes from: the wallet (cash, transfer, other) or the debit
      // card. Blocked if it is short; a credit expense moves nothing yet.
      const { walletApplied } = await applyExpenseEffect(tx, {
        accountId: expenseData.accountId,
        method: expenseData.paymentMethod,
        amount: parsedAmount,
        cardId: cardId ? parseInt(cardId) : null,
      });

      const expense = await tx.expense.create({
        data: { ...expenseData, walletApplied },
      });

      // Relation with card ( if apply )
      if (cardData) {
        await tx.expenseCard.create({
          data: {
            expenseId: expense.id,
            ...cardData,
          },
        });
      }

      // Installments ( if apply )
      if (totalInstallmentsToCreate.length > 0) {
        await tx.installment.createMany({
          data: totalInstallmentsToCreate.map((inst) => ({
            ...inst,
            expenseId: expense.id,
          })),
        });
      }

      return tx.expense.findUnique({
        where: { id: expense.id },
        include: {
          category: true,
          card: {
            include: { card: true },
          },
          installments: true,
        },
      });
    });

    // 5. RESPONSE

    res.status(201).json({
      success: true,
      data: detailedExpense,
      message: 'Gasto creado exitosamente',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// GET EXPENSES (with filters )
// ============================================
exports.getExpense = async (req, res, next) => {
  try {
    const { accountId, month, year, category, orderBy, page = 1, limit = 10 } = req.query;
    const userId = req.user.id;

    const account = await prisma.account.findUnique({
      where: { id: parseInt(accountId) },
    });

    if (!account || account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso para ver los gastos de esta cuenta',
      });
    }

    // Build filters
    const where = {
      accountId: parseInt(accountId),
    };

    // Filter by month and year (billing month)
    if (month && year) {
      where.billingMonth = parseInt(month);
      where.billingYear = parseInt(year);
    }

    // Filter by category
    if (category) {
      where.categoryId = parseInt(category);
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 10)); // 100 max
    const skip = (pageNum - 1) * limitNum;

    // Order
    let orderByClause = { date: 'desc' }; // by default, the more recent first
    if (orderBy === 'monto-asc') {
      orderByClause = { amount: 'asc' };
    } else if (orderBy === 'monto-desc') {
      orderByClause = { amount: 'desc' };
    } else if (orderBy === 'fecha-asc') {
      orderByClause = { date: 'asc' };
    }

    // Get expenses with pagination
    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: {
          category: true,
          card: {
            include: { card: true },
          },
          installments: true,
        },
        orderBy: orderByClause,
        skip,
        take: limitNum,
      }),
      prisma.expense.count({ where }), // Total count
    ]);

    // Calculate pagination information
    const totalPages = Math.ceil(total / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPreviousPage = pageNum > 1;

    res.status(200).json({
      success: true,
      data: expenses,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
      message: 'Gastos obtenidos',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// GET AN EXPENSE BY ID
// ============================================
exports.getExpenseById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const expense = await prisma.expense.findUnique({
      where: { id: parseInt(id) },
      include: {
        account: true,
        category: true,
        card: {
          include: { card: true },
        },
        installments: true,
      },
    });

    if (!expense) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Gasto no encontrado',
      });
    }

    if (expense.account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso para ver este gasto',
      });
    }

    res.status(200).json({
      success: true,
      data: expense,
      message: 'Gasto obtenido',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// UPDATE EXPENSE
// ============================================
exports.updateExpense = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { description, amount, categoryId, notes, date, paymentMethod, cardId } = req.body;

    const expense = await prisma.expense.findUnique({
      where: { id: parseInt(id) },
      include: {
        account: true,
        card: true,
      },
    });

    if (!expense) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Gasto no encontrado',
      });
    }

    if (expense.account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso para modificar este gasto',
      });
    }

    const oldMethod = expense.paymentMethod;
    const newMethod = paymentMethod ? normalizePaymentMethod(paymentMethod) : oldMethod;

    if (!newMethod) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PAYMENT_METHOD',
        message: ERROR_MESSAGES.INVALID_PAYMENT_METHOD,
      });
    }

    let newAmount = expense.amount;
    if (amount) {
      newAmount = parseAmount(amount);

      if (!newAmount) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_AMOUNT',
          message: ERROR_MESSAGES.INVALID_AMOUNT,
        });
      }
    }

    const newDate = date ? new Date(date) : expense.date;
    // An edit form usually sends the date even when it did not change, so compare the day
    const day = (value) => value.toISOString().slice(0, 10);
    const dateChanged = Boolean(date) && day(newDate) !== day(expense.date);
    const oldCardId = expense.card ? expense.card.cardId : null;

    const updateData = {};
    if (description) updateData.description = description.trim();
    if (categoryId) updateData.categoryId = parseInt(categoryId);
    if (notes !== undefined) updateData.notes = notes ? notes.trim() : null;

    // Set below for the expenses whose money can move (everything except credit)
    let moneyChanged = false;
    let newCardId = null;

    if (oldMethod === PaymentMethod.CREDIT) {
      // A credit expense only allows description, category and notes. Sending the stored
      // amount, date or card again (as an edit form does) is fine; changing them is not.
      if (newMethod !== PaymentMethod.CREDIT) {
        return res.status(400).json({
          success: false,
          error: 'UNSUPPORTED_OPERATION',
          message: ERROR_MESSAGES.UNSUPORTED_UPDATE_CREDIT_CARD,
        });
      }

      const changesAmount = !newAmount.equals(expense.amount);
      const changesCard = cardId && parseInt(cardId) !== oldCardId;

      if (changesAmount || dateChanged || changesCard) {
        return res.status(400).json({
          success: false,
          error: 'UNSUPPORTED_OPERATION',
          message: ERROR_MESSAGES.CREDIT_EXPENSE_LIMITED_EDIT,
        });
      }
    } else {
      if (newMethod === PaymentMethod.CREDIT) {
        return res.status(400).json({
          success: false,
          error: 'UNSUPPORTED_OPERATION',
          message: ERROR_MESSAGES.CREDIT_CARD_NOT_UPDATAED,
        });
      }

      // A debit expense keeps its card unless another one is sent; cash, transfer and other have none
      if (newMethod === PaymentMethod.DEBIT) {
        newCardId = cardId ? parseInt(cardId) : oldCardId;
      }

      const methodChanged = newMethod !== oldMethod;
      const amountChanged = !newAmount.equals(expense.amount);
      const cardChanged = newMethod === PaymentMethod.DEBIT && newCardId !== oldCardId;
      moneyChanged = methodChanged || amountChanged || cardChanged;

      // The card is only checked when money has to be taken from it
      if (moneyChanged && newMethod === PaymentMethod.DEBIT) {
        if (!newCardId) {
          return res.status(400).json({
            success: false,
            error: 'VALIDATION_ERROR',
            message: ERROR_MESSAGES.CARD_REQUIRED_FOR_PAYMENT_METHOD,
          });
        }

        const newCard = await prisma.card.findUnique({ where: { id: newCardId } });

        if (!newCard || newCard.accountId !== expense.accountId) {
          return res.status(404).json({
            success: false,
            error: 'CARD_NOT_FOUND',
            message: ERROR_MESSAGES.CARD_NOT_FOUND,
          });
        }

        if (!newCard.isActive) {
          return res.status(400).json({
            success: false,
            error: 'CARD_CANCELLED',
            message: ERROR_MESSAGES.CARD_CANCELLED,
          });
        }

        if (newCard.type !== 'debit') {
          return res.status(400).json({
            success: false,
            error: 'VALIDATION_ERROR',
            message: ERROR_MESSAGES.PAYMENT_METHOD_CARD_MISMATCH,
          });
        }
      }

      if (methodChanged) updateData.paymentMethod = newMethod;
      if (amountChanged) updateData.amount = newAmount;

      // Cash, transfer, other and debit are billed in the month of their date
      if (date) {
        updateData.date = newDate;
        updateData.billingMonth = newDate.getMonth() + 1;
        updateData.billingYear = newDate.getFullYear();
      }
    }

    // WRITE EVERYTHING ATOMICALLY (any error rolls back all the writes)
    const updatedExpense = await prisma.$transaction(async (tx) => {
      if (moneyChanged) {
        // First give back what the old version took, then take what the new one needs. The refund
        // is already counted when the new amount is checked, so only the real difference has to
        // be available (cash -> transfer with a bigger amount needs just the extra money).
        await revertExpenseEffect(tx, expense);

        const { walletApplied } = await applyExpenseEffect(tx, {
          accountId: expense.accountId,
          method: newMethod,
          amount: newAmount,
          cardId: newCardId,
          // An expense from before the wallet existed never touches it
          trackWallet: expense.walletApplied,
        });

        updateData.walletApplied = walletApplied;
      }

      // The card link and the installment of a debit expense follow the expense
      if (oldMethod === PaymentMethod.DEBIT && newMethod !== PaymentMethod.DEBIT) {
        await tx.installment.deleteMany({ where: { expenseId: expense.id } });
        await tx.expenseCard.deleteMany({ where: { expenseId: expense.id } });
      } else if (newMethod === PaymentMethod.DEBIT && newCardId && (moneyChanged || dateChanged)) {
        // No card id means its card was deleted: there is no link or installment to rebuild
        const billingMonth = updateData.billingMonth ?? expense.billingMonth;
        const billingYear = updateData.billingYear ?? expense.billingYear;

        await tx.installment.deleteMany({ where: { expenseId: expense.id } });
        await tx.expenseCard.deleteMany({ where: { expenseId: expense.id } });
        await tx.expenseCard.create({ data: { expenseId: expense.id, cardId: newCardId } });
        await tx.installment.create({
          data: {
            expenseId: expense.id,
            cardId: newCardId,
            installmentNumber: 1,
            totalInstallments: 1,
            installmentAmount: newAmount,
            paymentMonth: billingMonth,
            paymentYear: billingYear,
            isPayed: true, // a debit installment is born paid
            paidAt: new Date(),
          },
        });
      }

      return tx.expense.update({
        where: { id: expense.id },
        data: updateData,
        include: {
          category: true,
          card: {
            include: { card: true },
          },
          installments: true,
        },
      });
    });

    res.status(200).json({
      success: true,
      data: updatedExpense,
      message: 'Gasto actualizado',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// DELETE EXPENSE
// ============================================
exports.deleteExpense = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const expense = await prisma.expense.findUnique({
      where: { id: parseInt(id) },
      include: {
        account: true,
        card: true,
        installments: true,
      },
    });

    if (!expense) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Gasto no encontrado',
      });
    }

    if (expense.account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso para eliminar este gasto',
      });
    }

    // WRITE EVERYTHING ATOMICALLY (any error rolls back all the writes)
    await prisma.$transaction(async (tx) => {
      // Give the money back to where it came from: the wallet or the debit card
      await revertExpenseEffect(tx, expense);

      // The installments are deleted on cascade
      await tx.expense.delete({
        where: { id: expense.id },
      });
    });

    res.status(200).json({
      success: true,
      message: 'Gasto eliminado correctamente',
    });
  } catch (error) {
    next(error);
  }
};
