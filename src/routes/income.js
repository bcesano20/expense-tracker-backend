const express = require('express');
const incomeController = require('../controllers/incomeController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', authMiddleware, incomeController.createIncome);
router.get('/', authMiddleware, incomeController.getIncomes);
router.get('/:id', authMiddleware, incomeController.getIncomeById);
router.put('/:id', authMiddleware, incomeController.updateIncome);
router.delete('/:id', authMiddleware, incomeController.deleteIncome);

module.exports = router;
