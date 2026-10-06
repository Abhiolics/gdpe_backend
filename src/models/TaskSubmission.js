const mongoose = require('mongoose');

const taskSubmissionSchema = new mongoose.Schema(
  {
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    proof: {
      type: String,
      required: [true, 'Please upload proof'],
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    rewardAmount: {
      type: Number,
      required: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true, virtuals: true },
    toObject: { getters: true, virtuals: true },
  }
);

const getFullProofUrl = (proof) => {
  if (!proof) return '';
  if (proof.startsWith('http://') || proof.startsWith('https://')) {
    return proof;
  }
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'j1fnt9oc';
  if (proof.includes('gdpe/deposits') || proof.includes('gdpe/')) {
    const clean = proof.replace(/^\/?(uploads\/)?/, '');
    return `https://res.cloudinary.com/${cloudName}/image/upload/${clean}`;
  }
  const baseUrl = process.env.BASE_URL || 'https://gdpebackend.vercel.app';
  const clean = proof.startsWith('/') ? proof : `/${proof}`;
  return `${baseUrl}${clean}`;
};

taskSubmissionSchema.path('proof').get(function (val) {
  return getFullProofUrl(val);
});

module.exports = mongoose.model('TaskSubmission', taskSubmissionSchema);
