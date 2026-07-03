const express = require('express');
const expenseController = require('../controllers/expenseController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', authMiddleware, expenseController.createExpense);
router.get('/', authMiddleware, expenseController.getExpense);
router.get('/:id', authMiddleware, expenseController.getExpenseById);
router.put('/:id', authMiddleware, expenseController.updateExpense);
router.delete('/:id', authMiddleware, expenseController.deleteExpense);

module.exports = router;
