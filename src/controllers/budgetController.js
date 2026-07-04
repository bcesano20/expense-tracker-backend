const { PrismaClient } = require('@prisma/client');

const { ERROR_MESSAGES } = require('../helpers/constants');

const prisma = new PrismaClient();

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

    if (isRange) {
      if (
        minAmount === undefined ||
        minAmount === null ||
        maxAmount === undefined ||
        maxAmount === null
      ) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: ERROR_MESSAGES.BUDGET_RANGE_NOT_EXISTS,
        });
      }

      if (minAmount >= maxAmount) {
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
        amount: isFixed ? parseFloat(amount) : null,
        minAmount: isRange ? parseFloat(minAmount) : null,
        maxAmount: isRange ? parseFloat(maxAmount) : null,
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

    if (isRange) {
      const resolvedMin = minAmount ?? budget.minAmount;
      const resolvedMax = maxAmount ?? budget.maxAmount;

      if (resolvedMin === null || resolvedMax === null) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: ERROR_MESSAGES.BUDGET_RANGE_NOT_EXISTS,
        });
      }

      if (resolvedMin >= resolvedMax) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: ERROR_MESSAGES.BUDGET_MAX_LESS_MIN,
        });
      }
    }

    const updateData = {};

    if (isFixed) {
      updateData.amount = parseFloat(amount);
      updateData.minAmount = null;
      updateData.maxAmount = null;
    } else if (isRange) {
      updateData.amount = null;
      if (minAmount !== undefined) updateData.minAmount = parseFloat(minAmount);
      if (maxAmount !== undefined) updateData.maxAmount = parseFloat(maxAmount);
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
