const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const logger = require("./logger");

class AuthConfig {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET;
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || "8h";
    this.jwtRefreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || "7d";
    this.bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
  }

  // Password hashing
  async hashPassword(password) {
    try {
      const salt = await bcrypt.genSalt(this.bcryptRounds);
      const hash = await bcrypt.hash(password, salt);
      return hash;
    } catch (error) {
      logger.error("Password hashing error:", error);
      throw new Error("Failed to hash password");
    }
  }

  async verifyPassword(password, hash) {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      logger.error("Password verification error:", error);
      return false;
    }
  }

  // JWT token generation
  generateTokens(user) {
    try {
      const payload = {
        userId: user.id,
        employeeId: user.employee_id,
        facilityId: user.facility_id,
        departmentId: user.department_id,
        roles: user.roles || [],
        permissions: user.permissions || [],
      };

      const accessToken = jwt.sign(payload, this.jwtSecret, {
        expiresIn: this.jwtExpiresIn,
        issuer: "hospital-management-system",
        audience: "hospital-api",
      });

      const refreshToken = jwt.sign(
        { userId: user.id },
        this.jwtRefreshSecret,
        {
          expiresIn: this.jwtRefreshExpiresIn,
          issuer: "hospital-management-system",
          audience: "hospital-api",
        }
      );

      return {
        accessToken,
        refreshToken,
        expiresIn: this.getExpirySeconds(this.jwtExpiresIn),
      };
    } catch (error) {
      logger.error("Token generation error:", error);
      throw new Error("Failed to generate tokens");
    }
  }

  verifyAccessToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret, {
        issuer: "hospital-management-system",
        audience: "hospital-api",
      });
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        throw new Error("Token expired");
      }
      if (error.name === "JsonWebTokenError") {
        throw new Error("Invalid token");
      }
      throw error;
    }
  }

  verifyRefreshToken(token) {
    try {
      return jwt.verify(token, this.jwtRefreshSecret, {
        issuer: "hospital-management-system",
        audience: "hospital-api",
      });
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        throw new Error("Refresh token expired");
      }
      throw new Error("Invalid refresh token");
    }
  }

  // Generate random tokens for password reset, email verification, etc.
  // `bytes` is the number of random bytes; the returned string is hex
  // so its length will be `bytes * 2`. For example, `bytes = 5` gives a
  // 10‑character token, which is useful for short links or codes.
  generateRandomToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString("hex");
  }

  generateOTP(length = 6) {
    const digits = "0123456789";
    let otp = "";
    for (let i = 0; i < length; i++) {
      otp += digits[Math.floor(Math.random() * 10)];
    }
    return otp;
  }

  // Session management
  createSession(userId, deviceInfo = {}) {
    const sessionId = this.generateRandomToken(16);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours session

    return {
      sessionId,
      userId,
      deviceInfo,
      createdAt: new Date(),
      expiresAt,
      isValid: true,
    };
  }

  // Permission checking
  hasPermission(userPermissions, requiredPermission) {
    if (!userPermissions || !requiredPermission) return false;
    return userPermissions.includes(requiredPermission);
  }

  hasAnyPermission(userPermissions, requiredPermissions) {
    if (!userPermissions || !requiredPermissions) return false;
    return requiredPermissions.some((p) => userPermissions.includes(p));
  }

  hasAllPermissions(userPermissions, requiredPermissions) {
    if (!userPermissions || !requiredPermissions) return false;
    return requiredPermissions.every((p) => userPermissions.includes(p));
  }

  hasRole(userRoles, requiredRole) {
    if (!userRoles || !requiredRole) return false;
    return userRoles.includes(requiredRole);
  }

  hasAnyRole(userRoles, requiredRoles) {
    if (!userRoles || !requiredRoles) return false;
    return requiredRoles.some((r) => userRoles.includes(r));
  }

  // Helper to parse expiry string to seconds
  getExpirySeconds(expiryString) {
    const unit = expiryString.slice(-1);
    const value = parseInt(expiryString.slice(0, -1));

    switch (unit) {
      case "s":
        return value;
      case "m":
        return value * 60;
      case "h":
        return value * 3600;
      case "d":
        return value * 86400;
      default:
        return 28800; // 8 hours default
    }
  }

  // Generate API key for external integrations
  generateApiKey() {
    const key = crypto.randomBytes(32).toString("hex");
    const secret = crypto.randomBytes(48).toString("hex");

    return {
      key,
      secret,
      hash: crypto
        .createHmac("sha256", this.jwtSecret)
        .update(`${key}:${secret}`)
        .digest("hex"),
    };
  }

  verifyApiKey(key, secret, hash) {
    const expectedHash = crypto
      .createHmac("sha256", this.jwtSecret)
      .update(`${key}:${secret}`)
      .digest("hex");

    return crypto.timingSafeEqual(Buffer.from(expectedHash), Buffer.from(hash));
  }

  // Encryption helpers for sensitive data
  encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      "aes-256-gcm",
      Buffer.from(process.env.ENCRYPTION_KEY, "hex"),
      iv
    );

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString("hex"),
      authTag: authTag.toString("hex"),
    };
  }

  decrypt(encryptedData) {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      Buffer.from(process.env.ENCRYPTION_KEY, "hex"),
      Buffer.from(encryptedData.iv, "hex")
    );

    decipher.setAuthTag(Buffer.from(encryptedData.authTag, "hex"));

    let decrypted = decipher.update(encryptedData.encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }
}

module.exports = new AuthConfig();
