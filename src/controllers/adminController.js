const User = require('../models/User');
const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');
const TaskSubmission = require('../models/TaskSubmission');
const Task = require('../models/Task');
const Plan = require('../models/Plan');
const Wallet = require('../models/Wallet');
const Upi = require('../models/Upi');
const Transaction = require('../models/Transaction');

// @desc    Get Admin Dashboard Stats
// @route   GET /api/admin/dashboard
// @access  Private/Admin
exports.getDashboardStats = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'user' });
    const activeUsers = await User.countDocuments({ role: 'user', isActive: true, isBlocked: false });
    const blockedUsers = await User.countDocuments({ role: 'user', isBlocked: true });

    // Deposit stats
    const depositStats = await Deposit.aggregate([
      {
        $group: {
          _id: '$status',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    let approvedDeposits = 0;
    let pendingDeposits = 0;
    depositStats.forEach((stat) => {
      if (stat._id === 'approved') approvedDeposits = stat.totalAmount;
      if (stat._id === 'pending') pendingDeposits = stat.count;
    });

    // Withdrawal stats
    const withdrawalStats = await Withdrawal.aggregate([
      {
        $group: {
          _id: '$status',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    let approvedWithdrawals = 0;
    let pendingWithdrawals = 0;
    withdrawalStats.forEach((stat) => {
      if (stat._id === 'approved') approvedWithdrawals = stat.totalAmount;
      if (stat._id === 'pending') pendingWithdrawals = stat.count;
    });

    const pendingSubmissions = await TaskSubmission.countDocuments({ status: 'pending' });
    const totalPlans = await Plan.countDocuments();
    const totalTasks = await Task.countDocuments();

    // Total wallet balances
    const walletStats = await Wallet.aggregate([
      {
        $group: {
          _id: null,
          totalWalletBalance: { $sum: '$balance' },
        },
      },
    ]);
    const totalWalletBalance = walletStats.length > 0 ? walletStats[0].totalWalletBalance : 0;

    res.status(200).json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          active: activeUsers,
          blocked: blockedUsers,
        },
        deposits: {
          totalApprovedAmount: approvedDeposits,
          pendingCount: pendingDeposits,
        },
        withdrawals: {
          totalApprovedAmount: approvedWithdrawals,
          pendingCount: pendingWithdrawals,
        },
        tasks: {
          totalTasks,
          pendingSubmissions,
        },
        plans: {
          totalPlans,
        },
        wallets: {
          totalWalletBalance,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all users with pagination and search
// @route   GET /api/admin/users
// @access  Private/Admin
exports.getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const query = { role: 'user' };

    if (search) {
      const upiMatches = await Upi.find({
        $or: [
          { upiId: { $regex: search, $options: 'i' } },
          { accountHolderName: { $regex: search, $options: 'i' } },
        ],
      }).distinct('userId');

      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } },
        { _id: { $in: upiMatches } },
      ];
    }

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .populate('plan')
      .populate('wallet')
      .populate('referredBy', 'fullName email referralCode')
      .populate({
        path: 'upis',
        options: { sort: { isPrimary: -1, createdAt: -1 } },
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const userIds = users.map((u) => u._id);

    // Aggregate completed referral commissions
    const commissionStats = await Transaction.aggregate([
      {
        $match: {
          user: { $in: userIds },
          category: 'referral_bonus',
          status: 'completed',
        },
      },
      {
        $group: {
          _id: '$user',
          totalCommission: { $sum: '$amount' },
        },
      },
    ]);

    // Aggregate completed transactions (credited & debited)
    const transactionStats = await Transaction.aggregate([
      {
        $match: {
          user: { $in: userIds },
          status: 'completed',
        },
      },
      {
        $group: {
          _id: { user: '$user', type: '$type' },
          total: { $sum: '$amount' },
        },
      },
    ]);

    const commMap = {};
    commissionStats.forEach((c) => {
      commMap[c._id.toString()] = Number((c.totalCommission || 0).toFixed(2));
    });

    const creditMap = {};
    const debitMap = {};
    transactionStats.forEach((t) => {
      const uId = t._id.user.toString();
      if (t._id.type === 'credit') {
        creditMap[uId] = Number((t.total || 0).toFixed(2));
      } else if (t._id.type === 'debit') {
        debitMap[uId] = Number((t.total || 0).toFixed(2));
      }
    });

    const formattedUsers = users.map((u) => {
      const uObj = u.toObject();
      const uId = u._id.toString();
      const currentBalance = Number((u.wallet?.balance || 0).toFixed(2));
      const rawCommission = commMap[uId] || 0;

      // Breakdown: amount + commission = total
      const commission = Number(Math.min(rawCommission, currentBalance).toFixed(2));
      const amount = Number(Math.max(0, currentBalance - commission).toFixed(2));
      const total = Number((amount + commission).toFixed(2));

      const totalCredited = creditMap[uId] || 0;
      const totalDebited = debitMap[uId] || 0;

      if (uObj.wallet) {
        uObj.wallet.amount = amount;
        uObj.wallet.commission = commission;
        uObj.wallet.total = total;
        uObj.wallet.totalCommission = rawCommission;
        uObj.wallet.totalCredited = totalCredited;
        uObj.wallet.totalDebited = totalDebited;
      } else {
        uObj.wallet = {
          balance: 0,
          pendingBalance: 0,
          amount: 0,
          commission: 0,
          total: 0,
          totalCommission: rawCommission,
          totalCredited,
          totalDebited,
        };
      }

      uObj.amount = amount;
      uObj.commission = commission;
      uObj.total = total;
      uObj.totalCommission = rawCommission;

      return uObj;
    });

    res.status(200).json({
      success: true,
      count: formattedUsers.length,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      data: formattedUsers,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single user details
// @route   GET /api/admin/users/:id
// @access  Private/Admin
exports.getUserDetails = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('plan')
      .populate('wallet')
      .populate('referredBy', 'fullName email referralCode')
      .populate({
        path: 'upis',
        options: { sort: { isPrimary: -1, createdAt: -1 } },
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const rawCommissionAgg = await Transaction.aggregate([
      {
        $match: {
          user: user._id,
          category: 'referral_bonus',
          status: 'completed',
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const rawCommission = Number((rawCommissionAgg[0]?.total || 0).toFixed(2));

    const txStats = await Transaction.aggregate([
      {
        $match: {
          user: user._id,
          status: 'completed',
        },
      },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
        },
      },
    ]);

    let totalCredited = 0;
    let totalDebited = 0;
    txStats.forEach((t) => {
      if (t._id === 'credit') totalCredited = Number((t.total || 0).toFixed(2));
      if (t._id === 'debit') totalDebited = Number((t.total || 0).toFixed(2));
    });

    const uObj = user.toObject();
    const currentBalance = Number((user.wallet?.balance || 0).toFixed(2));
    const commission = Number(Math.min(rawCommission, currentBalance).toFixed(2));
    const amount = Number(Math.max(0, currentBalance - commission).toFixed(2));
    const total = Number((amount + commission).toFixed(2));

    if (uObj.wallet) {
      uObj.wallet.amount = amount;
      uObj.wallet.commission = commission;
      uObj.wallet.total = total;
      uObj.wallet.totalCommission = rawCommission;
      uObj.wallet.totalCredited = totalCredited;
      uObj.wallet.totalDebited = totalDebited;
    } else {
      uObj.wallet = {
        balance: 0,
        pendingBalance: 0,
        amount: 0,
        commission: 0,
        total: 0,
        totalCommission: rawCommission,
        totalCredited,
        totalDebited,
      };
    }

    uObj.amount = amount;
    uObj.commission = commission;
    uObj.total = total;
    uObj.totalCommission = rawCommission;

    res.status(200).json({
      success: true,
      data: uObj,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Block user
// @route   PATCH /api/admin/users/:id/block
// @access  Private/Admin
exports.blockUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBlocked: true },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({
      success: true,
      message: 'User has been blocked successfully',
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Unblock user
// @route   PATCH /api/admin/users/:id/unblock
// @access  Private/Admin
exports.unblockUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBlocked: false },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({
      success: true,
      message: 'User has been unblocked successfully',
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Activate user
// @route   PATCH /api/admin/users/:id/activate
// @access  Private/Admin
exports.activateUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: true },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({
      success: true,
      message: 'User has been activated successfully',
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Deactivate user
// @route   PATCH /api/admin/users/:id/deactivate
// @access  Private/Admin
exports.deactivateUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({
      success: true,
      message: 'User has been deactivated successfully',
      data: user,
    });
  } catch (error) {
    next(error);
  }
};
