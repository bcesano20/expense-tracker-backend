const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { authLimiter } = require('../middleware/rateLimiter');
const authController = require('../controllers/authController');

const router = express.Router();

// Public Routes (rate limited: 10 attempts per 15 minutes per IP)
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);

// Protected Routes
router.get('/profile', authMiddleware, authController.getProfile);

module.exports = router;
