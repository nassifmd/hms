const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
let sharp;
try {
  sharp = require('sharp');
} catch (err) {
  // sharp may fail to install on some environments; log and continue without it
  console.warn('sharp module not available, image optimization will be disabled');
}
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');

class StorageConfig {
  constructor() {
    this.uploadDir = process.env.UPLOAD_PATH || path.join(__dirname, '../../uploads');
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 10485760; // 10MB
    this.allowedFileTypes = (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/gif,application/pdf').split(',');
    
    this.ensureUploadDirectories();
  }

  async ensureUploadDirectories() {
    const directories = [
      this.uploadDir,
      path.join(this.uploadDir, 'profiles'),
      path.join(this.uploadDir, 'documents'),
      path.join(this.uploadDir, 'lab-results'),
      path.join(this.uploadDir, 'prescriptions'),
      path.join(this.uploadDir, 'xrays'),
      path.join(this.uploadDir, 'temp')
    ];

    for (const dir of directories) {
      try {
        await fs.access(dir);
      } catch {
        await fs.mkdir(dir, { recursive: true });
        logger.info(`Created directory: ${dir}`);
      }
    }
  }

  // File filter for multer
  fileFilter = (req, file, cb) => {
    if (this.allowedFileTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`), false);
    }
  };

  // Generate unique filename
  generateFilename = (file) => {
    const uniqueId = uuidv4();
    const extension = path.extname(file.originalname);
    return `${uniqueId}${extension}`;
  };

  // Multer storage configuration
  getMulterStorage(destination) {
    return multer.diskStorage({
      destination: (req, file, cb) => {
        const uploadPath = path.join(this.uploadDir, destination);
        cb(null, uploadPath);
      },
      filename: (req, file, cb) => {
        const filename = this.generateFilename(file);
        cb(null, filename);
      }
    });
  }

  // Multer upload middleware for different types
  uploadProfilePicture = multer({
    storage: this.getMulterStorage('profiles'),
    fileFilter: this.fileFilter,
    limits: {
      fileSize: this.maxFileSize,
      files: 1
    }
  }).single('profile_picture');

  uploadPatientDocument = multer({
    storage: this.getMulterStorage('documents'),
    fileFilter: this.fileFilter,
    limits: {
      fileSize: this.maxFileSize * 2, // 20MB for documents
      files: 5
    }
  }).array('documents', 5);

  uploadLabResult = multer({
    storage: this.getMulterStorage('lab-results'),
    fileFilter: this.fileFilter,
    limits: {
      fileSize: this.maxFileSize,
      files: 10
    }
  }).array('results', 10);

  uploadXray = multer({
    storage: this.getMulterStorage('xrays'),
    fileFilter: (req, file, cb) => {
      // Allow DICOM files for X-rays
      const allowedXrayTypes = ['image/jpeg', 'image/png', 'application/dicom', 'application/octet-stream'];
      if (allowedXrayTypes.includes(file.mimetype) || file.originalname.endsWith('.dcm')) {
        cb(null, true);
      } else {
        cb(new Error('Only JPEG, PNG, and DICOM files are allowed for X-rays'), false);
      }
    },
    limits: {
      fileSize: this.maxFileSize * 5, // 50MB for X-rays
      files: 10
    }
  }).array('xrays', 10);

  // Process and optimize images
  async optimizeImage(inputPath, outputPath, options = {}) {
    if (!sharp) {
      // sharp not installed; simply move file without resizing
      await fs.rename(inputPath, outputPath);
      logger.warn('Skipping image optimization because sharp is unavailable');
      return outputPath;
    }

    try {
      const { width = 800, height = 800, quality = 80 } = options;
      
      await sharp(inputPath)
        .resize(width, height, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality, progressive: true })
        .toFile(outputPath);

      // Delete original file
      await fs.unlink(inputPath);

      logger.info('Image optimized', { inputPath, outputPath });
      return outputPath;
    } catch (error) {
      logger.error('Image optimization failed:', error);
      // fall back by moving original so caller still gets file
      try {
        await fs.rename(inputPath, outputPath);
      } catch (_) {}
      throw error;
    }
  }

  // Save file with metadata
  async saveFile(file, type, metadata = {}) {
    const fileId = uuidv4();
    const fileExtension = path.extname(file.originalname);
    const fileName = `${fileId}${fileExtension}`;
    
    const typePaths = {
      'profile': 'profiles',
      'document': 'documents',
      'lab': 'lab-results',
      'xray': 'xrays',
      'prescription': 'prescriptions'
    };

    const relativePath = path.join(typePaths[type] || 'documents', fileName);
    const absolutePath = path.join(this.uploadDir, relativePath);

    // Move file from temp to final location
    await fs.rename(file.path, absolutePath);

    // Optimize images if it's an image and not an X-ray
    if (file.mimetype.startsWith('image/') && type !== 'xray') {
      const optimizedPath = path.join(this.uploadDir, typePaths[type], `${fileId}-optimized.jpg`);
      await this.optimizeImage(absolutePath, optimizedPath);
      
      return {
        id: fileId,
        originalName: file.originalname,
        fileName: `${fileId}-optimized.jpg`,
        path: optimizedPath,
        relativePath: path.join(typePaths[type], `${fileId}-optimized.jpg`),
        size: (await fs.stat(optimizedPath)).size,
        mimeType: 'image/jpeg',
        type,
        metadata
      };
    }

    return {
      id: fileId,
      originalName: file.originalname,
      fileName,
      path: absolutePath,
      relativePath,
      size: file.size,
      mimeType: file.mimetype,
      type,
      metadata
    };
  }

  // Get file URL
  getFileUrl(relativePath) {
    return `${process.env.API_URL}/files/${relativePath}`;
  }

  // Delete file
  async deleteFile(relativePath) {
    try {
      const absolutePath = path.join(this.uploadDir, relativePath);
      await fs.unlink(absolutePath);
      logger.info('File deleted', { path: relativePath });
      return true;
    } catch (error) {
      logger.error('Failed to delete file', { path: relativePath, error: error.message });
      return false;
    }
  }

  // Cleanup temp files
  async cleanupTempFiles() {
    const tempDir = path.join(this.uploadDir, 'temp');
    
    try {
      const files = await fs.readdir(tempDir);
      const now = Date.now();
      
      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stat = await fs.stat(filePath);
        
        // Delete files older than 24 hours
        if (now - stat.mtimeMs > 24 * 60 * 60 * 1000) {
          await fs.unlink(filePath);
          logger.debug('Deleted temp file', { file });
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup temp files:', error);
    }
  }

  // Get file info
  async getFileInfo(relativePath) {
    try {
      const absolutePath = path.join(this.uploadDir, relativePath);
      const stat = await fs.stat(absolutePath);
      
      return {
        exists: true,
        size: stat.size,
        created: stat.birthtime,
        modified: stat.mtime,
        isFile: stat.isFile(),
        extension: path.extname(absolutePath)
      };
    } catch {
      return { exists: false };
    }
  }

  // Stream file for download
  async getFileStream(relativePath) {
    const absolutePath = path.join(this.uploadDir, relativePath);
    
    try {
      await fs.access(absolutePath);
      return fs.createReadStream(absolutePath);
    } catch (error) {
      logger.error('File not found', { path: relativePath });
      return null;
    }
  }

  // Calculate storage usage
  async getStorageUsage() {
    const usage = {};
    
    const directories = ['profiles', 'documents', 'lab-results', 'xrays', 'prescriptions'];
    
    for (const dir of directories) {
      const dirPath = path.join(this.uploadDir, dir);
      try {
        const files = await fs.readdir(dirPath);
        let totalSize = 0;
        
        for (const file of files) {
          const stat = await fs.stat(path.join(dirPath, file));
          totalSize += stat.size;
        }
        
        usage[dir] = {
          count: files.length,
          size: totalSize,
          sizeFormatted: this.formatBytes(totalSize)
        };
      } catch {
        usage[dir] = { count: 0, size: 0, sizeFormatted: '0 B' };
      }
    }
    
    return usage;
  }

  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
}

// Schedule cleanup of temp files
setInterval(() => {
  const storage = new StorageConfig();
  storage.cleanupTempFiles();
}, 60 * 60 * 1000); // Every hour

module.exports = new StorageConfig();