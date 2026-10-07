const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Deposit = require('../models/Deposit');
const Transaction = require('../models/Transaction');
const connectDB = require('../config/db');

const { generateUniqueReferralCode, ensureReferralCode } = require('../controllers/authController');
const { distributeReferralCommission } = require('../controllers/depositController');
const { adjustWalletBalance } = require('../utils/walletHelper');

async function runTest() {
  try {
    console.log('🔄 Connecting to Database...');
    await connectDB();
    console.log('✅ Connected to MongoDB!');

    // Cleanup test users
    const testEmails = [
      'ref_user_a@test.com',
      'ref_user_b@test.com',
      'ref_user_c@test.com',
    ];
    await User.deleteMany({ email: { $in: testEmails } });
    console.log('🧹 Cleaned up old test users.');

    // 1. Create User A (Root User)
    const codeA = await generateUniqueReferralCode();
    const userA = await User.create({
      fullName: 'User A (Root)',
      phoneNumber: '9990001111',
      email: 'ref_user_a@test.com',
      password: 'password123',
      referralCode: codeA,
    });
    await Wallet.create({ user: userA._id, balance: 0 });
    console.log(`✅ User A created. Referral Code: ${userA.referralCode}`);

    // 2. Create User B (Referred by User A - Level 1 of A)
    const codeB = await generateUniqueReferralCode();
    const userB = await User.create({
      fullName: 'User B (L1 of A)',
      phoneNumber: '9990002222',
      email: 'ref_user_b@test.com',
      password: 'password123',
      referralCode: codeB,
      referredBy: userA._id,
      referredByL2: null,
    });
    await Wallet.create({ user: userB._id, balance: 0 });
    console.log(`✅ User B created. Referred by A (${userA._id}). Referral Code: ${userB.referralCode}`);

    // 3. Create User C (Referred by User B - Level 1 of B, Level 2 of A)
    const codeC = await generateUniqueReferralCode();
    const userC = await User.create({
      fullName: 'User C (L1 of B, L2 of A)',
      phoneNumber: '9990003333',
      email: 'ref_user_c@test.com',
      password: 'password123',
      referralCode: codeC,
      referredBy: userB._id,
      referredByL2: userA._id,
    });
    await Wallet.create({ user: userC._id, balance: 0 });
    console.log(`✅ User C created. Referred by B (${userB._id}), L2 Referrer: A (${userA._id})`);

    // 4. User C makes an order / deposit of ₹1,000
    const depositAmount = 1000;
    const deposit = await Deposit.create({
      user: userC._id,
      transactionRef: 'TEST_REF_1000',
      amount: depositAmount,
      paymentProof: 'http://example.com/proof.jpg',
      status: 'pending',
    });
    console.log(`✅ User C submitted deposit request of ₹${depositAmount}`);

    // Approve Deposit and trigger wallet credit + referral commissions
    deposit.status = 'approved';
    await deposit.save();

    await adjustWalletBalance({
      userId: userC._id,
      amount: depositAmount,
      type: 'credit',
      category: 'deposit',
      description: `Deposit approved (Ref: ${deposit.transactionRef})`,
      referenceId: deposit._id,
    });

    // Distribute Commissions: L1 gets 2% (₹20), L2 gets 1% (₹10)
    await distributeReferralCommission(userC._id, depositAmount, deposit._id, deposit.transactionRef);
    console.log('✅ Referral commission distribution triggered!');

    // 5. Verify Wallets
    const walletA = await Wallet.findOne({ user: userA._id });
    const walletB = await Wallet.findOne({ user: userB._id });
    const walletC = await Wallet.findOne({ user: userC._id });

    console.log('\n--- 💰 WALLET BALANCES AFTER COMMISSION ---');
    console.log(`User C (Depositor): ₹${walletC.balance}`);
    console.log(`User B (Level 1 Referrer - expected 2% = ₹20): ₹${walletB.balance}`);
    console.log(`User A (Level 2 Referrer - expected 1% = ₹10): ₹${walletA.balance}`);

    if (walletB.balance === 20 && walletA.balance === 10) {
      console.log('🎉 PERFECT! Multi-level commission (2% L1, 1% L2) calculated and credited accurately!');
    } else {
      console.error(`❌ Mismatch! Wallet B: ${walletB.balance}, Wallet A: ${walletA.balance}`);
    }

    // Cleanup test records
    await User.deleteMany({ email: { $in: testEmails } });
    await Wallet.deleteMany({ user: { $in: [userA._id, userB._id, userC._id] } });
    await Deposit.deleteMany({ user: userC._id });
    await Transaction.deleteMany({ user: { $in: [userA._id, userB._id, userC._id] } });
    console.log('🧹 Cleaned up test data.');

    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  }
}

runTest();
