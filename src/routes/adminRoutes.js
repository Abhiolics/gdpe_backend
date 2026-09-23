const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getUsers,
  getUserDetails,
  blockUser,
  unblockUser,
  activateUser,
  deactivateUser,
} = require('../controllers/adminController');
const {
  getAdminSettings,
  updateMaintenance,
  updateControl,
  updatePaymentMethods,
} = require('../controllers/settingController');
const {
  getAllContactsAdmin,
  addContact,
  updateContact,
  deleteContact,
} = require('../controllers/contactController');
const { togglePlan } = require('../controllers/planController');
const { protect, isAdmin } = require('../middlewares/authMiddleware');

// All routes in this router require Admin authorization
router.use(protect, isAdmin);

// Dashboard
router.get('/dashboard', getDashboardStats);

// User Management
router.get('/users', getUsers);
router.get('/users/:id', getUserDetails);
router.patch('/users/:id/block', blockUser);
router.patch('/users/:id/unblock', unblockUser);
router.patch('/users/:id/activate', activateUser);
router.patch('/users/:id/deactivate', deactivateUser);

// App Settings
router.get('/settings', getAdminSettings);
router.put('/settings/maintenance', updateMaintenance);
router.put('/settings/update-control', updateControl);
router.put('/settings/payment', updatePaymentMethods);

// Support Contacts
router.get('/contacts', getAllContactsAdmin);
router.post('/contacts', addContact);
router.put('/contacts/:id', updateContact);
router.delete('/contacts/:id', deleteContact);

// Direct plan toggle from collection: /admin/:id/toggle
router.patch('/:id/toggle', togglePlan);

module.exports = router;
