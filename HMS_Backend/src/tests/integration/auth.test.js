const request = require("supertest");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

// Set env vars first
process.env.JWT_SECRET = "integration-test-jwt-secret";
process.env.JWT_REFRESH_SECRET = "integration-test-refresh-secret";
process.env.JWT_EXPIRES_IN = "1h";
process.env.JWT_REFRESH_EXPIRES_IN = "7d";
process.env.BCRYPT_ROUNDS = "4";
process.env.NODE_ENV = "test";

// Mock database, logger, email, sms
jest.mock("../../config/database", () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  _shuttingDown: false,
}));

jest.mock("../../models/Audit", () => ({
  logLogin: jest.fn().mockResolvedValue(null),
  logLogout: jest.fn().mockResolvedValue(null),
  logAction: jest.fn().mockResolvedValue(null),
  log: jest.fn().mockResolvedValue(null),
}));

jest.mock("../../config/logger", () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  http: jest.fn(),
}));

jest.mock("../../config/email", () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
}));

jest.mock("../../config/sms", () => ({
  sendSms: jest.fn().mockResolvedValue(true),
}));

const auth = require("../../config/auth");
const Audit = require("../../models/Audit");
const db = require("../../config/database");
const redis = require("../../config/redis");

// Mock User model — everything inlined so babel-hoisting doesn't break
jest.mock("../../models/User", () => {
  // eslint-disable-next-line no-unused-vars
  const _user = {
    id: "test-user-id",
    employee_id: "EMP-001",
    facility_id: "fac-001",
    department_id: "dept-001",
    first_name: "Test",
    last_name: "User",
    email: "test@hospital.com",
    phone_number: "0241234567",
    user_status: "Active",
    password_hash: null,
    roles: [],
    permissions: [],
    branch_id: null,
    gender: "Male",
    login_attempts: 0,
    account_locked: false,
    two_factor_enabled: false,
    created_at: new Date(),
    updated_at: new Date(),
    facility: null,
    department: null,
    verifyPassword: jest.fn(),
    login: jest.fn().mockResolvedValue(true),
    incrementLoginAttempts: jest.fn().mockResolvedValue(true),
    toJSON: jest.fn().mockReturnValue({
      id: "test-user-id",
      employeeId: "EMP-001",
      facilityId: "fac-001",
      firstName: "Test",
      lastName: "User",
      email: "test@hospital.com",
      phone: "0241234567",
      userStatus: "Active",
      isActive: true,
      roles: [],
      permissions: [],
    }),
  };

  const MockUser = function (data) {
    return { ..._user, ...data };
  };

  MockUser.findByEmail = jest.fn().mockResolvedValue(_user);
  MockUser.findByUsername = jest.fn().mockResolvedValue(null);
  MockUser.findByEmployeeId = jest.fn().mockResolvedValue(null);
  MockUser.findById = jest.fn().mockResolvedValue(_user);
  MockUser.findAll = jest.fn().mockResolvedValue({ users: [], total: 0 });

  return MockUser;
});

const User = require("../../models/User");
const app = require("../../app");

/** Helper to create fresh mock user objects for per-test overrides */
function buildMockUser(overrides = {}) {
  const hash = null;
  return {
    id: "test-user-id",
    employee_id: "EMP-001",
    facility_id: "fac-001",
    department_id: "dept-001",
    first_name: "Test",
    last_name: "User",
    email: "test@hospital.com",
    phone_number: "0241234567",
    user_status: overrides.user_status || "Active",
    password_hash: hash,
    roles: [],
    permissions: [],
    branch_id: null,
    gender: "Male",
    login_attempts: 0,
    account_locked: false,
    two_factor_enabled: false,
    created_at: new Date(),
    updated_at: new Date(),
    facility: null,
    department: null,
    verifyPassword: jest.fn(),
    login: jest.fn().mockResolvedValue(true),
    incrementLoginAttempts: jest.fn().mockResolvedValue(true),
    toJSON: jest.fn().mockReturnValue({
      id: "test-user-id",
      employeeId: "EMP-001",
      facilityId: "fac-001",
      firstName: "Test",
      lastName: "User",
      email: "test@hospital.com",
      phone: "0241234567",
      userStatus: "Active",
      isActive: true,
      roles: [],
      permissions: [],
    }),
    ...overrides,
  };
}

describe("Auth Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.store.clear();
    redis.hashes.clear();
    redis.lists.clear();
    redis.channels.clear();
    redis.rateWindows.clear();

    const fresh = buildMockUser();
    User.findByEmail.mockResolvedValue(fresh);
    User.findByUsername.mockResolvedValue(null);
    User.findById.mockResolvedValue(fresh);
  });

  describe("POST /api/v1/auth/login", () => {
    it("returns 200 and tokens on successful login", async () => {
      const password = "TestPass123!";
      const hash = await bcrypt.hash(password, 4);
      const loginUser = buildMockUser({
        password_hash: hash,
        verifyPassword: jest.fn(async (pwd) => bcrypt.compare(pwd, hash)),
      });
      User.findByEmail.mockResolvedValue(loginUser);
      User.findById.mockResolvedValue(loginUser);

      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "test@hospital.com", password });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("accessToken");
      expect(res.body.data).toHaveProperty("refreshToken");
      expect(res.body.data).toHaveProperty("tokenType", "Bearer");
    });

    it("returns 400 when email/employee ID is missing", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ password: "somepass" });
      expect(res.status).toBe(400);
    });

    it("returns 400 when password is missing", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "test@hospital.com" });
      expect(res.status).toBe(400);
    });

    it("returns 401 when user not found", async () => {
      User.findByEmail.mockResolvedValue(null);
      User.findByUsername.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "nobody@hospital.com", password: "TestPass123!" });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
    });

    it("returns 403 when user is inactive", async () => {
      const inactive = buildMockUser({ user_status: "Inactive" });
      User.findByEmail.mockResolvedValue(inactive);

      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "test@hospital.com", password: "TestPass123!" });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("INACTIVE_ACCOUNT");
    });

    it("returns 401 when password is wrong", async () => {
      const hash = await bcrypt.hash("CorrectPass1!", 4);
      const wrongUser = buildMockUser({
        password_hash: hash,
        verifyPassword: jest.fn(async (pwd) => bcrypt.compare(pwd, hash)),
      });
      User.findByEmail.mockResolvedValue(wrongUser);

      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "test@hospital.com", password: "WrongPass1!" });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
    });

    it("handles SQL injection attempt gracefully (does not crash)", async () => {
      User.findByEmail.mockResolvedValue(null);
      User.findByUsername.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "' OR 1=1 --", password: "' OR '1'='1" });

      expect([400, 401]).toContain(res.status);
    });
  });

  describe("POST /api/v1/auth/refresh-token", () => {
    it("returns 400 when refresh token is missing", async () => {
      const res = await request(app)
        .post("/api/v1/auth/refresh-token")
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("MISSING_TOKEN");
    });

    it("returns 500 for an invalid JWT refresh token (generic error in catch)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/refresh-token")
        .send({ refreshToken: "not-a-valid-token" });
      // The controller throws a generic Error("Invalid refresh token") which
      // the catch block does not map to a 401 (only TokenExpiredError does),
      // so next(error) sends it to the error handler which defaults to 500.
      expect(res.status).toBe(500);
    });

    it("returns 401 when token hash not found in Redis", async () => {
      const refreshToken = jwt.sign(
        { userId: "test-user-id" },
        process.env.JWT_REFRESH_SECRET,
        {
          issuer: "hospital-management-system",
          audience: "hospital-api",
          expiresIn: "7d",
        }
      );

      const res = await request(app)
        .post("/api/v1/auth/refresh-token")
        .send({ refreshToken });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_TOKEN");
    });

    it("returns 401 when user is inactive (even with matching hash)", async () => {
      const refreshToken = jwt.sign(
        { userId: "test-user-id" },
        process.env.JWT_REFRESH_SECRET,
        {
          issuer: "hospital-management-system",
          audience: "hospital-api",
          expiresIn: "7d",
        }
      );

      const tokenHash = crypto
        .createHash("sha256")
        .update(refreshToken)
        .digest("hex");
      await redis.set(
        "refresh_token_hash:test-user-id",
        tokenHash,
        7 * 24 * 60 * 60
      );

      const inactive = buildMockUser({ user_status: "Inactive" });
      User.findById.mockResolvedValue(inactive);

      const res = await request(app)
        .post("/api/v1/auth/refresh-token")
        .send({ refreshToken });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("USER_NOT_FOUND");
    });

    it("returns 200 with new tokens when valid", async () => {
      const refreshToken = jwt.sign(
        { userId: "test-user-id" },
        process.env.JWT_REFRESH_SECRET,
        {
          issuer: "hospital-management-system",
          audience: "hospital-api",
          expiresIn: "7d",
        }
      );

      const tokenHash = crypto
        .createHash("sha256")
        .update(refreshToken)
        .digest("hex");
      await redis.set(
        "refresh_token_hash:test-user-id",
        tokenHash,
        7 * 24 * 60 * 60
      );

      const res = await request(app)
        .post("/api/v1/auth/refresh-token")
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("accessToken");
      expect(res.body.data).toHaveProperty("refreshToken");
    });
  });

  describe("POST /api/v1/auth/logout", () => {
    it("returns 401 when no token provided", async () => {
      const res = await request(app).post("/api/v1/auth/logout");
      expect(res.status).toBe(401);
    });

    it("returns 200 on successful logout", async () => {
      const token = jwt.sign(
        { userId: "test-user-id" },
        process.env.JWT_SECRET,
        {
          issuer: "hospital-management-system",
          audience: "hospital-api",
          expiresIn: "1h",
        }
      );

      db.query.mockResolvedValue({
        rows: [
          {
            id: "test-user-id",
            employee_id: "EMP-001",
            first_name: "Test",
            last_name: "User",
            email: "test@hospital.com",
            facility_id: "fac-001",
            branch_id: null,
            department_id: "dept-001",
            user_status: "Active",
            roles: [],
            permissions: [],
          },
        ],
        rowCount: 1,
      });

      const res = await request(app)
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Logout successful");
    });
  });

  describe("GET /api/v1/auth/me", () => {
    it("returns 401 when no token provided", async () => {
      const res = await request(app).get("/api/v1/auth/me");
      expect(res.status).toBe(401);
    });

    it("returns user profile when valid token is provided", async () => {
      const token = jwt.sign(
        { userId: "test-user-id" },
        process.env.JWT_SECRET,
        {
          issuer: "hospital-management-system",
          audience: "hospital-api",
          expiresIn: "1h",
        }
      );

      db.query.mockResolvedValue({
        rows: [
          {
            id: "test-user-id",
            employee_id: "EMP-001",
            first_name: "Test",
            last_name: "User",
            email: "test@hospital.com",
            facility_id: "fac-001",
            branch_id: null,
            department_id: "dept-001",
            user_status: "Active",
            roles: [],
            permissions: [],
          },
        ],
        rowCount: 1,
      });

      // Clear any stale state that could block the request
      await redis.del("token_version:test-user-id");
      await redis.del(`blacklist:${token}`);

      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("user");
    });
  });
});
