const { Pool } = require("pg");
const logger = require("./logger");

class DatabaseConfig {
  constructor() {
    this.pool = null;
    this.initialize();
  }

  initialize() {
    this.pool = new Pool({
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || "hospital_management",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD,

      // Connection pool settings
      max: parseInt(process.env.DB_POOL_MAX) || 20,
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
      connectionTimeoutMillis: 2000,

      // Schema configuration
      searchPath: ["hospital_management", "public"],

      // SSL for production — rejectUnauthorized is true by default for security.
      // If a self-signed certificate is used, set DB_SSL_REJECT_UNAUTHORIZED=false.
      ssl:
        process.env.NODE_ENV === "production"
          ? {
              rejectUnauthorized:
                process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
              ca: process.env.DB_SSL_CA,
            }
          : false,

      // Application name for monitoring
      application_name: "hospital_management_api",
    });

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.pool.on("connect", (client) => {
      logger.info("Database connected successfully", {
        database: this.pool.options.database,
        host: this.pool.options.host,
      });
    });

    this.pool.on("error", (err, client) => {
      logger.error("Unexpected database error", {
        error: err.message,
        stack: err.stack,
        database: this.pool.options.database,
      });

      // Attempt to reconnect after 5 seconds
      setTimeout(() => {
        logger.info("Attempting to reconnect to database...");
        this.initialize();
      }, 5000);
    });

    this.pool.on("remove", (client) => {
      logger.debug("Database client removed from pool");
    });
  }

  // internal helper that supports one retry when the pool ends mid-query
  async _queryInternal(text, params, attempt = 0) {
    const start = Date.now();

    // immediate refuse if we are already shutting down, before touching the pool
    if (this._shuttingDown) {
      const err = new Error("Database is shutting down");
      logger.error("Query attempted while shutting down", { text });
      throw err;
    }

    // if the pool was closed or is in the process of ending we either reinitialize or throw a clearer error
    if (this.pool && (this.pool.ended || this.pool.ending)) {
      // don't automatically resurrect the pool during a shutdown sequence
      if (this._shuttingDown) {
        const err = new Error("Database pool is closed (shutting down)");
        logger.error("Query attempted after pool end during shutdown", {
          text,
        });
        throw err;
      }

      logger.warn("Detected ended/ending pool, creating a new connection pool");
      this.initialize();
    }

    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;

      // Log slow queries (> 1 second)
      if (duration > 1000) {
        logger.warn("Slow query detected", {
          text,
          duration,
          rows: result.rowCount,
        });
      }

      // Log all queries in development
      if (process.env.NODE_ENV === "development") {
        logger.debug("Query executed", {
          text,
          duration,
          rows: result.rowCount,
        });
      }

      return result;
    } catch (error) {
      // unify pool-ending errors to a shutdown message so they are mapped to 503
      const msg = error && error.message;
      if (
        msg &&
        msg.includes("Cannot use a pool after calling end on the pool")
      ) {
        logger.warn("Detected pool-end error during query", { text, msg });
        // if we aren't already shutting down, attempt to recover once
        if (!this._shuttingDown && attempt === 0) {
          this.initialize();
          return this._queryInternal(text, params, attempt + 1);
        }
        // otherwise propagate a generic shutdown error
        const shutdownErr = new Error("Database is shutting down");
        throw shutdownErr;
      }

      logger.error("Query error", {
        text,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  async query(text, params) {
    return this._queryInternal(text, params);
  }

  async getClient() {
    // if server is shutting down, reject early
    if (this._shuttingDown) {
      const err = new Error("Database is shutting down");
      logger.error("Client request during shutdown");
      throw err;
    }

    if (this.pool && (this.pool.ended || this.pool.ending)) {
      logger.warn("Pool ended/ending before getting client, reinitializing");
      this.initialize();
    }

    const client = await this.pool.connect();

    // Add query method with logging to client
    const originalQuery = client.query;
    client.query = async (text, params) => {
      const start = Date.now();
      try {
        const result = await originalQuery.call(client, text, params);
        const duration = Date.now() - start;

        logger.debug("Client query executed", {
          text,
          duration,
          rows: result.rowCount,
        });

        return result;
      } catch (error) {
        logger.error("Client query error", {
          text,
          error: error.message,
        });
        throw error;
      }
    };

    return client;
  }

  async transaction(callback) {
    const client = await this.getClient();

    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("Transaction rolled back", {
        error: error.message,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async healthCheck() {
    try {
      const result = await this.query("SELECT 1 as health_check");
      return {
        status: "healthy",
        latency: result.duration,
        connections: this.pool.totalCount,
        idle: this.pool.idleCount,
        waiting: this.pool.waitingCount,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
      };
    }
  }

  async close() {
    logger.info("Closing database connections...");
    this._shuttingDown = true;
    await this.pool.end();
  }

  // Migration helper
  async runMigration(migrationSQL) {
    const client = await this.getClient();

    try {
      await client.query("BEGIN");

      // Create migrations table if not exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id SERIAL PRIMARY KEY,
          version VARCHAR(50) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          duration INTEGER
        )
      `);

      const start = Date.now();
      await client.query(migrationSQL);
      const duration = Date.now() - start;

      // Record migration
      await client.query(
        `
        INSERT INTO schema_migrations (version, name, duration)
        VALUES ($1, $2, $3)
      `,
        [process.env.MIGRATION_VERSION, process.env.MIGRATION_NAME, duration]
      );

      await client.query("COMMIT");

      logger.info("Migration executed successfully", {
        version: process.env.MIGRATION_VERSION,
        duration,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("Migration failed", {
        error: error.message,
      });
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new DatabaseConfig();
