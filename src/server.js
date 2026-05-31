// src/server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Route imports
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/user');
const accountsRoutes = require('./routes/account');
const cardsRoutes = require('./routes/card');

// Middlewares
app.use(cors());
app.use(express.json());

// Routes to use and activate
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/cards', cardsRoutes);

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend funcionando ✅' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});

module.exports = app;