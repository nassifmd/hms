const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const authController = require("../../controllers/authController");
const { authenticateToken } = require("../../middleware/auth");

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate user and get token
 * @access  Public
 */
router.post(
  "/login",
  [
    body("email")
      .notEmpty()
      .withMessage("Please provide your email or employee ID"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  authController.login
);

/**
 * @route   POST /api/v1/auth/refresh-token
 * @desc    Refresh access token
 * @access  Public
 */
router.post("/refresh-token", authController.refreshToken);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post("/logout", authenticateToken, authController.logout);

/**
 * @route   POST /api/v1/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.post(
  "/change-password",
  authenticateToken,
  [
    body("currentPassword")
      .notEmpty()
      .withMessage("Current password is required"),
    body("newPassword")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
  ],
  authController.changePassword
);

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Request password reset
 * @access  Public
 */
router.post(
  "/forgot-password",
  [body("email").isEmail().withMessage("Please provide a valid email")],
  authController.forgotPassword
);

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Reset password with token
 * @access  Public
 */
router.post(
  "/reset-password",
  [
    body("token").notEmpty().withMessage("Reset token is required"),
    body("newPassword")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
  ],
  authController.resetPassword
);

/**
 * @route   POST /api/v1/auth/send-otp
 * @desc    Send OTP for verification
 * @access  Public
 */
router.post(
  "/send-otp",
  [
    body("phone").optional().isMobilePhone("any"),
    body("email").optional().isEmail(),
  ],
  authController.sendOTP
);

/**
 * @route   POST /api/v1/auth/verify-otp
 * @desc    Verify OTP
 * @access  Public
 */
router.post(
  "/verify-otp",
  [
    body("otp")
      .isLength({ min: 6, max: 6 })
      .withMessage("Valid OTP is required"),
  ],
  authController.verifyOTP
);

/**
 * @route   GET /api/v1/auth/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get("/me", authenticateToken, authController.getProfile);
router.get("/profile", authenticateToken, authController.getProfile);

/**
 * @route   PUT /api/v1/auth/profile
 * @desc    Update current user profile
 * @access  Private
 */
router.put(
  "/profile",
  authenticateToken,
  [
    body("first_name")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("First name cannot be empty"),
    body("last_name")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Last name cannot be empty"),
    body("phone_number").optional().isMobilePhone("any"),
    body("email").optional().isEmail(),
    body("gender")
      .optional()
      .isIn(["Male", "Female", "Other"])
      .withMessage("Invalid gender"),
    body("national_id_type").optional().isString(),
    body("national_id_number").optional().isString(),
    body("date_of_birth").optional().isISO8601().toDate(),
  ],
  authController.updateProfile
);

/**
 * @route   POST /api/v1/auth/sessions/invalidate-all
 * @desc    Invalidate all sessions for the current user (force re-login)
 * @access  Private
 */
router.post(
  "/sessions/invalidate-all",
  authenticateToken,
  authController.invalidateAllSessions
);

/**
 * @route   POST /api/v1/auth/enable-2fa
 * @desc    Enable two-factor authentication
 * @access  Private
 */
router.post("/enable-2fa", authenticateToken, authController.enable2FA);

/**
 * @route   POST /api/v1/auth/verify-2fa
 * @desc    Verify and confirm 2FA setup
 * @access  Private
 */
router.post(
  "/verify-2fa",
  authenticateToken,
  [
    body("token")
      .isLength({ min: 6, max: 6 })
      .withMessage("Valid verification token is required"),
  ],
  authController.verify2FA
);

module.exports = router;
