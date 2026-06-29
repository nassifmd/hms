const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const { v4: uuidv4 } = require("uuid");
const logger = require("../config/logger");
const { AppError } = require("./errorHandler");

/**
 * File upload configuration
 */
class FileUploadMiddleware {
  constructor(options = {}) {
    this.uploadDir = options.uploadDir || path.join(__dirname, "../../uploads");
    this.maxSize = options.maxSize || 10 * 1024 * 1024; // 10MB default
    this.allowedTypes = options.allowedTypes || [
      "image/jpeg",
      "image/png",
      "image/gif",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    this.allowedExtensions = options.allowedExtensions || [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".pdf",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
    ];
  }

  /**
   * Ensure upload directory exists
   */
  async ensureUploadDir(subDir = "") {
    const dir = path.join(this.uploadDir, subDir);
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
      logger.info(`Created upload directory: ${dir}`);
    }
    return dir;
  }

  /**
   * Generate unique filename
   */
  generateFilename(file, subDir = "") {
    const uniqueId = uuidv4();
    const extension = path.extname(file.originalname).toLowerCase();
    const sanitizedName = file.originalname
      .replace(extension, "")
      .replace(/[^a-z0-9]/gi, "_")
      .substring(0, 50);

    return {
      filename: `${uniqueId}-${sanitizedName}${extension}`,
      path: path.join(subDir, `${uniqueId}-${sanitizedName}${extension}`),
      uniqueId,
      extension,
    };
  }

  /**
   * File filter for multer
   */
  fileFilter = (req, file, cb) => {
    // Check MIME type
    if (!this.allowedTypes.includes(file.mimetype)) {
      return cb(
        new AppError(
          `File type ${file.mimetype} not allowed`,
          400,
          "INVALID_FILE_TYPE"
        ),
        false
      );
    }

    // Check extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (!this.allowedExtensions.includes(ext)) {
      return cb(
        new AppError(
          `File extension ${ext} not allowed`,
          400,
          "INVALID_FILE_EXTENSION"
        ),
        false
      );
    }

    cb(null, true);
  };

  /**
   * Allowed subdirectories for uploads — any subDir passed to getUploader
   * or its callers must be in this list to prevent path traversal.
   */
  static ALLOWED_SUBDIRS = new Set([
    "",
    "patients",
    "lab-results",
    "xrays",
    "profiles",
    "dental",
    "prescriptions",
    "billing",
    "insurance",
  ]);

  /**
   * Create multer upload instance for specific subdirectory
   */
  getUploader(subDir = "") {
    if (!FileUploadMiddleware.ALLOWED_SUBDIRS.has(subDir)) {
      throw new Error(
        `Upload sub-directory "${subDir}" is not in the allowed set`
      );
    }
    const storage = multer.diskStorage({
      destination: async (req, file, cb) => {
        try {
          const dir = await this.ensureUploadDir(subDir);
          cb(null, dir);
        } catch (error) {
          cb(error);
        }
      },
      filename: (req, file, cb) => {
        const { filename } = this.generateFilename(file, subDir);
        cb(null, filename);
      },
    });

    return multer({
      storage,
      limits: {
        fileSize: this.maxSize,
      },
      fileFilter: this.fileFilter,
    });
  }

  /**
   * Single file upload
   */
  single(fieldName, subDir = "") {
    const uploader = this.getUploader(subDir);
    return (req, res, next) => {
      uploader.single(fieldName)(req, res, (err) => {
        if (err) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return next(
              new AppError(
                `File too large. Max size: ${this.maxSize / 1024 / 1024}MB`,
                400,
                "FILE_TOO_LARGE"
              )
            );
          }
          return next(err);
        }
        next();
      });
    };
  }

  /**
   * Multiple files upload
   */
  array(fieldName, maxCount = 5, subDir = "") {
    const uploader = this.getUploader(subDir);
    return (req, res, next) => {
      uploader.array(fieldName, maxCount)(req, res, (err) => {
        if (err) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return next(
              new AppError(
                `File too large. Max size: ${this.maxSize / 1024 / 1024}MB`,
                400,
                "FILE_TOO_LARGE"
              )
            );
          }
          if (err.code === "LIMIT_FILE_COUNT") {
            return next(
              new AppError(
                `Too many files. Max count: ${maxCount}`,
                400,
                "TOO_MANY_FILES"
              )
            );
          }
          return next(err);
        }
        next();
      });
    };
  }

  /**
   * Fields upload (multiple fields)
   */
  fields(fields, subDir = "") {
    const uploader = this.getUploader(subDir);
    return (req, res, next) => {
      uploader.fields(fields)(req, res, (err) => {
        if (err) {
          return next(err);
        }
        next();
      });
    };
  }

  /**
   * Process and validate uploaded files
   */
  processUploadedFiles(req, res, next) {
    if (!req.files && !req.file) {
      return next();
    }

    const files = req.files || (req.file ? [req.file] : []);

    // Add file info to request
    req.uploadedFiles = files.map((file) => ({
      fieldname: file.fieldname,
      originalname: file.originalname,
      filename: file.filename,
      path: file.path,
      size: file.size,
      mimetype: file.mimetype,
      url: `/uploads/${file.filename}`,
    }));

    next();
  }

  /**
   * Clean up temporary files on error
   */
  cleanupOnError = async (err, req, res, next) => {
    if (err && (req.file || req.files)) {
      const files = req.files || (req.file ? [req.file] : []);
      for (const file of files) {
        try {
          await fs.unlink(file.path);
          logger.debug(`Cleaned up file: ${file.path}`);
        } catch (unlinkError) {
          logger.error("Failed to clean up file:", unlinkError);
        }
      }
    }
    next(err);
  };
}

// Create pre-configured uploaders for different use cases
const fileUpload = new FileUploadMiddleware();

// Patient document uploader
const patientDocsUpload = new FileUploadMiddleware({
  uploadDir: path.join(__dirname, "../../uploads/patients"),
  maxSize: 20 * 1024 * 1024, // 20MB
  allowedTypes: ["image/jpeg", "image/png", "application/pdf"],
  allowedExtensions: [".jpg", ".jpeg", ".png", ".pdf"],
});

// Lab results uploader
const labResultsUpload = new FileUploadMiddleware({
  uploadDir: path.join(__dirname, "../../uploads/lab-results"),
  maxSize: 15 * 1024 * 1024, // 15MB
  allowedTypes: ["image/jpeg", "image/png", "application/pdf"],
  allowedExtensions: [".jpg", ".jpeg", ".png", ".pdf"],
});

// X-ray images uploader
const xrayUpload = new FileUploadMiddleware({
  uploadDir: path.join(__dirname, "../../uploads/xrays"),
  maxSize: 50 * 1024 * 1024, // 50MB
  allowedTypes: ["image/jpeg", "image/png", "application/dicom"],
  allowedExtensions: [".jpg", ".jpeg", ".png", ".dcm"],
});

// Profile pictures uploader
const profileUpload = new FileUploadMiddleware({
  uploadDir: path.join(__dirname, "../../uploads/profiles"),
  maxSize: 5 * 1024 * 1024, // 5MB
  allowedTypes: ["image/jpeg", "image/png", "image/gif"],
  allowedExtensions: [".jpg", ".jpeg", ".png", ".gif"],
});

module.exports = {
  fileUpload,
  patientDocsUpload,
  labResultsUpload,
  xrayUpload,
  profileUpload,
  FileUploadMiddleware,
};
