const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Please add a full name'],
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: [true, 'Please add a phone number'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please add an email'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email',
      ],
    },
    password: {
      type: String,
      required: [true, 'Please add a password'],
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
    },
    otp: {
      type: String,
    },
    otpExpires: {
      type: Date,
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      default: null,
    },
    planActivatedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for wallet
userSchema.virtual('wallet', {
  ref: 'Wallet',
  localField: '_id',
  foreignField: 'user',
  justOne: true,
});

// Virtual for registered UPI accounts
userSchema.virtual('upis', {
  ref: 'Upi',
  localField: '_id',
  foreignField: 'userId',
});

// Virtual getter for primary/active UPI object
userSchema.virtual('upi').get(function () {
  if (this.upis && Array.isArray(this.upis) && this.upis.length > 0) {
    return this.upis.find((u) => u.isPrimary) || this.upis[0];
  }
  return null;
});

// Virtual getter for primary UPI ID string
userSchema.virtual('upiId').get(function () {
  if (this.upis && Array.isArray(this.upis) && this.upis.length > 0) {
    const primary = this.upis.find((u) => u.isPrimary) || this.upis[0];
    return primary ? primary.upiId : null;
  }
  return null;
});

// Virtual getter for all registered UPI ID strings
userSchema.virtual('upiIds').get(function () {
  if (this.upis && Array.isArray(this.upis) && this.upis.length > 0) {
    return this.upis.map((u) => u.upiId).filter(Boolean);
  }
  return [];
});

const getAdminEmail = () => {
  if (
    process.env.ADMIN_EMAIL &&
    process.env.ADMIN_EMAIL.trim().toLowerCase() !== 'admin@example.com'
  ) {
    return process.env.ADMIN_EMAIL.trim().toLowerCase();
  }
  return 'keralawins123@gmail.com';
};

// Encrypt password using bcrypt and enforce admin role constraints
userSchema.pre('save', async function (next) {
  const adminEmail = getAdminEmail();
  // Enforce authorized admin email is strictly admin, other emails are user
  if (this.email && this.email.toLowerCase().trim() === adminEmail) {
    this.role = 'admin';
  } else if (this.role === 'admin') {
    this.role = 'user';
  }

  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Sign JWT and return (ensures authorized admin email always has admin role in JWT)
userSchema.methods.getSignedJwtToken = function () {
  const adminEmail = getAdminEmail();
  const role =
    this.email && this.email.toLowerCase().trim() === adminEmail
      ? 'admin'
      : this.role;
  return jwt.sign({ id: this._id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '30d',
  });
};

module.exports = mongoose.model('User', userSchema);
