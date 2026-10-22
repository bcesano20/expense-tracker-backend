const prisma = require('../helpers/prisma');
const { ERROR_MESSAGES } = require('../helpers/constants');
const { parseAmount } = require('../utils/money');

// True when the client sent a value for the field (an explicit null counts as not sent)
const isProvided = (value) => value !== undefined && value !== null;

// ============================================
// CREATE BUDGET
// ============================================
exports.createBudget = async (req, res, next) => {
  try {
    const { accountId, categoryId, month, year, amount, minAmount, maxAmount } = req.body;
    const userId = req.user.id;

    if (!accountId || !categoryId || !month || !year) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: ERROR_MESSAGES.BUDGET_CREATION,
      });
    }

    // Validate month range
    if (month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_MONTH',
        message: ERROR_MESSAGES.INVALID_MONTH,
      });
    }

    // Validate budget type: fixed OR range, not both or neither
    const isFixed = amount !== undefined && amount !== null;
    const isRange = minAmount !== undefined || maxAmount !== undefined;

    if (!isFixed && !isRange) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: ERROR_MESSAGES.BUDGET_AMOUNT,
      });
    }

    if (isFixed && isRange) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: ERROR_MESSAGES.BUDGET_AMOUNT_LIMIT,
      });
    }

    let parsedAmount = null;
    let parsedMin = null;
    let parsedMax = null;

    // Check the value passed fot the fixed budget cases
    if (isFixed) {
      parsedAmount = parseAmount(amount);

      if (!parsedAmount) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_AMOUNT',
          message: ERROR_MESSAGES.INVALID_AMOUNT,
        });
      }
    }

    // Check the value passed fot the range budget cases
    if (isRange) {
      if (!isProvided(minAmount) || !isProvided(maxAmount)) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: ERROR_MESSAGES.BUDGET_RANGE_NOT_EXISTS,
        });
      }

      // The minimum of a range may be 0 ("spend up to X"); the maximum may not
      parsedMin = parseAmount(minAmount, { allowZero: true });
      parsedMax = parseAmount(maxAmount);

      if (!parsedMin || !parsedMax) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_AMOUNT',
          message: parsedMin
            ? ERROR_MESSAGES.INVALID_AMOUNT
            : ERROR_MESSAGES.INVALID_AMOUNT_OR_ZERO,
        });
      }

      // Decimal must be compared with its methods: `>=` would compare the values as strings
      if (parsedMin.gte(parsedMax)) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: ERROR_MESSAGES.BUDGET_MAX_LESS_MIN,
        });
      }
    }

    // Validate account ownership
    const account = await prisma.account.findUnique({
      where: { id: parseInt(accountId) },
    });

    if (!account || account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: ERROR_MESSAGES.BUDGET_ACCOUNT_PERMISSION,
      });
    }

    // Validate category belongs to the user
    const category = await prisma.category.findUnique({
      where: { id: parseInt(categoryId) },
    });

    if (!category || category.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: ERROR_MESSAGES.CATEGORY_NOT_FOUND,
      });
    }

    const budget = await prisma.budget.create({
      data: {
        accountId: parseInt(accountId),
        categoryId: parseInt(categoryId),
        month: parseInt(month),
        year: parseInt(year),
        amount: parsedAmount,
        minAmount: parsedMin,
        maxAmount: parsedMax,
      },
      include: { category: true },
    });

    res.status(201).json({
      success: true,
      data: budget,
      message: 'Presupuesto creado exitosamente',
    });
  } catch (error) {
    // Unique constraint violation: budget already exists for this category+period
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: 'CONFLICT',
        message: ERROR_MESSAGES.BUDGET_CATEGORY_PERIOD_ALREADY_EXISTS,
      });
    }
    next(error);
  }
};

// ============================================
// GET BUDGETS (with filters)
// ============================================
exports.getBudgets = async (req, res, next) => {
  try {
    const { accountId, month, year, categoryId } = req.query;
    const userId = req.user.id;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'accountId es requerido',
      });
    }

    const account = await prisma.account.findUnique({
      where: { id: parseInt(accountId) },
    });

    if (!account || account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: ERROR_MESSAGES.BUDGET_ACCOUNT_PERMISSION,
      });
    }

    const where = { accountId: parseInt(accountId) };

    if (month && year) {
      where.month = parseInt(month);
      where.year = parseInt(year);
    }

    if (categoryId) {
      where.categoryId = parseInt(categoryId);
    }

    const budgets = await prisma.budget.findMany({
      where,
      include: { category: true },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    res.status(200).json({
      success: true,
      data: budgets,
      count: budgets.length,
      message: 'Presupuestos obtenidos',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// GET BUDGET BY ID
// ============================================
exports.getBudgetById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const budget = await prisma.budget.findUnique({
      where: { id: parseInt(id) },
      include: {
        account: true,
        category: true,
      },
    });

    if (!budget) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: ERROR_MESSAGES.BUDGET_NOT_FOUND,
      });
    }

    if (budget.account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: ERROR_MESSAGES.BUDGET_ACCOUNT_PERMISSION,
      });
    }

    res.status(200).json({
      success: true,
      data: budget,
      message: 'Presupuesto obtenido',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// UPDATE BUDGET
// ============================================
exports.updateBudget = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { amount, minAmount, maxAmount } = req.body;

    const budget = await prisma.budget.findUnique({
      where: { id: parseInt(id) },
      include: { account: true },
    });

    if (!budget) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: ERROR_MESSAGES.BUDGET_NOT_FOUND,
      });
    }

    if (budget.account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: ERROR_MESSAGES.BUDGET_ACCOUNT_PERMISSION,
      });
    }

    const isFixed = amount !== undefined && amount !== null;
    const isRange = minAmount !== undefined || maxAmount !== undefined;

    if (isFixed && isRange) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: ERROR_MESSAGES.BUDGET_AMOUNT_LIMIT,
      });
    }

    let parsedAmount = null;
    let parsedMin = null;
    let parsedMax = null;

    if (isFixed) {
      parsedAmount = parseAmount(amount);

      if (!parsedAmount) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_AMOUNT',
          message: ERROR_MESSAGES.INVALID_AMOUNT,
        });
      }
    }

    if (isRange) {
      // Only the bounds sent by the client are parsed; the other one keeps the stored value
      parsedMin = isProvided(minAmount) ? parseAmount(minAmount, { allowZero: true }) : null;
      parsedMax = isProvided(maxAmount) ? parseAmount(maxAmount) : null;

      if (isProvided(minAmount) && !parsedMin) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_AMOUNT',
          message: ERROR_MESSAGES.INVALID_AMOUNT_OR_ZERO,
        });
      }

      if (isProvided(maxAmount) && !parsedMax) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_AMOUNT',
          message: ERROR_MESSAGES.INVALID_AMOUNT,
        });
      }

      const resolvedMin = parsedMin ?? budget.minAmount;
      const resolvedMax = parsedMax ?? budget.maxAmount;

      if (resolvedMin === null || resolvedMax === null) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: ERROR_MESSAGES.BUDGET_RANGE_NOT_EXISTS,
        });
      }

      // Both can be Decimal; `>=` would compare them as strings (9 >= 10 is true)
      if (resolvedMin.gte(resolvedMax)) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: ERROR_MESSAGES.BUDGET_MAX_LESS_MIN,
        });
      }
    }

    const updateData = {};

    if (isFixed) {
      updateData.amount = parsedAmount;
      updateData.minAmount = null;
      updateData.maxAmount = null;
    } else if (isRange) {
      updateData.amount = null;
      if (parsedMin) updateData.minAmount = parsedMin;
      if (parsedMax) updateData.maxAmount = parsedMax;
    }

    const updatedBudget = await prisma.budget.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: { category: true },
    });

    res.status(200).json({
      success: true,
      data: updatedBudget,
      message: 'Presupuesto actualizado',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// DELETE BUDGET
// ============================================
exports.deleteBudget = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const budget = await prisma.budget.findUnique({
      where: { id: parseInt(id) },
      include: { account: true },
    });

    if (!budget) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: ERROR_MESSAGES.BUDGET_NOT_FOUND,
      });
    }

    if (budget.account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: ERROR_MESSAGES.BUDGET_ACCOUNT_PERMISSION,
      });
    }

    await prisma.budget.delete({
      where: { id: parseInt(id) },
    });

    res.status(200).json({
      success: true,
      message: 'Presupuesto eliminado correctamente',
    });
  } catch (error) {
    next(error);
  }
};
