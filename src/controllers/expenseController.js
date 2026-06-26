const { PrismaClient } = require('@prisma/client');
const { calculateBillingMonth } = require('../utils/billingCalculator');

const prisma = new PrismaClient();

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
      totalInstallments
    } = req.body;
    const userId = req.user.id;

    // 1. VALIDATIONS
    if (!accountId || !description || !amount || !date || !categoryId || !paymentMethod) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'La cuenta, descripcion, monto, fecha, categoria y medio de pago son requeridos'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_AMOUNT',
        message: 'El monto debe ser mayor a 0'
      });
    }

    // 2. Check that the account exists and has the user's ownership
    const account = await prisma.account.findUnique({
      where: { id: parseInt(accountId) }
    });

    if (!account || account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso para agregar gastos a esta cuenta'
      });
    }

    // 3. Logic according paymentMethod
    let expenseData = {
      accountId: parseInt(accountId),
      description: description.trim(),
      amount: parseFloat(amount),
      date: new Date(date),
      categoryId: parseInt(categoryId),
      paymentMethod
    };

    let cardData = null;
    let totalInstallmentsToCreate = [];

    // If the expense is with card
    if (paymentMethod === 'card' && cardId) {
      // Check card existance
      const card = await prisma.card.findUnique({
        where: { id: parseInt(cardId) }
      });

      if (!card || card.accountId !== parseInt(accountId)) {
        return res.status(404).json({
          success: false,
          error: 'CARD_NOT_FOUND',
          message: 'Tarjeta no encontrada o no pertenece a esta cuenta'
        });
      }

      // Just the credit cards can have totalInstallments
      if (card.type === 'credit') {
        // Calculate the billing Month
        const { billingMonth, billingYear } = calculateBillingMonth(
          new Date(date),
          card.closeDay
        );

        expenseData.billingMonth = billingMonth;
        expenseData.billingYear = billingYear;

        // If there are totalInstallments set the number
        if (totalInstallments && totalInstallments > 1) {
          expenseData.paymentMethod = `card-totalInstallments-${totalInstallments}`;
        } else {
          expenseData.paymentMethod = 'card';
        }

        cardData = {
          cardId: parseInt(cardId)
        };

        // Create totalInstallments if is in more than one installment
        if (totalInstallments && totalInstallments > 1) {
          const installmentAmount = parseFloat(amount) / totalInstallments;

          for (let i = 1; i <= totalInstallments; i++) {
            let paymentMonth = billingMonth + (i - 1);
            let paymentYear = billingYear;

            // If december ends, adjust the year
            if (paymentMonth > 12) {
              paymentMonth = paymentMonth - 12;
              paymentYear += Math.floor((billingMonth + i - 1) / 12);
            }

            totalInstallmentsToCreate.push({
              installmentNumber: i,
              totalInstallments: totalInstallments,
              installmentAmount,
              paymentMonth,
              paymentYear,
              cardId: parseInt(cardId)
            });
          }
        } else {
          // Expense in just one installment
          totalInstallmentsToCreate.push({
            installmentNumber: 1,
            totalInstallments: 1,
            installmentAmount: parseFloat(amount),
            paymentMonth: billingMonth,
            paymentYear: billingYear,
            cardId: parseInt(cardId)
          });
        }
      } else if (card.type === 'debit') {
        // Debit card: Billing at the current month and reduce from the salary
        const { billingMonth, billingYear } = calculateBillingMonth(
          new Date(date),
          25 // default day for debit
        );

        expenseData.billingMonth = billingMonth;
        expenseData.billingYear = billingYear;
        expenseData.paymentMethod = 'card';

        // Reduce from the salary
        await prisma.card.update({
          where: { id: parseInt(cardId) },
          data: {
            balance: {
              decrement: parseFloat(amount)
            }
          }
        });

        cardData = {
          cardId: parseInt(cardId)
        };

        // One installment for debit
        totalInstallmentsToCreate.push({
          installmentNumber: 1,
          totalInstallments: 1,
          installmentAmount: parseFloat(amount),
          paymentMonth: billingMonth,
          paymentYear: billingYear,
          cardId: parseInt(cardId)
        });
      }
    } else {
      // Expense in cash or transfer
      const { billingMonth, billingYear } = {
        billingMonth: new Date(date).getMonth() + 1,
        billingYear: new Date(date).getFullYear()
      };

      expenseData.billingMonth = billingMonth;
      expenseData.billingYear = billingYear;
    }

    // 4. CREATE EXPENSE
    const expense = await prisma.expense.create({
      data: expenseData
    });

    // 5. CREATE RELATION WITH CARD ( IF APPLY )
    if (cardData) {
      await prisma.expenseCard.create({
        data: {
          expenseId: expense.id,
          ...cardData
        }
      });
    }

    // 6. CREATE INSTALLMENT ( IF APPLY )
    if (totalInstallmentsToCreate.length > 0) {
      await prisma.installment.createMany({
        data: totalInstallmentsToCreate.map(inst => ({
          ...inst,
          expenseId: expense.id
        }))
      });
    }

    // 7. RESPONSE
    const detailedExpense = await prisma.expense.findUnique({
      where: { id: expense.id },
      include: {
        category: true,
        card: {
          include: { card: true }
        },
        installments: true
      }
    });

    res.status(201).json({
      success: true,
      data: detailedExpense,
      message: 'Gasto creado exitosamente'
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
    const { accountId, month, year, category, orderBy } = req.query;
    const userId = req.user.id;

    const account = await prisma.account.findUnique({
      where: { id: parseInt(accountId) }
    });

    if (!account || account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso para ver los gastos de esta cuenta'
      });
    }

    // Build filters
    const where = {
      accountId: parseInt(accountId)
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

    // Order
    let orderByClause = { date: 'desc' }; // by default, the more recent first
    if (orderBy === 'monto-asc') {
      orderByClause = { amount: 'asc' };
    } else if (orderBy === 'monto-desc') {
      orderByClause = { amount: 'desc' };
    } else if (orderBy === 'fecha-asc') {
      orderByClause = { date: 'asc' };
    }

    // Get expenses
    const expenses = await prisma.expense.findMany({
      where,
      include: {
        category: true,
        card: {
          include: { card: true }
        },
        installments: true
      },
      orderBy: orderByClause
    });

    res.status(200).json({
      success: true,
      data: expenses,
      count: expenses.length,
      message: 'Gastos obtenidos'
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
          include: { card: true }
        },
        installments: true
      }
    });

    if (!expense) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Gasto no encontrado'
      });
    }

    if (expense.account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso para ver este gasto'
      });
    }

    res.status(200).json({
      success: true,
      data: expense,
      message: 'Gasto obtenido'
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
    const { description, amount, categoryId } = req.body;

    // Get current expense
    const expense = await prisma.expense.findUnique({
      where: { id: parseInt(id) },
      include: { account: true }
    });

    if (!expense) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Gasto no encontrado'
      });
    }

    if (expense.account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso para modificar este gasto'
      });
    }

    const updateData = {};
    if (description) updateData.description = description.trim();
    if (amount) {
      if (amount <= 0) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_AMOUNT',
          message: 'El monto debe ser mayor a 0'
        });
      }
      updateData.amount = parseFloat(amount);
    }
    if (categoryId) updateData.categoryId = parseInt(categoryId);

    const updatedExpense = await prisma.expense.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        category: true,
        card: {
          include: { card: true }
        },
        installments: true
      }
    });

    res.status(200).json({
      success: true,
      data: updatedExpense,
      message: 'Gasto actualizado'
    });

  } catch (error) {
    next(error);
  }
};

// ============================================
// DELETE EXPENSE GASTO
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
        installments: true
      }
    });

    if (!expense) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Gasto no encontrado'
      });
    }

    if (expense.account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso para eliminar este gasto'
      });
    }

    // If was an expense with debit card, restore the salary
    if (expense.card && expense.paymentMethod === 'card') {
      const cardRecord = await prisma.card.findUnique({
        where: { id: expense.card.cardId }
      });

      if (cardRecord && cardRecord.type === 'debit') {
        await prisma.card.update({
          where: { id: cardRecord.id },
          data: {
            balance: {
              increment: expense.amount
            }
          }
        });
      }
    }

    // The totalInstallments are deleted on cascade
    await prisma.expense.delete({
      where: { id: parseInt(id) }
    });

    res.status(200).json({
      success: true,
      message: 'Gasto eliminado correctamente'
    });

  } catch (error) {
    next(error);
  }
};