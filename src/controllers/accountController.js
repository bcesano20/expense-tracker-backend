const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// CREATE THE ACCOUNT FOR THE CORRESPONDING USER
exports.createAccount = async (req, res, next) => {
  try {
    const { name, currency } = req.body;
    const userId = req.user.id;

    // Check that the name exists and is needed to create the account the currency by default is USD
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'El nombre de la cuenta es requerido',
      });
    }

    const account = await prisma.account.create({
      data: {
        name,
        currency: currency || 'USD',
        userId,
      },
    });

    res.status(201).json({
      success: true,
      data: account,
      message: 'Cuenta creada exitosamente',
    });
  } catch (error) {
    next(error);
  }
};

// GET THE DIFFERENTS ACCOUNTS OF A USER
exports.getMyAccounts = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Check with the user id and get the cards of the account and the last 10 expenses
    const accounts = await prisma.account.findMany({
      where: { userId },
      include: {
        cards: true,
        expenses: {
          orderBy: { date: 'desc' },
          take: 10, // last 10 expenses
        },
      },
    });

    res.status(200).json({
      success: true,
      data: accounts,
      message: 'Cuentas obtenidas',
    });
  } catch (error) {
    next(error);
  }
};

// GET THE ACCOUNT BY THE ID
exports.getAccountById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check the id and get with the cards and expenses that are present in the account
    const account = await prisma.account.findUnique({
      where: { id: parseInt(id) },
      include: { cards: true, expenses: true },
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Cuenta no encontrada',
      });
    }

    if (account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso para acceder a esta cuenta',
      });
    }

    res.status(200).json({
      success: true,
      data: account,
      message: 'Cuenta obtenida',
    });
  } catch (error) {
    next(error);
  }
};

// UPDATE THE ACCOUNT
exports.updateAccount = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { name, currency } = req.body;

    const account = await prisma.account.findUnique({
      where: { id: parseInt(id) },
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Cuenta no encontrada',
      });
    }

    if (account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso para modificar esta cuenta',
      });
    }

    const updatedAccount = await prisma.account.update({
      where: { id: parseInt(id) },
      data: {
        ...(name && { name }),
        ...(currency && { currency }),
      },
    });

    res.status(200).json({
      success: true,
      data: updatedAccount,
      message: 'Cuenta actualizada',
    });
  } catch (error) {
    next(error);
  }
};

// REMOVE THE ACCOUNT
exports.deleteAccount = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const account = await prisma.account.findUnique({
      where: { id: parseInt(id) },
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Cuenta no encontrada',
      });
    }

    if (account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso para eliminar esta cuenta',
      });
    }

    await prisma.account.delete({
      where: { id: parseInt(id) },
    });

    res.status(200).json({
      success: true,
      message: 'Cuenta eliminada correctamente',
    });
  } catch (error) {
    next(error);
  }
};
