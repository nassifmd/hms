const { AppError } = require("../../utils/errors");

describe("AppError", () => {
  it("creates an error with default statusCode 500 and code INTERNAL_SERVER_ERROR", () => {
    const err = new AppError("Something went wrong");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.message).toBe("Something went wrong");
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe("INTERNAL_SERVER_ERROR");
    expect(err.name).toBe("AppError");
  });

  it("accepts a custom statusCode", () => {
    const err = new AppError("Not found", 404);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("INTERNAL_SERVER_ERROR");
  });

  it("accepts a custom error code", () => {
    const err = new AppError("Validation failed", 400, "VALIDATION_ERROR");
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
  });

  it("has a stack trace", () => {
    const err = new AppError("Stack trace test");
    expect(err.stack).toBeDefined();
    expect(typeof err.stack).toBe("string");
    // Stack should include this test file name
    expect(err.stack).toContain("errors.test.js");
  });

  it("is throwable and catchable", () => {
    expect(() => {
      throw new AppError("Thrown error", 403, "FORBIDDEN");
    }).toThrow(AppError);
    expect(() => {
      throw new AppError("Thrown error");
    }).toThrow(Error);
  });

  it("preserves custom properties when caught", () => {
    try {
      throw new AppError("Custom error", 422, "UNPROCESSABLE_ENTITY");
    } catch (err) {
      expect(err.message).toBe("Custom error");
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe("UNPROCESSABLE_ENTITY");
    }
  });
});
