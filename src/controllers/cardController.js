const prisma = require('../helpers/prisma');
const { ERROR_MESSAGES } = require('../helpers/constants');
const { ZERO, parseAmount } = require('../utils/money');
const { takeFromWallet, putIntoWallet, changeWallet } = require('../helpers/wallet');

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

    // Only debit cards keep a balance; credit cards ignore whatever was sent
    let parsedBalance = null;
    if (type === 'debit') {
      parsedBalance = parseAmount(balance, { allowZero: true });

      if (!parsedBalance) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_AMOUNT',
          message: ERROR_MESSAGES.INVALID_AMOUNT_OR_ZERO,
        });
      }
    }

    // The card and the money moved out of the wallet are written together or not at all
    const card = await prisma.$transaction(async (tx) => {
      // The initial balance comes out of the wallet (blocked if it is short). An account
      // without a wallet is not checked: takeFromWallet does nothing for it.
      if (parsedBalance && !parsedBalance.isZero()) {
        await takeFromWallet(tx, account.id, parsedBalance);
      }

      return tx.card.create({
        data: {
          accountId: account.id,
          name,
          bank,
          type,
          network,
          closeDay: type === 'credit' ? parseInt(closeDay) : null,
          balance: parsedBalance,
        },
      });
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
      return res.status(404).json({
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

    const { active } = req.query;
    const where = { accountId: parseInt(accountId) };
    if (active === 'true') where.isActive = true;

    const cards = await prisma.card.findMany({ where });

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
    let newBalance = null;
    if (name) updateData.name = name;
    if (card.type === 'debit' && balance !== undefined) {
      // A cancelled card keeps no money of its own: its balance went back to the wallet
      if (!card.isActive) {
        return res.status(400).json({
          success: false,
          error: 'CARD_CANCELLED',
          message: ERROR_MESSAGES.CARD_CANCELLED_BALANCE,
        });
      }

      newBalance = parseAmount(balance, { allowZero: true });

      if (!newBalance) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_AMOUNT',
          message: ERROR_MESSAGES.INVALID_AMOUNT_OR_ZERO,
        });
      }
      updateData.balance = newBalance;
    }
    if (card.type === 'credit' && closeDay !== undefined) {
      updateData.closeDay = parseInt(closeDay);
    }

    const updatedCard = await prisma.$transaction(async (tx) => {
      if (newBalance) {
        // Read the balance inside the transaction so the difference is not stale
        const current = await tx.card.findUnique({
          where: { id: card.id },
          select: { balance: true },
        });
        const difference = newBalance.minus(current.balance ?? ZERO);

        // Loading the card takes the difference out of the wallet; lowering it puts it back.
        // changeWallet moves the wallet, so the sign is the opposite of the card's.
        if (!difference.isZero()) {
          await changeWallet(tx, card.accountId, difference.negated());
        }
      }

      return tx.card.update({
        where: { id: card.id },
        data: updateData,
      });
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

// CANCEL CARD (soft cancel: keeps the card and the history of its expenses)
exports.cancelCard = async (req, res, next) => {
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
        message: 'No tienes permiso para cancelar esta tarjeta',
      });
    }

    if (!card.isActive) {
      return res.status(400).json({
        success: false,
        error: 'ALREADY_CANCELLED',
        message: 'La tarjeta ya está cancelada',
      });
    }

    const cancelledCard = await prisma.$transaction(async (tx) => {
      const data = { isActive: false, cancelledAt: new Date() };

      if (card.type === 'debit') {
        const current = await tx.card.findUnique({
          where: { id: card.id },
          select: { balance: true },
        });

        // The money left on the card goes back to the wallet. Zero it only when it really
        // moved, so on an account without a wallet the card keeps its balance as before.
        if (current.balance && current.balance.gt(0)) {
          const { applied } = await putIntoWallet(tx, card.accountId, current.balance);
          if (applied) data.balance = 0;
        }
      }

      return tx.card.update({
        where: { id: card.id },
        data,
      });
    });

    res.status(200).json({
      success: true,
      data: cancelledCard,
      message: ERROR_MESSAGES.CARD_CANCEL_SUCCESS,
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

    await prisma.$transaction(async (tx) => {
      if (card.type === 'debit') {
        const current = await tx.card.findUnique({
          where: { id: card.id },
          select: { balance: true, isActive: true },
        });

        // Only an active card's balance counts as the account's money; a cancelled card has
        // already given it back, so there is nothing to return
        if (current.isActive && current.balance && current.balance.gt(0)) {
          await putIntoWallet(tx, card.accountId, current.balance);
        }
      }

      // The card's installments and expense links are deleted on cascade; the expenses stay
      await tx.card.delete({
        where: { id: card.id },
      });
    });

    res.status(200).json({
      success: true,
      message: 'Tarjeta eliminada correctamente',
    });
  } catch (error) {
    next(error);
  }
};
