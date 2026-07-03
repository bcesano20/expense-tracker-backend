const { PrismaClient } = require('@prisma/client');

const { ERROR_MESSAGES } = require('../helpers/constants');

const prisma = new PrismaClient();

// ============================================
// CREATE INCOME
// ============================================
exports.createIncome = async (req, res, next) => {
  try {
    const { accountId, description, amount, source, date } = req.body;
    const userId = req.user.id;

    if (!accountId || !description || !amount || !source || !date) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: ERROR_MESSAGES.INCOME_CREATION,
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_AMOUNT',
        message: ERROR_MESSAGES.AMOUNT_MORE_0,
      });
    }

    const account = await prisma.account.findUnique({
      where: { id: parseInt(accountId) },
    });

    if (!account || account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: ERROR_MESSAGES.INCOME_ACCOUNT_PERMISSION,
      });
    }

    const income = await prisma.income.create({
      data: {
        accountId: parseInt(accountId),
        description: description.trim(),
        amount: parseFloat(amount),
        source,
        date: new Date(date),
      },
    });

    res.status(201).json({
      success: true,
      data: income,
      message: 'Ingreso creado exitosamente',
    });
  } catch (error) {
    next(error); // goes to the internal error server handler in server.js
  }
};

// ============================================
// GET INCOMES (with filters)
// ============================================
exports.getIncomes = async (req, res, next) => {
  try {
    const { accountId, month, year, source, orderBy, page = 1, limit = 10 } = req.query;
    const userId = req.user.id;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: ERROR_MESSAGES.ACCOUNT_ID_REQUIRED,
      });
    }

    const account = await prisma.account.findUnique({
      where: { id: parseInt(accountId) },
    });

    if (!account || account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: ERROR_MESSAGES.INCOME_ACCOUNT_PERMISSION,
      });
    }

    const where = { accountId: parseInt(accountId) };

    // Filter by month and year using the date field
    if (month && year) {
      const monthNum = parseInt(month);
      const yearNum = parseInt(year);
      where.date = {
        gte: new Date(yearNum, monthNum - 1, 1),
        lt: new Date(yearNum, monthNum, 1),
      };
    }

    if (source) {
      where.source = source;
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    // Order
    let orderByClause = { date: 'desc' };
    if (orderBy === 'amount-asc') orderByClause = { amount: 'asc' };
    else if (orderBy === 'amount-desc') orderByClause = { amount: 'desc' };
    else if (orderBy === 'date-asc') orderByClause = { date: 'asc' };

    const [incomes, total] = await Promise.all([
      prisma.income.findMany({
        where,
        orderBy: orderByClause,
        skip,
        take: limitNum,
      }),
      prisma.income.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    res.status(200).json({
      success: true,
      data: incomes,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPreviousPage: pageNum > 1,
      },
      message: 'Ingresos obtenidos',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// GET INCOME BY ID
// ============================================
exports.getIncomeById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const income = await prisma.income.findUnique({
      where: { id: parseInt(id) },
      include: { account: true },
    });

    if (!income) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: ERROR_MESSAGES.INCOME_NOT_FOUND,
      });
    }

    if (income.account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: ERROR_MESSAGES.INCOME_ACCOUNT_PERMISSION,
      });
    }

    res.status(200).json({
      success: true,
      data: income,
      message: 'Ingreso obtenido',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// UPDATE INCOME
// ============================================
exports.updateIncome = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { description, amount, source, date } = req.body;

    const income = await prisma.income.findUnique({
      where: { id: parseInt(id) },
      include: { account: true },
    });

    if (!income) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: ERROR_MESSAGES.INCOME_NOT_FOUND,
      });
    }

    if (income.account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: ERROR_MESSAGES.INCOME_ACCOUNT_PERMISSION,
      });
    }

    const updateData = {};

    if (description) updateData.description = description.trim();
    if (source) updateData.source = source.trim();

    if (amount !== undefined) {
      if (amount <= 0) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_AMOUNT',
          message: ERROR_MESSAGES.AMOUNT_MORE_0,
        });
      }
      updateData.amount = parseFloat(amount);
    }

    if (date) updateData.date = new Date(date);

    const updatedIncome = await prisma.income.update({
      where: { id: parseInt(id) },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      data: updatedIncome,
      message: 'Ingreso actualizado',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// DELETE INCOME
// ============================================
exports.deleteIncome = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const income = await prisma.income.findUnique({
      where: { id: parseInt(id) },
      include: { account: true },
    });

    if (!income) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: ERROR_MESSAGES.INCOME_NOT_FOUND,
      });
    }

    if (income.account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: ERROR_MESSAGES.INCOME_ACCOUNT_PERMISSION,
      });
    }

    await prisma.income.delete({
      where: { id: parseInt(id) },
    });

    res.status(200).json({
      success: true,
      message: 'Ingreso eliminado correctamente',
    });
  } catch (error) {
    next(error);
  }
};
