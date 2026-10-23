const prisma = require('../helpers/prisma');
const { ERROR_MESSAGES } = require('../helpers/constants');
const { ZERO, parseAmount } = require('../utils/money');

// Validates :accountId and that the account belongs to the logged user. When it does not pass it
// answers the request itself and returns null, so each handler only needs `if (!accountId) return;`
const authorizeAccount = async (req, res) => {
  const accountId = Number(req.params.accountId);

  if (!Number.isInteger(accountId) || accountId <= 0) {
    res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: ERROR_MESSAGES.ACCOUNT_ID_REQUIRED,
    });
    return null;
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { userId: true },
  });

  if (!account || account.userId !== req.user.id) {
    res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: ERROR_MESSAGES.WALLET_ACCOUNT_PERMISSION,
    });
    return null;
  }

  return accountId;
};

// The three endpoints answer with the same shape. The total is calculated here, never stored:
// wallet balance + balance of the ACTIVE debit cards.
const getWalletSummary = async (accountId) => {
  // Independent queries, so they run at the same time
  const [wallet, debitCards] = await Promise.all([
    prisma.wallet.findUnique({ where: { accountId } }),
    prisma.card.aggregate({
      where: { accountId, type: 'debit', isActive: true },
      _sum: { balance: true },
    }),
  ]);

  const debitBalance = debitCards._sum.balance ?? ZERO;

  return {
    accountId,
    hasWallet: wallet !== null,
    walletBalance: wallet ? wallet.balance : null,
    debitBalance,
    totalBalance: wallet ? wallet.balance.plus(debitBalance) : debitBalance,
  };
};

// ============================================
// GET WALLET (with the calculated total balance)
// ============================================
exports.getWallet = async (req, res, next) => {
  try {
    const accountId = await authorizeAccount(req, res);
    if (!accountId) return;

    res.status(200).json({
      success: true,
      data: await getWalletSummary(accountId),
      message: 'Billetera obtenida',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// ACTIVATE WALLET (with the initial balance)
// ============================================
exports.createWallet = async (req, res, next) => {
  try {
    const accountId = await authorizeAccount(req, res);
    if (!accountId) return;

    // The initial balance is required (0 or more); a missing or invalid one is a 400
    const { balance } = req.body ?? {};
    const initialBalance = parseAmount(balance, { allowZero: true });

    if (!initialBalance) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_AMOUNT',
        message: ERROR_MESSAGES.INVALID_AMOUNT_OR_ZERO,
      });
    }

    await prisma.wallet.create({ data: { accountId, balance: initialBalance } });

    res.status(201).json({
      success: true,
      data: await getWalletSummary(accountId),
      message: 'Billetera activada exitosamente',
    });
  } catch (error) {
    // Unique constraint violation: the account already has a wallet
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: 'CONFLICT',
        message: ERROR_MESSAGES.WALLET_ALREADY_EXISTS,
      });
    }
    next(error);
  }
};

// ============================================
// EDIT WALLET (sets the new total value)
// A correction, not an income: if the money comes from outside, register an income instead.
// ============================================
exports.updateWallet = async (req, res, next) => {
  try {
    const accountId = await authorizeAccount(req, res);
    if (!accountId) return;

    const { balance } = req.body ?? {};
    const newBalance = parseAmount(balance, { allowZero: true });

    if (!newBalance) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_AMOUNT',
        message: ERROR_MESSAGES.INVALID_AMOUNT_OR_ZERO,
      });
    }

    const { count } = await prisma.wallet.updateMany({
      where: { accountId },
      data: { balance: newBalance },
    });

    if (count === 0) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: ERROR_MESSAGES.WALLET_NOT_FOUND,
      });
    }

    res.status(200).json({
      success: true,
      data: await getWalletSummary(accountId),
      message: 'Billetera actualizada',
    });
  } catch (error) {
    next(error);
  }
};
