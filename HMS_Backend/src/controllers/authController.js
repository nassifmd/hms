const User = require("../models/User");
const Audit = require("../models/Audit");
const auth = require("../config/auth");
const logger = require("../config/logger");
const emailService = require("../config/email");
const smsService = require("../config/sms");
const redis = require("../config/redis");
const db = require("../config/database");
const { validationResult } = require("express-validator");
const { v4: uuidv4 } = require("uuid");

class AuthController {
  /**
   * @desc    Authenticate user and return JWT token
   * @route   POST /api/v1/auth/login
   * @access  Public
   */
  async login(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: errors.array()[0].msg,
          },
        });
      }

      const { email, password, facility_code } = req.body;

      // Find user by email or username
      let user = await User.findByEmail(email);

      if (!user) {
        user = await User.findByUsername(email);
      }

      if (!user) {
        await Audit.logLogin(null, false, req, "User not found");
        return res.status(401).json({
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email/username or password",
          },
        });
      }

      // Check if user is active
      if (user.user_status !== "Active") {
        await Audit.logLogin(user.id, false, req, "Inactive account");
        return res.status(403).json({
          success: false,
          error: {
            code: "INACTIVE_ACCOUNT",
            message:
              "Your account is not active. Please contact administrator.",
          },
        });
      }

      // Verify password
      const isValidPassword = await user.verifyPassword(password);

      if (!isValidPassword) {
        await user.incrementLoginAttempts();
        await Audit.logLogin(user.id, false, req, "Invalid password");

        return res.status(401).json({
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
          },
        });
      }

      // Login successful - update last login and generate tokens
      await user.login();

      // Get user with roles and permissions
      const userWithRoles = await User.findById(user.id);

      // Generate tokens
      const tokens = auth.generateTokens(userWithRoles);

      // Store SHA-256 hash of refresh token in Redis for rotation + reuse detection
      const crypto = require("crypto");
      const tokenHash = crypto
        .createHash("sha256")
        .update(tokens.refreshToken)
        .digest("hex");
      await redis.set(
        `refresh_token_hash:${user.id}`,
        tokenHash,
        7 * 24 * 60 * 60 // 7 days
      );

      // Log successful login
      await Audit.logLogin(user.id, true, req);

      // Remove sensitive data
      const userData = userWithRoles.toJSON();

      res.json({
        success: true,
        data: {
          user: userData,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
          tokenType: "Bearer",
        },
        message: "Login successful",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Refresh access token
   * @route   POST /api/v1/auth/refresh-token
   * @access  Public
   */
  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: {
            code: "MISSING_TOKEN",
            message: "Refresh token is required",
          },
        });
      }

      // Verify refresh token
      const decoded = auth.verifyRefreshToken(refreshToken);

      // Compute SHA-256 hash of the token for storage comparison
      const crypto = require("crypto");
      const tokenHash = crypto
        .createHash("sha256")
        .update(refreshToken)
        .digest("hex");

      // Check if token hash exists in Redis
      const storedHash = await redis.get(
        `refresh_token_hash:${decoded.userId}`
      );

      if (!storedHash) {
        return res.status(401).json({
          success: false,
          error: {
            code: "INVALID_TOKEN",
            message: "Refresh token has expired. Please login again.",
          },
        });
      }

      // Reuse detection: if the hash doesn't match, this is an old/stolen token
      if (storedHash !== tokenHash) {
        logger.warn("Refresh token reuse detected — possible token theft", {
          userId: decoded.userId,
        });
        // Invalidate all sessions for this user
        await redis.del(`refresh_token_hash:${decoded.userId}`);
        // Blacklist all access tokens by bumping token version
        await redis.incr(`token_version:${decoded.userId}`);
        return res.status(401).json({
          success: false,
          error: {
            code: "TOKEN_REUSE_DETECTED",
            message:
              "This refresh token has already been used. Please login again.",
          },
        });
      }

      // Get user
      const user = await User.findById(decoded.userId);

      if (!user || user.user_status !== "Active") {
        return res.status(401).json({
          success: false,
          error: {
            code: "USER_NOT_FOUND",
            message: "User not found or inactive",
          },
        });
      }

      // Generate new tokens
      const tokens = auth.generateTokens(user);

      // Store hash of the new refresh token (rotation)
      const newTokenHash = crypto
        .createHash("sha256")
        .update(tokens.refreshToken)
        .digest("hex");
      await redis.set(
        `refresh_token_hash:${user.id}`,
        newTokenHash,
        7 * 24 * 60 * 60 // 7 days
      );

      res.json({
        success: true,
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
        },
      });
    } catch (error) {
      if (error.message === "Refresh token expired") {
        return res.status(401).json({
          success: false,
          error: {
            code: "TOKEN_EXPIRED",
            message: "Refresh token has expired. Please login again.",
          },
        });
      }
      next(error);
    }
  }

  /**
   * @desc    Invalidate all refresh tokens for a user (force re-login)
   */
  async invalidateAllSessions(req, res, next) {
    try {
      const userId = req.user.userId;
      await redis.del(`refresh_token_hash:${userId}`);
      await redis.incr(`token_version:${userId}`);
      res.json({ success: true, message: "All sessions invalidated" });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Logout user
   * @route   POST /api/v1/auth/logout
   * @access  Private
   */
  async logout(req, res, next) {
    try {
      const userId = req.user.userId;

      // Remove refresh token hash from Redis
      await redis.del(`refresh_token_hash:${userId}`);

      // Blacklist access token
      const token = req.headers.authorization.split(" ")[1];
      await redis.set(
        `blacklist:${token}`,
        "true",
        8 * 60 * 60 // 8 hours (token expiry)
      );

      // Log logout
      await Audit.logLogout(userId, req);

      res.json({
        success: true,
        message: "Logout successful",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Change password
   * @route   POST /api/v1/auth/change-password
   * @access  Private
   */
  async changePassword(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: errors.array()[0].msg,
          },
        });
      }

      const { currentPassword, newPassword } = req.body;
      const userId = req.user.userId;

      // Get user
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: "USER_NOT_FOUND",
            message: "User not found",
          },
        });
      }

      // Verify current password
      const isValid = await user.verifyPassword(currentPassword);

      if (!isValid) {
        return res.status(401).json({
          success: false,
          error: {
            code: "INVALID_PASSWORD",
            message: "Current password is incorrect",
          },
        });
      }

      // Update password
      await user.updatePassword(newPassword);

      // Invalidate all refresh tokens and bump token version to revoke access tokens
      await redis.del(`refresh_token_hash:${userId}`);
      await redis.incr(`token_version:${userId}`);

      // Log password change
      await Audit.logAction(userId, "PASSWORD_CHANGED", {
        facility_id: req.user.facilityId,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      // Send email notification
      try {
        await emailService.sendEmail({
          to: user.email,
          subject: "Password Changed",
          template: "password-changed",
          data: {
            name: `${user.first_name} ${user.last_name}`,
            time: new Date().toLocaleString("en-GH"),
            ip: req.ip,
          },
        });
      } catch (emailError) {
        logger.error("Failed to send password change email:", emailError);
      }

      res.json({
        success: true,
        message: "Password changed successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Request password reset
   * @route   POST /api/v1/auth/forgot-password
   * @access  Public
   */
  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          error: {
            code: "MISSING_EMAIL",
            message: "Email is required",
          },
        });
      }

      // Find user
      const user = await User.findByEmail(email);

      // Always return success even if user not found (security)
      if (!user) {
        return res.json({
          success: true,
          message:
            "If your email is registered, you will receive a password reset link",
        });
      }

      // Generate reset token
      const resetToken = await user.generatePasswordResetToken();

      // log token for troubleshooting (remove or lower log level in production)
      logger.debug("password reset token generated", {
        email: user.email,
        token: resetToken,
      });

      // Send reset email
      try {
        await emailService.sendPasswordResetEmail(user, resetToken);
      } catch (emailError) {
        logger.error("Failed to send password reset email:", emailError);
      }

      // Log request
      await Audit.logAction(user.id, "PASSWORD_RESET_REQUESTED", {
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      res.json({
        success: true,
        message:
          "If your email is registered, you will receive a password reset link",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Reset password with token
   * @route   POST /api/v1/auth/reset-password
   * @access  Public
   */
  async resetPassword(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: errors.array()[0].msg,
          },
        });
      }

      let { token, newPassword } = req.body;
      token = token ? token.toString().trim() : token;

      // debug incoming token for troubleshooting
      logger.debug(`resetPassword called token=${token}`);

      // Find user by reset token
      // token stored as UTC in a `timestamp without time zone` column.
      // server timezone (Europe/Berlin) meant `NOW()` was one hour ahead,
      // causing the comparison to fail.  Convert NOW() to UTC to match storage.
      const result = await db.query(
        `
        SELECT * FROM users
        WHERE password_reset_token = $1
          AND password_reset_expires > (NOW() AT TIME ZONE 'UTC')
      `,
        [token]
      );
      logger.debug(
        `resetPassword DB lookup rowCount=${
          result.rows.length
        } rows=${JSON.stringify(result.rows)}`
      );

      if (result.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_TOKEN",
            message: "Invalid or expired reset token",
          },
        });
      }

      const user = new User(result.rows[0]);

      // Update password
      await user.updatePassword(newPassword);

      // Clear reset token
      await db.query(
        `
        UPDATE users
        SET password_reset_token = NULL, password_reset_expires = NULL
        WHERE id = $1
      `,
        [user.id]
      );

      // Log password reset
      await Audit.logAction(user.id, "PASSWORD_RESET_COMPLETED", {
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      res.json({
        success: true,
        message:
          "Password reset successful. You can now login with your new password.",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Send OTP for two-factor authentication
   * @route   POST /api/v1/auth/send-otp
   * @access  Public
   */
  async sendOTP(req, res, next) {
    try {
      const { phone, email } = req.body;

      if (!phone && !email) {
        return res.status(400).json({
          success: false,
          error: {
            code: "MISSING_CONTACT",
            message: "Phone or email is required",
          },
        });
      }

      // Generate OTP
      const otp = auth.generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store OTP in Redis
      const key = phone ? `otp:${phone}` : `otp:${email}`;
      await redis.set(key, { otp, expiresAt }, 600); // 10 minutes

      // Send OTP via SMS or Email
      if (phone) {
        await smsService.sendOTP(phone, otp, "verification");
      } else {
        await emailService.sendEmail({
          to: email,
          subject: "Your OTP Code",
          template: "otp",
          data: { otp, expiresIn: "10 minutes" },
        });
      }

      res.json({
        success: true,
        message: "OTP sent successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Verify OTP
   * @route   POST /api/v1/auth/verify-otp
   * @access  Public
   */
  async verifyOTP(req, res, next) {
    try {
      const { phone, email, otp } = req.body;

      if (!otp) {
        return res.status(400).json({
          success: false,
          error: {
            code: "MISSING_OTP",
            message: "OTP is required",
          },
        });
      }

      // Get OTP from Redis
      const key = phone ? `otp:${phone}` : `otp:${email}`;
      const stored = await redis.get(key);

      if (!stored) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_OTP",
            message: "Invalid or expired OTP",
          },
        });
      }

      if (stored.otp !== otp) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_OTP",
            message: "Invalid OTP",
          },
        });
      }

      if (new Date() > new Date(stored.expiresAt)) {
        await redis.del(key);
        return res.status(400).json({
          success: false,
          error: {
            code: "OTP_EXPIRED",
            message: "OTP has expired",
          },
        });
      }

      // OTP verified - delete it
      await redis.del(key);

      // Generate temporary token for verification
      const tempToken = auth.generateRandomToken();

      await redis.set(`temp:${tempToken}`, { verified: true }, 300); // 5 minutes

      res.json({
        success: true,
        data: {
          tempToken,
        },
        message: "OTP verified successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Get current user profile
   * @route   GET /api/v1/auth/profile
   * @access  Private
   */
  async getProfile(req, res, next) {
    try {
      const user = await User.findById(req.user.userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: "USER_NOT_FOUND",
            message: "User not found",
          },
        });
      }

      res.json({
        success: true,
        data: { user: user.toJSON() },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Update current user profile
   * @route   PUT /api/v1/auth/profile
   * @access  Private
   */
  async updateProfile(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: errors.array()[0].msg,
          },
        });
      }

      const userId = req.user.userId;
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: "USER_NOT_FOUND",
            message: "User not found",
          },
        });
      }

      // Update allowed fields for profile – kept deliberately narrow but
      // expanded so users can manage basic demographics without requiring
      // admin privileges.  Additional columns may be added here as needed.
      const allowedUpdates = [
        "first_name",
        "last_name",
        "phone_number",
        "alternate_phone",
        "address",
        "city",
        "region",
        "postal_code",
        "emergency_contact_name",
        "emergency_contact_phone",
        "emergency_contact_relationship",
        // newly editable fields
        "gender",
        "national_id_type",
        "national_id_number",
        "date_of_birth",
      ];

      const updateData = {};
      allowedUpdates.forEach((field) => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });

      const updatedUser = await user.update(updateData, userId);

      await Audit.logAction(userId, "PROFILE_UPDATED", {
        facility_id: req.user.facilityId,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      res.json({
        success: true,
        data: updatedUser.toJSON(),
        message: "Profile updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Enable two-factor authentication
   * @route   POST /api/v1/auth/enable-2fa
   * @access  Private
   */
  async enable2FA(req, res, next) {
    try {
      const userId = req.user.userId;
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: "USER_NOT_FOUND",
            message: "User not found",
          },
        });
      }

      // Generate 2FA secret
      const secret = auth.generateRandomToken(20);

      // Store secret temporarily
      await redis.set(`2fa_setup:${userId}`, secret, 600); // 10 minutes

      // Generate QR code data
      const otpauth = `otpauth://totp/HospitalManagement:${user.email}?secret=${secret}&issuer=HospitalManagement`;

      res.json({
        success: true,
        data: {
          secret,
          qrCode: otpauth,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * @desc    Verify and confirm 2FA setup
   * @route   POST /api/v1/auth/verify-2fa
   * @access  Private
   */
  async verify2FA(req, res, next) {
    try {
      const { token } = req.body;
      const userId = req.user.userId;

      // Get secret from Redis
      const secret = await redis.get(`2fa_setup:${userId}`);

      if (!secret) {
        return res.status(400).json({
          success: false,
          error: {
            code: "SETUP_EXPIRED",
            message: "2FA setup has expired. Please try again.",
          },
        });
      }

      // Verify token (simplified - in production use proper TOTP verification)
      const isValid = token === auth.generateOTP(); // This should use proper TOTP

      if (!isValid) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_TOKEN",
            message: "Invalid verification token",
          },
        });
      }

      // Enable 2FA for user
      await db.query(
        `
        UPDATE users
        SET two_factor_enabled = true, two_factor_secret = $1
        WHERE id = $2
      `,
        [secret, userId]
      );

      await redis.del(`2fa_setup:${userId}`);

      await Audit.logAction(userId, "2FA_ENABLED", {
        facility_id: req.user.facilityId,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      res.json({
        success: true,
        message: "Two-factor authentication enabled successfully",
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
