const express = require('express');

const budgetController = require('../controllers/budgetController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', authMiddleware, budgetController.createBudget);
router.get('/', authMiddleware, budgetController.getBudgets);
router.get('/:id', authMiddleware, budgetController.getBudgetById);
router.put('/:id', authMiddleware, budgetController.updateBudget);
router.delete('/:id', authMiddleware, budgetController.deleteBudget);

module.exports = router;
