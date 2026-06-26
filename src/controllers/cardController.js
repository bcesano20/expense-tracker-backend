const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// CREATE CARD
exports.createCard = async (req, res, next) => {
  try {
    const { accountId, name, bank, type, network, closeDay, balance } = req.body;
    const userId = req.user.id;

    if (!accountId || !name || !bank || !type || !network) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'La cuenta, el nombre, banco, tipo y red de la tarjeta son requeridos',
      });
    }

    // Check that the account exists and is user's property
    const account = await prisma.account.findUnique({
      where: { id: parseInt(accountId) },
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
        message: 'No tienes permiso para agregar tarjetas a esta cuenta',
      });
    }

    // Validar según tipo de tarjeta
    if (type === 'credit' && !closeDay) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Las tarjetas de crédito requieren un día de cierre',
      });
    }

    if (type === 'debit' && !balance) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Las tarjetas de débito requieren un saldo inicial',
      });
    }

    const card = await prisma.card.create({
      data: {
        accountId: parseInt(accountId),
        name,
        bank,
        type,
        network,
        closeDay: type === 'credit' ? parseInt(closeDay) : null,
        balance: type === 'debit' ? parseFloat(balance) : null,
      },
    });

    res.status(201).json({
      success: true,
      data: card,
      message: 'Tarjeta creada exitosamente',
    });
  } catch (error) {
    next(error);
  }
};

// GET THE CARDS FROM AN ACCOUNT
exports.getCardsFromAccount = async (req, res, next) => {
  try {
    const { accountId } = req.params;
    const usuarioId = req.user.id;

    // Check account exists and user's permisson
    const account = await prisma.account.findUnique({
      where: { id: parseInt(accountId) },
    });

    if (!account) {
      return res.statususerId(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Cuenta no encontrada',
      });
    }

    if (account.userId !== usuarioId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso para ver las tarjetas de esta cuenta',
      });
    }

    const cards = await prisma.card.findMany({
      where: { accountId: parseInt(accountId) },
    });

    res.status(200).json({
      success: true,
      data: cards,
      message: 'Tarjetas obtenidas',
    });
  } catch (error) {
    next(error);
  }
};

// UPDATE CARD
exports.updateCard = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { name, balance, closeDay } = req.body;

    // Get Cards by the Id
    const card = await prisma.card.findUnique({
      where: { id: parseInt(id) },
      include: { account: true },
    });

    if (!card) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Tarjeta no encontrada',
      });
    }

    if (card.account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso para modificar esta tarjeta',
      });
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (card.type === 'debit' && balance !== undefined) {
      updateData.balance = parseFloat(balance);
    }
    if (card.type === 'credit' && closeDay !== undefined) {
      updateData.closeDay = parseInt(closeDay);
    }

    const updatedCard = await prisma.card.update({
      where: { id: parseInt(id) },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      data: updatedCard,
      message: 'Tarjeta actualizada',
    });
  } catch (error) {
    next(error);
  }
};

// REMOVE CARD
exports.deleteCard = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const card = await prisma.card.findUnique({
      where: { id: parseInt(id) },
      include: { account: true },
    });

    if (!card) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Tarjeta no encontrada',
      });
    }

    if (card.account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso para eliminar esta tarjeta',
      });
    }

    await prisma.card.delete({
      where: { id: parseInt(id) },
    });

    res.status(200).json({
      success: true,
      message: 'Tarjeta eliminada correctamente',
    });
  } catch (error) {
    next(error);
  }
};
