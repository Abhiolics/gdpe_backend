const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Deposit = require('../models/Deposit');
const { ensureReferralCode } = require('./authController');

// @desc    Get Referral Stats & Team Breakdown for Mobile App
// @route   GET /api/referral/stats or /referral/stats
// @access  Private
exports.getReferralStats = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const referralCode = await ensureReferralCode(user);

    const host = req.headers.host || 'gdpe.info';
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const referralLink = `${protocol}://${host}/ref/${referralCode}`;

    // Date boundaries for today and yesterday
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const endOfYesterday = new Date(startOfToday);
    endOfYesterday.setMilliseconds(-1);

    // 1. Total Commission All-Time
    const totalCommAgg = await Transaction.aggregate([
      {
        $match: {
          user: user._id,
          category: 'referral_bonus',
          status: 'completed',
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const totalCommission = Number((totalCommAgg[0]?.total || 0).toFixed(2));

    // 2. Today's Commission
    const todayCommAgg = await Transaction.aggregate([
      {
        $match: {
          user: user._id,
          category: 'referral_bonus',
          status: 'completed',
          createdAt: { $gte: startOfToday },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const todayCommission = Number((todayCommAgg[0]?.total || 0).toFixed(2));

    // 3. Yesterday's Commission
    const yesterdayCommAgg = await Transaction.aggregate([
      {
        $match: {
          user: user._id,
          category: 'referral_bonus',
          status: 'completed',
          createdAt: { $gte: startOfYesterday, $lte: endOfYesterday },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const yesterdayCommission = Number((yesterdayCommAgg[0]?.total || 0).toFixed(2));

    // 4. Team Members Breakdown (Level 1 and Level 2)
    const l1Users = await User.find({ referredBy: user._id })
      .select('fullName email phoneNumber createdAt')
      .sort({ createdAt: -1 });

    const l2Users = await User.find({ referredByL2: user._id })
      .select('fullName email phoneNumber createdAt')
      .sort({ createdAt: -1 });

    const l1Ids = l1Users.map((u) => u._id);
    const l2Ids = l2Users.map((u) => u._id);
    const allTeamIds = [...l1Ids, ...l2Ids];

    // Aggregated team deposits per user
    const memberDepositMap = {};
    if (allTeamIds.length > 0) {
      const depositAgg = await Deposit.aggregate([
        {
          $match: {
            user: { $in: allTeamIds },
            status: 'approved',
          },
        },
        { $group: { _id: '$user', total: { $sum: '$amount' } } },
      ]);

      depositAgg.forEach((item) => {
        memberDepositMap[item._id.toString()] = item.total;
      });
    }

    // 5. Total Team Deposits
    let level1TeamDeposit = 0;
    l1Ids.forEach((id) => {
      level1TeamDeposit += memberDepositMap[id.toString()] || 0;
    });

    let level2TeamDeposit = 0;
    l2Ids.forEach((id) => {
      level2TeamDeposit += memberDepositMap[id.toString()] || 0;
    });

    const totalTeamDeposit = Number((level1TeamDeposit + level2TeamDeposit).toFixed(2));
    const totalMembers = l1Users.length + l2Users.length;

    // Combine team member details for response
    const teamMembers = [
      ...l1Users.map((u) => ({
        id: u._id,
        fullName: u.fullName,
        email: u.email,
        phoneNumber: u.phoneNumber,
        level: 1,
        totalDeposit: memberDepositMap[u._id.toString()] || 0,
        createdAt: u.createdAt,
      })),
      ...l2Users.map((u) => ({
        id: u._id,
        fullName: u.fullName,
        email: u.email,
        phoneNumber: u.phoneNumber,
        level: 2,
        totalDeposit: memberDepositMap[u._id.toString()] || 0,
        createdAt: u.createdAt,
      })),
    ];

    res.status(200).json({
      success: true,
      data: {
        referralCode,
        referralLink,
        totalCommission,
        todayCommission,
        yesterdayCommission,
        totalMembers,
        level1Count: l1Users.length,
        level2Count: l2Users.length,
        totalTeamDeposit,
        level1TeamDeposit: Number(level1TeamDeposit.toFixed(2)),
        level2TeamDeposit: Number(level2TeamDeposit.toFixed(2)),
        teamMembers,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Web Referral Landing Page (Opens when clicking link like gdpe.info/ref/CODE)
// @route   GET /ref/:code or /api/ref/:code
// @access  Public
exports.renderReferralLandingPage = async (req, res, next) => {
  try {
    const { code } = req.params;
    const cleanCode = (code || '').toUpperCase().trim();

    let inviterName = 'a GDPE Member';
    if (cleanCode) {
      const inviter = await User.findOne({ referralCode: cleanCode });
      if (inviter && inviter.fullName) {
        inviterName = inviter.fullName;
      }
    }

    const host = req.headers.host || 'gdpe.info';
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const apkDownloadUrl = `${protocol}://${host}/uploads/gdpe.apk`;
    const registerApiUrl = `${protocol}://${host}/api/auth/register`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GDPE App - Join & Earn</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Outfit', sans-serif; }
    body {
      background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #311042 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      color: #f8fafc;
      padding: 20px;
    }
    .card {
      background: rgba(30, 41, 59, 0.7);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 24px;
      max-width: 440px;
      width: 100%;
      padding: 32px 24px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      text-align: center;
    }
    .badge {
      display: inline-block;
      background: linear-gradient(90deg, #6366f1, #a855f7);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      padding: 6px 16px;
      border-radius: 20px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 20px;
    }
    h1 { font-size: 26px; font-weight: 800; margin-bottom: 8px; color: #ffffff; }
    p.subtitle { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
    .invite-box {
      background: rgba(255, 255, 255, 0.05);
      border: 1px dashed rgba(168, 85, 247, 0.4);
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .invite-text { font-size: 13px; color: #cbd5e1; margin-bottom: 6px; }
    .code-tag {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: 2px;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.1);
      display: inline-block;
      padding: 6px 20px;
      border-radius: 12px;
    }
    .btn-download {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: #ffffff;
      text-decoration: none;
      font-size: 16px;
      font-weight: 700;
      padding: 16px;
      border-radius: 16px;
      box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.4);
      transition: transform 0.2s;
      margin-bottom: 24px;
    }
    .btn-download:hover { transform: translateY(-2px); }
    .divider { display: flex; align-items: center; text-align: center; color: #64748b; font-size: 12px; margin-bottom: 20px; }
    .divider::before, .divider::after { content: ''; flex: 1; border-bottom: 1px solid rgba(255,255,255,0.1); }
    .divider span { padding: 0 10px; }
    .form-group { text-align: left; margin-bottom: 14px; }
    label { font-size: 12px; color: #94a3b8; font-weight: 600; display: block; margin-bottom: 4px; }
    input {
      width: 100%;
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      background: rgba(15, 23, 42, 0.6);
      color: #fff;
      font-size: 14px;
      outline: none;
    }
    input:focus { border-color: #818cf8; }
    .btn-submit {
      width: 100%;
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      color: #ffffff;
      border: none;
      font-size: 15px;
      font-weight: 700;
      padding: 14px;
      border-radius: 12px;
      cursor: pointer;
      margin-top: 8px;
    }
    .status-msg { margin-top: 12px; font-size: 13px; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">GDPE Official Invite</div>
    <h1>You are Invited!</h1>
    <p class="subtitle">Join GDPE today & start earning 2-level commissions</p>
    
    <div class="invite-box">
      <div class="invite-text">Invited by <strong>${inviterName}</strong></div>
      <div class="code-tag">${cleanCode || 'GDPE'}</div>
    </div>

    <a href="${apkDownloadUrl}" class="btn-download">
      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
      Download Official APK
    </a>

    <div class="divider"><span>OR REGISTER DIRECTLY ON WEB</span></div>

    <form id="regForm">
      <input type="hidden" name="referralCode" value="${cleanCode}">
      <div class="form-group">
        <label>Full Name</label>
        <input type="text" id="fullName" placeholder="Enter full name" required>
      </div>
      <div class="form-group">
        <label>Phone Number</label>
        <input type="tel" id="phoneNumber" placeholder="Enter phone number" required>
      </div>
      <div class="form-group">
        <label>Email Address</label>
        <input type="email" id="email" placeholder="Enter email" required>
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="password" placeholder="Create password" required minlength="6">
      </div>
      <button type="submit" class="btn-submit" id="submitBtn">Register Account</button>
    </form>
    <div id="statusMsg" class="status-msg"></div>
  </div>

  <script>
    document.getElementById('regForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submitBtn');
      const msg = document.getElementById('statusMsg');
      btn.disabled = true;
      btn.innerText = 'Creating account...';
      msg.style.color = '#94a3b8';
      msg.innerText = '';

      try {
        const res = await fetch('${registerApiUrl}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: document.getElementById('fullName').value,
            phoneNumber: document.getElementById('phoneNumber').value,
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
            referralCode: '${cleanCode}'
          })
        });
        const data = await res.json();
        if (data.success) {
          msg.style.color = '#10b981';
          msg.innerText = 'Registration successful! Downloading app now...';
          setTimeout(() => { window.location.href = '${apkDownloadUrl}'; }, 1500);
        } else {
          msg.style.color = '#f87171';
          msg.innerText = data.message || 'Registration failed';
          btn.disabled = false;
          btn.innerText = 'Register Account';
        }
      } catch (err) {
        msg.style.color = '#f87171';
        msg.innerText = 'Network error. Please try again.';
        btn.disabled = false;
        btn.innerText = 'Register Account';
      }
    });
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
  } catch (error) {
    next(error);
  }
};
