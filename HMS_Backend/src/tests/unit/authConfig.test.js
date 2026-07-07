const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

// Mock the logger before requiring auth
jest.mock("../../config/logger", () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  http: jest.fn(),
}));

process.env.JWT_SECRET = "test-jwt-secret-for-testing";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-for-testing";
process.env.JWT_EXPIRES_IN = "1h";
process.env.JWT_REFRESH_EXPIRES_IN = "7d";
process.env.BCRYPT_ROUNDS = "4";

const auth = require("../../config/auth");

describe("AuthConfig", () => {
  describe("hashPassword / verifyPassword", () => {
    it("hashes and verifies a password correctly", async () => {
      const password = "TestPass123!";
      const hash = await auth.hashPassword(password);
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);

      const isValid = await auth.verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it("returns false for wrong password", async () => {
      const hash = await auth.hashPassword("correct");
      const isValid = await auth.verifyPassword("wrong", hash);
      expect(isValid).toBe(false);
    });
  });

  describe("generateTokens", () => {
    const mockUser = {
      id: "user-123",
      employee_id: "EMP-001",
      facility_id: "fac-001",
      department_id: "dept-001",
      roles: ["DOCTOR"],
      permissions: ["read:patients"],
    };

    it("returns accessToken, refreshToken, and expiresIn", () => {
      const tokens = auth.generateTokens(mockUser);
      expect(tokens).toHaveProperty("accessToken");
      expect(tokens).toHaveProperty("refreshToken");
      expect(tokens).toHaveProperty("expiresIn");
      expect(tokens.expiresIn).toBe(3600); // 1h in seconds
    });

    it("generates valid JWTs", () => {
      const tokens = auth.generateTokens(mockUser);
      const decoded = jwt.verify(tokens.accessToken, process.env.JWT_SECRET, {
        issuer: "hospital-management-system",
        audience: "hospital-api",
      });
      expect(decoded.userId).toBe("user-123");
      expect(decoded.roles).toEqual(["DOCTOR"]);
    });
  });

  describe("verifyAccessToken", () => {
    it("verifies a valid token", () => {
      const token = jwt.sign(
        { userId: "user-1" },
        process.env.JWT_SECRET,
        { issuer: "hospital-management-system", audience: "hospital-api", expiresIn: "1h" }
      );
      const decoded = auth.verifyAccessToken(token);
      expect(decoded.userId).toBe("user-1");
    });

    it("throws for invalid token", () => {
      expect(() => auth.verifyAccessToken("bad-token")).toThrow("Invalid token");
    });

    it("throws for expired token", () => {
      const token = jwt.sign(
        { userId: "user-1" },
        process.env.JWT_SECRET,
        { issuer: "hospital-management-system", audience: "hospital-api", expiresIn: "0s" }
      );
      // Wait a tick to ensure expiry
      expect(() => auth.verifyAccessToken(token)).toThrow("Token expired");
    });
  });

  describe("verifyRefreshToken", () => {
    it("verifies a valid refresh token", () => {
      const token = jwt.sign(
        { userId: "user-1" },
        process.env.JWT_REFRESH_SECRET,
        { issuer: "hospital-management-system", audience: "hospital-api", expiresIn: "7d" }
      );
      const decoded = auth.verifyRefreshToken(token);
      expect(decoded.userId).toBe("user-1");
    });

    it("throws for expired refresh token", () => {
      const token = jwt.sign(
        { userId: "user-1" },
        process.env.JWT_REFRESH_SECRET,
        { issuer: "hospital-management-system", audience: "hospital-api", expiresIn: "0s" }
      );
      expect(() => auth.verifyRefreshToken(token)).toThrow("Refresh token expired");
    });

    it("throws for invalid refresh token", () => {
      expect(() => auth.verifyRefreshToken("bad")).toThrow("Invalid refresh token");
    });
  });

  describe("generateRandomToken", () => {
    it("generates hex token with default 32 bytes (64 chars)", () => {
      const token = auth.generateRandomToken();
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it("generates token with custom bytes", () => {
      const token = auth.generateRandomToken(5);
      expect(token).toMatch(/^[a-f0-9]{10}$/);
    });
  });

  describe("generateOTP", () => {
    it("generates numeric OTP of default length 6", () => {
      const otp = auth.generateOTP();
      expect(otp).toMatch(/^\d{6}$/);
    });

    it("generates OTP of custom length", () => {
      const otp = auth.generateOTP(8);
      expect(otp).toMatch(/^\d{8}$/);
    });
  });

  describe("createSession", () => {
    it("creates a session object", () => {
      const session = auth.createSession("user-1", { device: "mobile" });
      expect(session).toHaveProperty("sessionId");
      expect(session.userId).toBe("user-1");
      expect(session.deviceInfo).toEqual({ device: "mobile" });
      expect(session.isValid).toBe(true);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe("Permission helpers", () => {
    const permissions = ["read:patients", "write:visits"];

    it("hasPermission checks single permission", () => {
      expect(auth.hasPermission(permissions, "read:patients")).toBe(true);
      expect(auth.hasPermission(permissions, "admin:system")).toBe(false);
    });

    it("hasAnyPermission checks multiple", () => {
      expect(auth.hasAnyPermission(permissions, ["read:patients", "admin"])).toBe(true);
      expect(auth.hasAnyPermission(permissions, ["admin", "super"])).toBe(false);
    });

    it("hasAllPermissions checks all", () => {
      expect(auth.hasAllPermissions(permissions, ["read:patients", "write:visits"])).toBe(true);
      expect(auth.hasAllPermissions(permissions, ["read:patients", "admin"])).toBe(false);
    });

    it("hasRole checks role", () => {
      expect(auth.hasRole(["DOCTOR"], "DOCTOR")).toBe(true);
      expect(auth.hasRole(["DOCTOR"], "ADMIN")).toBe(false);
    });

    it("hasAnyRole checks any role", () => {
      expect(auth.hasAnyRole(["DOCTOR", "NURSE"], ["STUDENT", "DOCTOR"])).toBe(true);
      expect(auth.hasAnyRole(["DOCTOR"], ["ADMIN"])).toBe(false);
    });

    it("returns false for null/undefined inputs", () => {
      expect(auth.hasPermission(null, "perm")).toBe(false);
      expect(auth.hasAnyPermission(["a"], null)).toBe(false);
      expect(auth.hasAllPermissions(null, ["a"])).toBe(false);
      expect(auth.hasRole(null, "role")).toBe(false);
      expect(auth.hasAnyRole(["a"], null)).toBe(false);
    });
  });

  describe("getExpirySeconds", () => {
    it("parses seconds", () => {
      expect(auth.getExpirySeconds("30s")).toBe(30);
    });

    it("parses minutes", () => {
      expect(auth.getExpirySeconds("5m")).toBe(300);
    });

    it("parses hours", () => {
      expect(auth.getExpirySeconds("2h")).toBe(7200);
    });

    it("parses days", () => {
      expect(auth.getExpirySeconds("1d")).toBe(86400);
    });

    it("defaults to 8 hours for unknown unit", () => {
      expect(auth.getExpirySeconds("10x")).toBe(28800);
    });
  });

  describe("generateApiKey / verifyApiKey", () => {
    it("generates api key, secret, and hash", () => {
      const result = auth.generateApiKey();
      expect(result).toHaveProperty("key");
      expect(result).toHaveProperty("secret");
      expect(result).toHaveProperty("hash");
      expect(result.key).toMatch(/^[a-f0-9]{64}$/);
      expect(result.secret).toMatch(/^[a-f0-9]{96}$/);
    });

    it("verifies api key correctly", () => {
      const { key, secret, hash } = auth.generateApiKey();
      expect(auth.verifyApiKey(key, secret, hash)).toBe(true);
    });

    it("rejects wrong secret", () => {
      const { key, hash } = auth.generateApiKey();
      expect(auth.verifyApiKey(key, "wrong-secret", hash)).toBe(false);
    });
  });
});
