const express = require('express');
const walletController = require('../controllers/walletController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/account/:accountId', authMiddleware, walletController.getWallet);
router.post('/account/:accountId', authMiddleware, walletController.createWallet);
router.put('/account/:accountId', authMiddleware, walletController.updateWallet);

module.exports = router;
