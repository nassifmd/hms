const jwt = require("jsonwebtoken");

// Set env vars before requiring auth
process.env.JWT_SECRET = "test-jwt-secret-for-middleware-test";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-for-middleware-test";

jest.mock("../../config/logger", () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  http: jest.fn(),
}));

const auth = require("../../config/auth");

describe("JWT verification (via auth config)", () => {
  it("extracts userId from a valid access token", () => {
    const token = jwt.sign(
      { userId: "abc-123" },
      process.env.JWT_SECRET,
      { issuer: "hospital-management-system", audience: "hospital-api", expiresIn: "1h" }
    );
    const decoded = auth.verifyAccessToken(token);
    expect(decoded).toHaveProperty("userId", "abc-123");
  });

  it("throws for a malformed token", () => {
    expect(() => auth.verifyAccessToken("not-a-valid-token")).toThrow("Invalid token");
  });

  it("throws for a token signed with a different secret", () => {
    const token = jwt.sign(
      { userId: "user-1" },
      "wrong-secret",
      { issuer: "hospital-management-system", audience: "hospital-api", expiresIn: "1h" }
    );
    expect(() => auth.verifyAccessToken(token)).toThrow("Invalid token");
  });

  it("throws TokenExpiredError for an expired token", () => {
    const token = jwt.sign(
      { userId: "user-1" },
      process.env.JWT_SECRET,
      { issuer: "hospital-management-system", audience: "hospital-api", expiresIn: "0s" }
    );
    expect(() => auth.verifyAccessToken(token)).toThrow("Token expired");
  });
});

describe("Permission checks", () => {
  const userPermissions = ["read:patients", "write:visits"];

  it("hasPermission returns true when user has the permission", () => {
    expect(auth.hasPermission(userPermissions, "read:patients")).toBe(true);
  });

  it("hasPermission returns false when user lacks the permission", () => {
    expect(auth.hasPermission(userPermissions, "admin:system")).toBe(false);
  });

  it("hasAnyPermission returns true when user has at least one", () => {
    expect(auth.hasAnyPermission(userPermissions, ["write:visits", "admin:system"])).toBe(true);
  });

  it("hasAnyPermission returns false when user has none", () => {
    expect(auth.hasAnyPermission(userPermissions, ["admin:system", "delete:patients"])).toBe(false);
  });

  it("hasAllPermissions returns true when user has all", () => {
    expect(auth.hasAllPermissions(userPermissions, ["read:patients", "write:visits"])).toBe(true);
  });

  it("hasAllPermissions returns false when user lacks one", () => {
    expect(auth.hasAllPermissions(userPermissions, ["read:patients", "admin:system"])).toBe(false);
  });
});

describe("Role checks", () => {
  const userRoles = ["DOCTOR", "NURSE"];

  it("hasRole returns true when user has the role", () => {
    expect(auth.hasRole(userRoles, "DOCTOR")).toBe(true);
  });

  it("hasRole returns false when user lacks the role", () => {
    expect(auth.hasRole(userRoles, "ADMIN")).toBe(false);
  });

  it("hasAnyRole returns true when user has at least one", () => {
    expect(auth.hasAnyRole(userRoles, ["RECEPTIONIST", "DOCTOR"])).toBe(true);
  });

  it("hasAnyRole returns false when user has none", () => {
    expect(auth.hasAnyRole(userRoles, ["ADMIN", "SUPER_ADMIN"])).toBe(false);
  });
});
