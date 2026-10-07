const Deposit = require('../models/Deposit');
const User = require('../models/User');
const { adjustWalletBalance, pushNotification } = require('../utils/walletHelper');
const upload = require('../middlewares/uploadMiddleware');

/**
 * Distribute multi-level referral commissions upon successful deposit/order approval
 * Level 1 Referrer: 2%
 * Level 2 Referrer: 1%
 */
const distributeReferralCommission = async (buyerId, amount, referenceId, transactionRef) => {
  try {
    const buyer = await User.findById(buyerId);
    if (!buyer) return;

    // Level 1 Referrer (2% Commission)
    if (buyer.referredBy) {
      const l1Commission = Number((amount * 0.02).toFixed(2));
      if (l1Commission > 0) {
        await adjustWalletBalance({
          userId: buyer.referredBy,
          amount: l1Commission,
          type: 'credit',
          category: 'referral_bonus',
          description: `Level 1 referral commission (2%) from ${buyer.fullName || 'team member'} (Deposit #${transactionRef})`,
          referenceId,
        });

        await pushNotification({
          userId: buyer.referredBy,
          title: 'Referral Commission Received! 🎉',
          message: `You earned ₹${l1Commission} (2% Level 1 commission) from ${buyer.fullName || 'team member'}'s order of ₹${amount}.`,
          type: 'success',
        });
      }
    }

    // Level 2 Referrer (1% Commission)
    if (buyer.referredByL2) {
      const l2Commission = Number((amount * 0.01).toFixed(2));
      if (l2Commission > 0) {
        await adjustWalletBalance({
          userId: buyer.referredByL2,
          amount: l2Commission,
          type: 'credit',
          category: 'referral_bonus',
          description: `Level 2 referral commission (1%) from ${buyer.fullName || 'team member'} (Deposit #${transactionRef})`,
          referenceId,
        });

        await pushNotification({
          userId: buyer.referredByL2,
          title: 'Level 2 Referral Commission Received! 🎉',
          message: `You earned ₹${l2Commission} (1% Level 2 commission) from ${buyer.fullName || 'team member'}'s order of ₹${amount}.`,
          type: 'success',
        });
      }
    }
  } catch (err) {
    console.error('[Referral Commission] Error distributing commission:', err.message);
  }
};

exports.distributeReferralCommission = distributeReferralCommission;

// @desc    Create Deposit (User)
// @route   POST /api/deposits or /deposits
// @access  Private
exports.createDeposit = async (req, res, next) => {
  try {
    const { planId, transactionRef, amount } = req.body;

    if (!transactionRef || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Please provide transaction reference and amount',
      });
    }

    let proofUrl = '';

    if (req.file && req.file.path) {
      proofUrl = req.file.path;
    } else if (req.body.paymentProof) {
      const paymentProofDirect = req.body.paymentProof;
      if (typeof paymentProofDirect === 'string' && (paymentProofDirect.startsWith('data:') || paymentProofDirect.startsWith('http'))) {
        if (paymentProofDirect.startsWith('http')) {
          proofUrl = paymentProofDirect;
        } else {
          const uploadRes = await upload.cloudinary.uploader.upload(paymentProofDirect, {
            folder: 'gdpe/deposits',
            resource_type: 'auto',
          });
          proofUrl = uploadRes.secure_url || uploadRes.url;
        }
      }
    }

    if (!proofUrl) {
      return res.status(400).json({
        success: false,
        message: 'Please upload payment proof image',
      });
    }

    const deposit = await Deposit.create({
      user: req.user.id,
      plan: planId || null,
      transactionRef,
      amount: Number(amount),
      paymentProof: proofUrl,
      status: 'pending',
    });

    await pushNotification({
      userId: req.user.id,
      title: 'Deposit Submitted',
      message: `Your deposit of ₹${amount} (Ref: ${transactionRef}) has been submitted for admin verification.`,
      type: 'deposit',
    });

    res.status(201).json({
      success: true,
      message: 'Deposit request submitted successfully',
      data: deposit,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user's deposits
// @route   GET /api/deposits or /deposits
// @access  Private
exports.getUserDeposits = async (req, res, next) => {
  try {
    const deposits = await Deposit.find({ user: req.user.id })
      .populate('plan', 'name amount')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: deposits.length,
      data: deposits,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all deposits (Admin)
// @route   GET /api/deposits/admin or /deposits/admin
// @access  Private/Admin
exports.getAllDepositsAdmin = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.status = status;

    const total = await Deposit.countDocuments(query);
    const deposits = await Deposit.find(query)
      .populate('user', 'fullName email phoneNumber')
      .populate('plan', 'name amount')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      count: deposits.length,
      total,
      data: deposits,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin approve deposit
// @route   PUT /api/deposits/admin/:id/approve or /deposits/admin/:id/approve
// @access  Private/Admin
exports.approveDeposit = async (req, res, next) => {
  try {
    const deposit = await Deposit.findById(req.params.id);

    if (!deposit) {
      return res.status(404).json({ success: false, message: 'Deposit not found' });
    }

    if (deposit.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Deposit is already ${deposit.status}`,
      });
    }

    deposit.status = 'approved';
    deposit.reviewedBy = req.user.id;
    deposit.reviewedAt = new Date();
    if (req.body.reason) {
      deposit.reason = req.body.reason;
    }
    await deposit.save();

    // If a plan was selected, activate it for the user
    if (deposit.plan) {
      await User.findByIdAndUpdate(deposit.user, {
        plan: deposit.plan,
        planActivatedAt: new Date(),
      });
    }

    // Credit user's wallet with deposit amount
    await adjustWalletBalance({
      userId: deposit.user,
      amount: deposit.amount,
      type: 'credit',
      category: 'deposit',
      description: `Deposit approved (Ref: ${deposit.transactionRef})`,
      referenceId: deposit._id,
    });

    // Distribute 2% Level 1 and 1% Level 2 referral commissions
    await distributeReferralCommission(deposit.user, deposit.amount, deposit._id, deposit.transactionRef);

    await pushNotification({
      userId: deposit.user,
      title: 'Deposit Approved',
      message: `Your deposit of ₹${deposit.amount} has been approved and credited to your wallet.`,
      type: 'success',
    });

    res.status(200).json({
      success: true,
      message: 'Deposit approved successfully',
      data: deposit,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin reject deposit
// @route   PUT /api/deposits/admin/:id/reject or /deposits/admin/:id/reject
// @access  Private/Admin
exports.rejectDeposit = async (req, res, next) => {
  try {
    const deposit = await Deposit.findById(req.params.id);

    if (!deposit) {
      return res.status(404).json({ success: false, message: 'Deposit not found' });
    }

    if (deposit.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Deposit is already ${deposit.status}`,
      });
    }

    deposit.status = 'rejected';
    deposit.reviewedBy = req.user.id;
    deposit.reviewedAt = new Date();
    deposit.reason = req.body.reason || 'Deposit payment proof could not be verified';
    await deposit.save();

    await pushNotification({
      userId: deposit.user,
      title: 'Deposit Rejected',
      message: `Your deposit of ₹${deposit.amount} was rejected. Reason: ${deposit.reason}`,
      type: 'warning',
    });

    res.status(200).json({
      success: true,
      message: 'Deposit rejected successfully',
      data: deposit,
    });
  } catch (error) {
    next(error);
  }
};
