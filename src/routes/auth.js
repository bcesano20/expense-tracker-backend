const express = require('express');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Public Routes
router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected Routes
router.get('/profile', authMiddleware, authController.getProfile);

module.exports = router;
