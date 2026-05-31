// src/routes/reports.js
const express = require('express');
const reportController = require('../controllers/reportController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// All the reports required auth
router.get('/monthly', authMiddleware, reportController.getMonthlyReport);
router.get('/summary', authMiddleware, reportController.getQuickSummary);
router.get('/category', authMiddleware, reportController.getCategoryAnalysis);
router.get('/cards', authMiddleware, reportController.getCardDetails);
router.get('/comparison', authMiddleware, reportController.getMonthComparison);

module.exports = router;