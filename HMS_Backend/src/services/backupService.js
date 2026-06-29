const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');
const archiver = require('archiver');
const { createGzip } = require('zlib');
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);

const db = require('../config/database');
const logger = require('../config/logger');
const { AppError } = require('../middleware/errorHandler');
const notificationService = require('./notificationService');
const { backupQueue } = require('./queueService');

const execAsync = util.promisify(exec);

class BackupService {
  constructor() {
    this.backupDir = process.env.BACKUP_PATH || path.join(__dirname, '../../backups');
    this.retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS) || 30;
    this.initialized = false;
    this.initialize();
  }

  /**
   * Initialize backup service
   */
  async initialize() {
    try {
      // Create backup directory if it doesn't exist
      await fs.mkdir(this.backupDir, { recursive: true });
      
      // Schedule automatic backups
      this.scheduleBackups();
      
      this.initialized = true;
      logger.info('Backup service initialized', {
        backupDir: this.backupDir,
        retentionDays: this.retentionDays
      });
    } catch (error) {
      logger.error('Failed to initialize backup service:', error);
    }
  }

  /**
   * Schedule automatic backups
   */
  scheduleBackups() {
    // Daily backup at 2 AM
    cron.schedule(process.env.BACKUP_SCHEDULE || '0 2 * * *', () => {
      logger.info('Running scheduled backup');
      this.createBackup().catch(error => {
        logger.error('Scheduled backup failed:', error);
      });
    });

    // Weekly cleanup of old backups (Sunday at 3 AM)
    cron.schedule('0 3 * * 0', () => {
      logger.info('Running backup cleanup');
      this.cleanupOldBackups().catch(error => {
        logger.error('Backup cleanup failed:', error);
      });
    });
  }

  /**
   * Create database backup
   */
  async createBackup(options = {}) {
    const {
      type = 'full',
      compress = true,
      notify = false
    } = options;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${type}_${timestamp}`;
    const backupPath = path.join(this.backupDir, filename);

    try {
      logger.info('Starting backup', { type, filename });

      let result;

      if (type === 'full') {
        result = await this.createFullBackup(backupPath);
      } else if (type === 'schema') {
        result = await this.createSchemaBackup(backupPath);
      } else if (type === 'data') {
        result = await this.createDataBackup(backupPath);
      } else {
        throw new AppError('Invalid backup type', 400, 'INVALID_BACKUP_TYPE');
      }

      // Compress if requested
      if (compress) {
        result.path = await this.compressBackup(result.path);
      }

      // Get backup size
      const stats = await fs.stat(result.path);
      result.size = stats.size;
      result.sizeFormatted = this.formatBytes(stats.size);

      // Save backup metadata
      await this.saveBackupMetadata({
        filename: path.basename(result.path),
        type,
        size: stats.size,
        tables: result.tables,
        records: result.records,
        created_at: new Date()
      });

      logger.info('Backup completed successfully', {
        filename: result.path,
        size: result.sizeFormatted,
        tables: result.tables,
        records: result.records
      });

      // Send notification if requested
      if (notify) {
        await this.sendBackupNotification(result);
      }

      return result;
    } catch (error) {
      logger.error('Backup failed:', error);
      
      // Clean up all possible partial/failed backup files (the actual file has
      // a .sql or .sql.gz suffix, not just the bare backupPath)
      const candidatePaths = [
        backupPath,
        `${backupPath}.sql`,
        `${backupPath}.sql.gz`,
        `${backupPath}_schema.sql`,
        `${backupPath}_schema.sql.gz`,
        `${backupPath}_data.sql`,
        `${backupPath}_data.sql.gz`,
      ];
      for (const p of candidatePaths) {
        try { await fs.unlink(p); } catch (_) { /* ignore */ }
      }

      throw new AppError('Backup failed: ' + error.message, 500, 'BACKUP_FAILED');
    }
  }

  /**
   * Create full database backup
   */
  async createFullBackup(backupPath) {
    const sqlPath = `${backupPath}.sql`;

    // Get database configuration
    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'hospital_management',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD
    };

    // allow override of dump binary (useful when server version differs)
    const pgDump = process.env.PG_DUMP_PATH || 'pg_dump';

    // Build pg_dump command
    const command = [
      pgDump,
      `-h ${dbConfig.host}`,
      `-p ${dbConfig.port}`,
      `-U ${dbConfig.user}`,
      `-d ${dbConfig.database}`,
      '--clean',
      '--if-exists',
      '--create',
      '--format=custom',
      `--file="${sqlPath}"`
    ].join(' ');

    // Set PGPASSWORD environment variable
    const env = {
      ...process.env,
      PGPASSWORD: dbConfig.password
    };

    try {
      await execAsync(command, { env, shell: true });
      
      // Get table counts for metadata
      const tableCounts = await this.getTableCounts();

      return {
        path: sqlPath,
        type: 'full',
        tables: tableCounts.totalTables,
        records: tableCounts.totalRecords,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('pg_dump failed:', error);
      // provide more actionable message on version mismatch
      if (error.stderr && /server version/.test(error.stderr) && /pg_dump version/.test(error.stderr)) {
        throw new Error(
          'pg_dump version mismatch: install a pg_dump matching the server version or set PG_DUMP_PATH environment variable to a compatible binary.'
        );
      }
      throw error;
    }
  }

  /**
   * Create schema-only backup
   */
  async createSchemaBackup(backupPath) {
    const sqlPath = `${backupPath}_schema.sql`;

    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'hospital_management',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD
    };

    const pgDump = process.env.PG_DUMP_PATH || 'pg_dump';

    const command = [
      pgDump,
      `-h ${dbConfig.host}`,
      `-p ${dbConfig.port}`,
      `-U ${dbConfig.user}`,
      `-d ${dbConfig.database}`,
      '--schema-only',
      '--clean',
      '--if-exists',
      `--file="${sqlPath}"`
    ].join(' ');

    const env = { ...process.env, PGPASSWORD: dbConfig.password };

    await execAsync(command, { env, shell: true });

    return {
      path: sqlPath,
      type: 'schema',
      timestamp: new Date()
    };
  }

  /**
   * Create data-only backup
   */
  async createDataBackup(backupPath) {
    const sqlPath = `${backupPath}_data.sql`;

    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'hospital_management',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD
    };

    const pgDump = process.env.PG_DUMP_PATH || 'pg_dump';

    const command = [
      pgDump,
      `-h ${dbConfig.host}`,
      `-p ${dbConfig.port}`,
      `-U ${dbConfig.user}`,
      `-d ${dbConfig.database}`,
      '--data-only',
      '--inserts',
      `--file="${sqlPath}"`
    ].join(' ');

    const env = { ...process.env, PGPASSWORD: dbConfig.password };

    await execAsync(command, { env, shell: true });

    // Get record counts
    const tableCounts = await this.getTableCounts();

    return {
      path: sqlPath,
      type: 'data',
      tables: tableCounts.totalTables,
      records: tableCounts.totalRecords,
      timestamp: new Date()
    };
  }

  /**
   * Compress backup file
   */
  async compressBackup(filePath) {
    const compressedPath = `${filePath}.gz`;
    
    const readStream = await fs.open(filePath, 'r');
    const writeStream = await fs.open(compressedPath, 'w');
    const gzip = createGzip();

    await streamPipeline(
      readStream.createReadStream(),
      gzip,
      writeStream.createWriteStream()
    );

    // Delete original file
    await fs.unlink(filePath);

    return compressedPath;
  }

  /**
   * Get table counts for metadata
   */
  async getTableCounts() {
    const tables = await db.query(`
      SELECT 
        table_name,
        (SELECT reltuples::bigint FROM pg_class WHERE relname = table_name) as row_count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const totalTables = tables.rows.length;
    const totalRecords = tables.rows.reduce((sum, table) => sum + (table.row_count || 0), 0);

    return {
      tables: tables.rows,
      totalTables,
      totalRecords
    };
  }

  /**
   * Save backup metadata to database
   */
  async saveBackupMetadata(metadata) {
    try {
      const check = await db.query("SELECT to_regclass('public.backup_history')");
      if (!check.rows[0].to_regclass) {
        logger.warn('backup_history table does not exist — skipping metadata save');
        return;
      }
      await db.query(`
        INSERT INTO backup_history (
          filename, backup_type, size, tables_count,
          records_count, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        metadata.filename,
        metadata.type,
        metadata.size,
        metadata.tables || 0,
        metadata.records || 0,
        metadata.created_at
      ]);
    } catch (error) {
      logger.error('Failed to save backup metadata:', error);
    }
  }

  /**
   * List available backups
   */
  async listBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      
      const backups = [];
      
      for (const file of files) {
        if (file.endsWith('.sql') || file.endsWith('.gz')) {
          const filePath = path.join(this.backupDir, file);
          const stats = await fs.stat(filePath);
          
          // Get metadata from database (if table exists)
          let metadata = { rows: [] };
          try {
            const check = await db.query("SELECT to_regclass('public.backup_history')");
            if (check.rows[0].to_regclass) {
              metadata = await db.query(`
                SELECT * FROM backup_history
                WHERE filename = $1
              `, [file]);
            }
          } catch (e) {
            // ignore
          }

          backups.push({
            filename: file,
            path: filePath,
            size: stats.size,
            sizeFormatted: this.formatBytes(stats.size),
            created: stats.birthtime,
            modified: stats.mtime,
            type: file.includes('_schema_') ? 'schema' : 
                  file.includes('_data_') ? 'data' : 'full',
            metadata: metadata.rows[0] || null
          });
        }
      }

      // Sort by date descending
      backups.sort((a, b) => b.created - a.created);

      return backups;
    } catch (error) {
      logger.error('Failed to list backups:', error);
      throw new AppError('Failed to list backups', 500, 'LIST_BACKUPS_FAILED');
    }
  }

  /**
   * Restore from backup
   */
  async restoreBackup(filename, options = {}) {
    const {
      dryRun = false,
      force = false
    } = options;

    const backupPath = path.join(this.backupDir, filename);

    try {
      // Check if file exists
      await fs.access(backupPath);

      logger.info('Starting restore', { filename, dryRun });

      if (dryRun) {
        return {
          success: true,
          dryRun: true,
          message: 'Dry run completed successfully'
        };
      }

      // Decompress if needed
      let restoreFile = backupPath;
      if (filename.endsWith('.gz')) {
        restoreFile = await this.decompressBackup(backupPath);
      }

      // Get database configuration
      const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'hospital_management',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD
      };

      // Build restore command
      const command = [
        'pg_restore',
        `-h ${dbConfig.host}`,
        `-p ${dbConfig.port}`,
        `-U ${dbConfig.user}`,
        '-d postgres', // Connect to default database first
        '--clean',
        '--if-exists',
        '--create',
        force ? '--exit-on-error' : '',
        `"${restoreFile}"`
      ].join(' ');

      const env = { ...process.env, PGPASSWORD: dbConfig.password };

      await execAsync(command, { env, shell: true });

      // Log restore (if table exists)
      try {
        const check = await db.query("SELECT to_regclass('public.restore_history')");
        if (check.rows[0].to_regclass) {
          await db.query(`
            INSERT INTO restore_history (
              filename, restored_at, status
            ) VALUES ($1, NOW(), 'success')
          `, [filename]);
        }
      } catch (e) {
        logger.warn('Could not log restore history:', e.message);
      }

      // Clean up decompressed file if needed
      if (filename.endsWith('.gz') && restoreFile !== backupPath) {
        await fs.unlink(restoreFile);
      }

      logger.info('Restore completed successfully', { filename });

      return {
        success: true,
        filename,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Restore failed:', error);
      
      try {
        const check = await db.query("SELECT to_regclass('public.restore_history')");
        if (check.rows[0].to_regclass) {
          await db.query(`
            INSERT INTO restore_history (
              filename, restored_at, status, error_message
            ) VALUES ($1, NOW(), 'failed', $2)
          `, [filename, error.message]);
        }
      } catch (logError) {
        logger.warn('Could not log restore failure:', logError.message);
      }

      throw new AppError('Restore failed: ' + error.message, 500, 'RESTORE_FAILED');
    }
  }

  /**
   * Decompress backup file
   */
  async decompressBackup(filePath) {
    const decompressedPath = filePath.replace('.gz', '');
    
    const readStream = await fs.open(filePath, 'r');
    const writeStream = await fs.open(decompressedPath, 'w');
    const gunzip = require('zlib').createGunzip();

    await streamPipeline(
      readStream.createReadStream(),
      gunzip,
      writeStream.createWriteStream()
    );

    return decompressedPath;
  }

  /**
   * Clean up old backups
   */
  async cleanupOldBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const now = Date.now();
      const retentionMs = this.retentionDays * 24 * 60 * 60 * 1000;

      let deletedCount = 0;
      let totalSize = 0;

      for (const file of files) {
        const filePath = path.join(this.backupDir, file);
        const stats = await fs.stat(filePath);
        const age = now - stats.mtimeMs;

        if (age > retentionMs) {
          const size = stats.size;
          await fs.unlink(filePath);
          deletedCount++;
          totalSize += size;

          logger.debug('Deleted old backup', { file, age, size });
        }
      }

      logger.info('Backup cleanup completed', {
        deletedCount,
        freedSpace: this.formatBytes(totalSize)
      });

      return {
        deletedCount,
        freedSpace: totalSize,
        freedSpaceFormatted: this.formatBytes(totalSize)
      };
    } catch (error) {
      logger.error('Backup cleanup failed:', error);
      throw new AppError('Backup cleanup failed', 500, 'CLEANUP_FAILED');
    }
  }

  /**
   * Download backup file
   */
  async getBackupStream(filename) {
    const filePath = path.join(this.backupDir, filename);
    
    try {
      await fs.access(filePath);
      const stats = await fs.stat(filePath);
      
      return {
        stream: await fs.open(filePath, 'r'),
        size: stats.size,
        filename
      };
    } catch (error) {
      throw new AppError('Backup file not found', 404, 'BACKUP_NOT_FOUND');
    }
  }

  /**
   * Send backup notification
   */
  async sendBackupNotification(backup) {
    try {
      // Get admin users
      const admins = await db.query(`
        SELECT u.id
        FROM users u
        JOIN user_roles ur ON u.id = ur.user_id
        JOIN roles r ON ur.role_id = r.id
        WHERE r.role_code = 'SYS_ADMIN'
          AND u.user_status = 'Active'
      `);

      for (const admin of admins.rows) {
        await notificationService.send({
          userId: admin.id,
          type: 'backup_completed',
          title: 'Backup Completed',
          body: `Database backup completed successfully. Size: ${backup.sizeFormatted}`,
          channels: ['in_app', 'email'],
          data: backup
        });
      }
    } catch (error) {
      logger.error('Failed to send backup notification:', error);
    }
  }

  /**
   * Get backup statistics
   */
  async getBackupStats() {
    let stats = {
      total_backups: 0, total_size: 0, avg_size: 0,
      last_backup: null, first_backup: null,
      backups_last_7_days: 0, backups_last_30_days: 0
    };

    try {
      const check = await db.query("SELECT to_regclass('public.backup_history')");
      if (check.rows[0].to_regclass) {
        const result = await db.query(`
          SELECT 
            COUNT(*) as total_backups,
            SUM(size) as total_size,
            AVG(size) as avg_size,
            MAX(created_at) as last_backup,
            MIN(created_at) as first_backup,
            COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as backups_last_7_days,
            COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as backups_last_30_days
          FROM backup_history
        `);
        stats = result.rows[0];
      }
    } catch (error) {
      logger.error('Failed to get backup stats from DB:', error);
    }

    // Get current backup directory size
    let currentSize = 0;
    try {
      const files = await fs.readdir(this.backupDir);
      for (const file of files) {
        const filePath = path.join(this.backupDir, file);
        const stat = await fs.stat(filePath);
        currentSize += stat.size;
      }
    } catch (error) {
      logger.error('Failed to calculate backup directory size:', error);
    }

    return {
      ...stats,
      total_size_formatted: this.formatBytes(stats.total_size || 0),
      avg_size_formatted: this.formatBytes(stats.avg_size || 0),
      current_directory_size: currentSize,
      current_directory_size_formatted: this.formatBytes(currentSize),
      retention_days: this.retentionDays,
      backup_directory: this.backupDir
    };
  }

  /**
   * Verify backup integrity
   */
  async verifyBackup(filename) {
    const backupPath = path.join(this.backupDir, filename);

    try {
      await fs.access(backupPath);

      // Try to read backup metadata
      let metadata = null;
      try {
        const check = await db.query("SELECT to_regclass('public.backup_history')");
        if (check.rows[0].to_regclass) {
          const result = await db.query(`
            SELECT * FROM backup_history
            WHERE filename = $1
          `, [filename]);
          metadata = result.rows[0];
        }
      } catch (error) {
        // Ignore
      }

      // For SQL files, try to check if it's valid
      let isValid = true;
      let error = null;

      if (filename.endsWith('.sql')) {
        try {
          // Try to parse first few lines
          const content = await fs.readFile(backupPath, 'utf8');
          if (!content.includes('CREATE') && !content.includes('INSERT')) {
            isValid = false;
            error = 'Invalid SQL format';
          }
        } catch (readError) {
          isValid = false;
          error = readError.message;
        }
      }

      return {
        filename,
        exists: true,
        isValid,
        error,
        metadata,
        verified_at: new Date().toISOString()
      };
    } catch (error) {
      return {
        filename,
        exists: false,
        isValid: false,
        error: 'File not found',
        verified_at: new Date().toISOString()
      };
    }
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Get service status
   */
  async getStatus() {
    const stats = await this.getBackupStats();
    
    return {
      initialized: this.initialized,
      backupDirectory: this.backupDir,
      retentionDays: this.retentionDays,
      stats,
      scheduledBackup: process.env.BACKUP_SCHEDULE || '0 2 * * *'
    };
  }
}

// Export singleton instance
module.exports = new BackupService();