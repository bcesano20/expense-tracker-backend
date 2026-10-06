const express = require('express');
const cardController = require('../controllers/cardController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', authMiddleware, cardController.createCard);
router.get('/account/:accountId', authMiddleware, cardController.getCardsFromAccount);
router.put('/:id', authMiddleware, cardController.updateCard);
router.patch('/:id/cancel', authMiddleware, cardController.cancelCard);
router.delete('/:id', authMiddleware, cardController.deleteCard);

module.exports = router;
