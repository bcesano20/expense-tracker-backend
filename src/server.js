const express = require('express');
const cors = require('cors');
require('dotenv').config();

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

// Middlewares
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

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

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend funcionando ✅' });
});

// Express identifies error handlers by their 4 parameters, so `next` must stay even if unused
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
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
