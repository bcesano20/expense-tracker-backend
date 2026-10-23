const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { ERROR_MESSAGES } = require('./helpers/constants');
const { InsufficientFundsError } = require('./helpers/wallet');
const timeZoneMiddleware = require('./middleware/timeZoneMiddleware');

const app = express();

// Railway sits behind one reverse proxy; trust it so req.ip is the real client IP
app.set('trust proxy', 1);

// Route imports
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/user');
const accountsRoutes = require('./routes/account');
const cardsRoutes = require('./routes/card');
const expensesRoutes = require('./routes/expense');
const reportsRoutes = require('./routes/report');
const categoryRoutes = require('./routes/category');
const incomesRoutes = require('./routes/income');
const budgetsRoutes = require('./routes/budget');
const walletsRoutes = require('./routes/wallet');
const installmentsRoutes = require('./routes/installment');

// Middlewares
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());
app.use(timeZoneMiddleware);

// Routes to use and activate
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/cards', cardsRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/incomes', incomesRoutes);
app.use('/api/budgets', budgetsRoutes);
app.use('/api/wallets', walletsRoutes);
app.use('/api/installments', installmentsRoutes);

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend funcionando ✅' });
});

// Express identifies error handlers by their 4 parameters, so `next` must stay even if unused
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Expected business error raised by the wallet helpers: tell the user how much is missing
  if (err instanceof InsufficientFundsError) {
    const isCard = err.source === 'card';

    return res.status(400).json({
      success: false,
      error: isCard ? 'INSUFFICIENT_CARD_FUNDS' : 'INSUFFICIENT_FUNDS',
      message: `${isCard ? ERROR_MESSAGES.INSUFFICIENT_CARD_FUNDS : ERROR_MESSAGES.INSUFFICIENT_FUNDS}. Faltan ${err.shortfall.toFixed(2)}`,
    });
  }

  console.error(err);
  res.status(500).json({
    success: false,
    error: 'SERVER_ERROR',
    message: err.message || 'Error interno del servidor',
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});

module.exports = app;
