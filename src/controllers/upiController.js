const Upi = require('../models/Upi');

// @desc    Get logged in user's UPI addresses
// @route   GET /api/upi/my
// @access  Private
exports.getMyUpi = async (req, res, next) => {
  try {
    const upis = await Upi.find({ userId: req.user._id }).sort({ isPrimary: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: upis.length,
      data: upis,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new user UPI address
// @route   POST /api/upi
// @access  Private
exports.createUpi = async (req, res, next) => {
  try {
    const { upiId, accountHolderName, isPrimary } = req.body;

    const resolvedUpiId = (upiId || req.body.upi || req.body.upi_id || '').trim();
    const resolvedHolderName = (
      accountHolderName ||
      req.body.name ||
      req.body.payeeName ||
      req.body.holderName ||
      req.user?.fullName ||
      'User Account'
    ).trim();

    if (!resolvedUpiId) {
      return res.status(400).json({
        success: false,
        message: 'UPI ID is required',
      });
    }

    const existingCount = await Upi.countDocuments({ userId: req.user._id });
    const makePrimary = existingCount === 0 ? true : Boolean(isPrimary);

    if (makePrimary) {
      await Upi.updateMany({ userId: req.user._id }, { isPrimary: false });
    }

    // Check if user already registered this exact UPI ID
    let upi = await Upi.findOne({
      userId: req.user._id,
      upiId: { $regex: `^${resolvedUpiId}$`, $options: 'i' },
    });

    if (upi) {
      upi.accountHolderName = resolvedHolderName;
      if (makePrimary) upi.isPrimary = true;
      await upi.save();

      return res.status(200).json({
        success: true,
        message: 'UPI address updated successfully',
        data: upi,
      });
    }

    upi = await Upi.create({
      userId: req.user._id,
      upiId: resolvedUpiId,
      accountHolderName: resolvedHolderName,
      isPrimary: makePrimary,
    });

    res.status(201).json({
      success: true,
      message: 'UPI address registered successfully',
      data: upi,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user UPI address
// @route   PUT /api/upi/:id
// @access  Private
exports.updateUpi = async (req, res, next) => {
  try {
    const { id } = req.params;
    const upi = await Upi.findOne({ _id: id, userId: req.user._id });

    if (!upi) {
      return res.status(404).json({
        success: false,
        message: 'UPI record not found',
      });
    }

    const { upiId, accountHolderName, isPrimary } = req.body;

    if (isPrimary) {
      await Upi.updateMany({ userId: req.user._id }, { isPrimary: false });
      upi.isPrimary = true;
    } else if (isPrimary === false) {
      upi.isPrimary = false;
    }

    if (upiId) upi.upiId = upiId.trim();
    if (accountHolderName) upi.accountHolderName = accountHolderName.trim();

    await upi.save();

    res.status(200).json({
      success: true,
      message: 'UPI address updated successfully',
      data: upi,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete user UPI address
// @route   DELETE /api/upi/:id
// @access  Private
exports.deleteUpi = async (req, res, next) => {
  try {
    const { id } = req.params;
    const upi = await Upi.findOneAndDelete({ _id: id, userId: req.user._id });

    if (!upi) {
      return res.status(404).json({
        success: false,
        message: 'UPI record not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'UPI address removed successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all registered UPI accounts (Admin)
// @route   GET /api/upi/admin/all
// @access  Private/Admin
exports.getAllUpisAdmin = async (req, res, next) => {
  try {
    const upis = await Upi.find()
      .populate('userId', 'fullName email phoneNumber')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: upis.length,
      data: upis,
    });
  } catch (error) {
    next(error);
  }
};
