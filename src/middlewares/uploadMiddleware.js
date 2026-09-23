const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Detect serverless environment (Vercel, AWS Lambda, etc.)
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// On serverless, the local directory (/var/task) is read-only. We must use os.tmpdir() (/tmp).
let uploadDir = isServerless
  ? path.join(os.tmpdir(), 'gdpe_uploads')
  : path.join(__dirname, '../../uploads');

// Ensure upload directory exists safely without crashing on read-only environments
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (err) {
  // If creating local directory fails (e.g. read-only filesystem), fallback to os.tmpdir()
  uploadDir = path.join(os.tmpdir(), 'gdpe_uploads');
  try {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
  } catch (tmpErr) {
    console.warn('[Upload] Failed to create tmp upload directory:', tmpErr.message);
  }
}

// Storage engine configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    } catch (e) {
      cb(null, os.tmpdir());
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedExtensions = /jpeg|jpg|png|webp|pdf/;
  const extname = allowedExtensions.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedExtensions.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    // If not matching strict image mime, still allow common screenshot uploads
    if (file.mimetype.startsWith('image/')) {
      return cb(null, true);
    }
    cb(new Error('Only images and PDF documents are allowed!'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: fileFilter,
});

upload.uploadDir = uploadDir;

module.exports = upload;
