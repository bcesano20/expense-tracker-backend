const express = require('express');
const installmentController = require('../controllers/installmentController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/due', authMiddleware, installmentController.getDueInstallments);
router.post('/pay', authMiddleware, installmentController.payInstallments);

module.exports = router;
