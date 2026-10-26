const express = require('express');
const monthClosingController = require('../controllers/monthClosingController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', authMiddleware, monthClosingController.getMonthClosings);
router.get('/preview', authMiddleware, monthClosingController.getClosingPreview);
router.post('/', authMiddleware, monthClosingController.closeMonth);

module.exports = router;
