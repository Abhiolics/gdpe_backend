const express = require('express');
const router = express.Router();
const { getReferralStats, renderReferralLandingPage } = require('../controllers/referralController');
const { protect } = require('../middlewares/authMiddleware');

// App protected referral statistics & team list
router.get('/stats', protect, getReferralStats);
router.get('/dashboard', protect, getReferralStats);

// Public referral link web landing page
router.get('/ref/:code', renderReferralLandingPage);

module.exports = router;
