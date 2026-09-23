const express = require('express');
const router = express.Router();
const {
  register,
  login,
  sendOtp,
  verifyOtp,
  getMe,
  updateProfile,
  verifyEmail,
} = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');

router.post('/register', register);
router.post('/login', login);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.get('/me', protect, getMe);
router.put('/update-profile', protect, updateProfile);
router.get('/verify-email/:token', verifyEmail);

module.exports = router;
