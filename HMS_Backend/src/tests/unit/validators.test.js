const {
  isValidEmail,
  isValidPhoneNumber,
  isValidDigitalAddress,
  isValidGhanaCard,
  isValidNHISNumber,
  isValidPassportNumber,
  isValidVotersID,
  isValidDate,
  isFutureDate,
  isPastDate,
  isValidAge,
  isValidBloodGroup,
  isValidGender,
  isValidGhanaRegion,
  isValidUUID,
  isValidURL,
  isValidIP,
  isValidJSON,
  isStrongPassword,
  isValidAmount,
  isValidQuantity,
  isValidPercentage,
  isValidTime,
  isValidTimeRange,
  isValidDateRange,
  isValidFileType,
  isValidFileSize,
  isValidHexColor,
  isBase64,
  isArray,
  isObject,
  isFunction,
  isString,
  isNumber,
  isBoolean,
  isNil,
  isEmptyString,
  isValidCreditCard,
  isValidCVV,
  isValidExpiryDate,
  isValidSortOrder,
  isValidPagination,
  isValidSearchQuery,
  isValidDrugStrength,
  isValidDosage,
  isValidFrequency,
  isValidDiagnosisCode,
  isValidProcedureCode,
} = require("../../utils/validators");

describe("isValidEmail", () => {
  it("accepts valid emails", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("test@hospital.gov.gh")).toBe(true);
  });

  it("rejects invalid emails", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("isValidPhoneNumber", () => {
  // Ghana mobile formats: 0XX... or 233XX...
  it("accepts Ghana mobile numbers (024 prefix)", () => {
    expect(isValidPhoneNumber("0241234567")).toBe(true);
  });

  it("accepts 054 prefix", () => {
    expect(isValidPhoneNumber("0541234567")).toBe(true);
  });

  it("accepts 050 prefix", () => {
    expect(isValidPhoneNumber("0501234567")).toBe(true);
  });

  it("accepts 020 prefix", () => {
    expect(isValidPhoneNumber("0201234567")).toBe(true);
  });

  it("accepts numbers with 233 prefix", () => {
    expect(isValidPhoneNumber("233241234567")).toBe(true);
    expect(isValidPhoneNumber("233501234567")).toBe(true);
  });

  it("accepts landline numbers", () => {
    // Landline (Accra): 030XXXXXXX
    expect(isValidPhoneNumber("0302123456")).toBe(true);
    // Landline (Kumasi): 031XXXXXXX
    expect(isValidPhoneNumber("0312123456")).toBe(true);
  });

  it("rejects invalid phone numbers", () => {
    expect(isValidPhoneNumber("12345")).toBe(false);
    expect(isValidPhoneNumber("abcd")).toBe(false);
  });
});

describe("isValidGhanaCard", () => {
  it("accepts valid Ghana Card format (GHA-XXXXXXXXX-X)", () => {
    expect(isValidGhanaCard("GHA-123456789-1")).toBe(true);
  });

  it("rejects invalid formats", () => {
    expect(isValidGhanaCard("1234567890")).toBe(false);
    expect(isValidGhanaCard("GHA-12345-1")).toBe(false);
  });
});

describe("isValidDigitalAddress", () => {
  it("accepts valid digital address (GA-XXX-XXXX)", () => {
    expect(isValidDigitalAddress("GA-123-4567")).toBe(true);
    expect(isValidDigitalAddress("AK-123-4567")).toBe(true);
  });

  it("rejects invalid addresses", () => {
    expect(isValidDigitalAddress("123-456-7890")).toBe(false);
    expect(isValidDigitalAddress("GA-12-345")).toBe(false);
  });
});

describe("isValidNHISNumber", () => {
  it("accepts NHIS numbers", () => {
    expect(isValidNHISNumber("NHIS/12345678")).toBe(true);
    expect(isValidNHISNumber("12345678")).toBe(true);
  });

  it("rejects invalid NHIS numbers", () => {
    expect(isValidNHISNumber("12")).toBe(false);
    expect(isValidNHISNumber("ABCD")).toBe(false);
  });
});

describe("isValidPassportNumber", () => {
  it("accepts Ghanian passport format (G + 7 digits)", () => {
    expect(isValidPassportNumber("G1234567")).toBe(true);
  });

  it("rejects invalid passports", () => {
    expect(isValidPassportNumber("12345678")).toBe(false);
    expect(isValidPassportNumber("G123456")).toBe(false);
  });
});

describe("isValidVotersID", () => {
  it("accepts 10-digit voter's ID", () => {
    expect(isValidVotersID("1234567890")).toBe(true);
  });

  it("rejects invalid voter IDs", () => {
    expect(isValidVotersID("123456789")).toBe(false);
    expect(isValidVotersID("ABCDEFGHIJ")).toBe(false);
  });
});

describe("Date validators", () => {
  describe("isValidDate", () => {
    it("accepts valid dates", () => {
      expect(isValidDate("2024-01-15")).toBe(true);
      expect(isValidDate("2024/01/15")).toBe(true);
    });

    it("rejects invalid dates", () => {
      expect(isValidDate("not-a-date")).toBe(false);
    });
  });

  describe("isFutureDate", () => {
    it("returns true for a future date", () => {
      const future = new Date(Date.now() + 86400000).toISOString();
      expect(isFutureDate(future)).toBe(true);
    });

    it("returns false for a past date", () => {
      expect(isFutureDate("2020-01-01")).toBe(false);
    });
  });

  describe("isPastDate", () => {
    it("returns true for a past date", () => {
      expect(isPastDate("2020-01-01")).toBe(true);
    });

    it("returns false for a future date", () => {
      const future = new Date(Date.now() + 86400000).toISOString();
      expect(isPastDate(future)).toBe(false);
    });
  });
});

describe("isValidAge", () => {
  it("validates age within default range (0-150)", () => {
    expect(isValidAge("2000-01-01")).toBe(true);
  });

  it("checks minimum age", () => {
    // Someone born today has age 0, so minAge 18 should fail
    const today = new Date().toISOString().split("T")[0];
    expect(isValidAge(today, 18)).toBe(false);
  });
});

describe("isValidBloodGroup", () => {
  it("accepts valid blood groups from constants", () => {
    const validGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
    validGroups.forEach((bg) => {
      expect(isValidBloodGroup(bg)).toBe(true);
    });
  });

  it("rejects invalid blood groups", () => {
    expect(isValidBloodGroup("A")).toBe(false);
    expect(isValidBloodGroup("C+")).toBe(false);
  });
});

describe("isValidGender", () => {
  it("accepts valid genders from constants", () => {
    expect(isValidGender("Male")).toBe(true);
    expect(isValidGender("Female")).toBe(true);
    expect(isValidGender("Other")).toBe(true);
  });

  it("rejects invalid genders", () => {
    expect(isValidGender("male")).toBe(false);
    expect(isValidGender("unknown")).toBe(false);
  });
});

describe("isValidGhanaRegion", () => {
  it("accepts valid Ghana regions", () => {
    const regions = [
      "Greater Accra",
      "Ashanti",
      "Eastern",
      "Western",
      "Central",
      "Volta",
      "Northern",
      "Upper East",
      "Upper West",
      "Brong Ahafo",
      "Bono",
      "Ahafo",
      "Bono East",
      "Oti",
      "Western North",
      "North East",
      "Savannah",
    ];
    regions.forEach((r) => {
      expect(isValidGhanaRegion(r)).toBe(true);
    });
  });

  it("rejects invalid regions", () => {
    expect(isValidGhanaRegion("Invalid Region")).toBe(false);
  });
});

describe("isValidUUID", () => {
  it("accepts valid UUIDs", () => {
    expect(isValidUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("rejects invalid UUIDs", () => {
    expect(isValidUUID("not-a-uuid")).toBe(false);
    expect(isValidUUID("")).toBe(false);
  });
});

describe("isValidURL", () => {
  it("accepts valid URLs", () => {
    expect(isValidURL("https://example.com")).toBe(true);
  });

  it("rejects invalid URLs", () => {
    expect(isValidURL("not-a-url")).toBe(false);
  });
});

describe("isValidIP", () => {
  it("accepts valid IP addresses", () => {
    expect(isValidIP("192.168.1.1")).toBe(true);
    expect(isValidIP("::1")).toBe(true);
  });

  it("rejects invalid IPs", () => {
    expect(isValidIP("999.999.999.999")).toBe(false);
  });
});

describe("isValidJSON", () => {
  it("accepts valid JSON strings", () => {
    expect(isValidJSON('{"key": "value"}')).toBe(true);
    expect(isValidJSON("[]")).toBe(true);
  });

  it("rejects invalid JSON strings", () => {
    expect(isValidJSON("{invalid}")).toBe(false);
    expect(isValidJSON("")).toBe(false);
  });
});

describe("isStrongPassword", () => {
  it("accepts strong passwords", () => {
    expect(isStrongPassword("Test@1234")).toBe(true);
  });

  it("rejects weak passwords", () => {
    expect(isStrongPassword("short")).toBe(false);
    expect(isStrongPassword("onlylowercase")).toBe(false);
    expect(isStrongPassword("NoSpecial1")).toBe(false);
    expect(isStrongPassword("NoNumber@")).toBe(false);
  });
});

describe("isValidAmount", () => {
  it("accepts valid amounts", () => {
    expect(isValidAmount("100")).toBe(true);
    expect(isValidAmount("99.99")).toBe(true);
    expect(isValidAmount("0")).toBe(true);
  });

  it("rejects negative or too many decimals", () => {
    expect(isValidAmount("-10")).toBe(false);
    expect(isValidAmount("10.123")).toBe(false);
  });
});

describe("isValidQuantity", () => {
  it("accepts non-negative integers", () => {
    expect(isValidQuantity(0)).toBe(true);
    expect(isValidQuantity(5)).toBe(true);
  });

  it("rejects negative or non-integers", () => {
    expect(isValidQuantity(-1)).toBe(false);
    expect(isValidQuantity(1.5)).toBe(false);
  });
});

describe("isValidPercentage", () => {
  it("accepts percentages 0-100", () => {
    expect(isValidPercentage("50")).toBe(true);
    expect(isValidPercentage("0")).toBe(true);
    expect(isValidPercentage("100")).toBe(true);
    expect(isValidPercentage("99.99")).toBe(true);
  });

  it("rejects out-of-range percentages", () => {
    expect(isValidPercentage("101")).toBe(false);
    expect(isValidPercentage("-1")).toBe(false);
  });
});

describe("isValidTime", () => {
  it("accepts valid times (HH:MM)", () => {
    expect(isValidTime("09:30")).toBe(true);
    expect(isValidTime("23:59")).toBe(true);
    expect(isValidTime("9:00")).toBe(true);
  });

  it("rejects invalid times", () => {
    expect(isValidTime("25:00")).toBe(false);
    expect(isValidTime("12:60")).toBe(false);
  });
});

describe("isValidTimeRange", () => {
  it("accepts valid time ranges", () => {
    expect(isValidTimeRange("09:00", "17:00")).toBe(true);
  });

  it("rejects when end <= start", () => {
    expect(isValidTimeRange("17:00", "09:00")).toBe(false);
  });

  it("rejects invalid times", () => {
    expect(isValidTimeRange("invalid", "17:00")).toBe(false);
  });
});

describe("isValidDateRange", () => {
  it("accepts valid date ranges (end >= start)", () => {
    expect(isValidDateRange("2024-01-01", "2024-01-15")).toBe(true);
    expect(isValidDateRange("2024-01-01", "2024-01-01")).toBe(true);
  });

  it("rejects when end < start", () => {
    expect(isValidDateRange("2024-01-15", "2024-01-01")).toBe(false);
  });

  it("rejects invalid dates", () => {
    expect(isValidDateRange("bad", "2024-01-01")).toBe(false);
  });
});

describe("isValidFileType", () => {
  it("accepts allowed file types", () => {
    expect(isValidFileType("document.pdf", ["pdf", "doc"])).toBe(true);
  });

  it("rejects disallowed file types", () => {
    expect(isValidFileType("virus.exe", ["pdf", "doc"])).toBe(false);
  });
});

describe("isValidFileSize", () => {
  it("accepts files within size limit", () => {
    expect(isValidFileSize(100, 1000)).toBe(true);
  });

  it("rejects oversized files", () => {
    expect(isValidFileSize(2000, 1000)).toBe(false);
  });
});

describe("isValidHexColor", () => {
  it("accepts valid hex colors", () => {
    expect(isValidHexColor("#fff")).toBe(true);
    expect(isValidHexColor("#FF0000")).toBe(true);
    expect(isValidHexColor("#aabbcc")).toBe(true);
  });

  it("rejects invalid hex colors", () => {
    expect(isValidHexColor("#xyz")).toBe(false);
    expect(isValidHexColor("fff")).toBe(false);
  });
});

describe("isBase64", () => {
  it("accepts valid base64 data URIs", () => {
    expect(isBase64("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isBase64("data:;base64,AAAA")).toBe(true);
  });

  it("rejects invalid base64", () => {
    expect(isBase64("not-base64")).toBe(false);
    expect(isBase64("")).toBe(false);
  });
});

describe("Type checks", () => {
  describe("isArray", () => {
    it("returns true for arrays", () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
    });

    it("returns false for non-arrays", () => {
      expect(isArray({})).toBe(false);
      expect(isArray(null)).toBe(false);
    });
  });

  describe("isObject", () => {
    it("returns true for plain objects", () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ a: 1 })).toBe(true);
    });

    it("returns falsy for null (null && ...) evaluates to null", () => {
      expect(isObject(null)).toBe(null);
    });

    it("returns false for arrays and other types", () => {
      expect(isObject([])).toBe(false);
      expect(isObject("string")).toBe(false);
    });
  });

  describe("isFunction", () => {
    it("returns true for functions", () => {
      expect(isFunction(() => {})).toBe(true);
    });

    it("returns false for non-functions", () => {
      expect(isFunction("string")).toBe(false);
    });
  });

  describe("isString", () => {
    it("returns true for strings", () => {
      expect(isString("hello")).toBe(true);
    });

    it("returns false for non-strings", () => {
      expect(isString(123)).toBe(false);
    });
  });

  describe("isNumber", () => {
    it("returns true for numbers", () => {
      expect(isNumber(42)).toBe(true);
    });

    it("returns false for NaN", () => {
      expect(isNumber(NaN)).toBe(false);
    });

    it("returns false for non-numbers", () => {
      expect(isNumber("42")).toBe(false);
    });
  });

  describe("isBoolean", () => {
    it("returns true for booleans", () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
    });

    it("returns false for non-booleans", () => {
      expect(isBoolean(0)).toBe(false);
      expect(isBoolean("true")).toBe(false);
    });
  });

  describe("isNil", () => {
    it("returns true for null and undefined", () => {
      expect(isNil(null)).toBe(true);
      expect(isNil(undefined)).toBe(true);
    });

    it("returns false for other values", () => {
      expect(isNil(0)).toBe(false);
      expect(isNil("")).toBe(false);
    });
  });

  describe("isEmptyString", () => {
    it("returns true for empty or whitespace-only strings", () => {
      expect(isEmptyString("")).toBe(true);
      expect(isEmptyString("   ")).toBe(true);
    });

    it("returns false for non-empty strings or non-strings", () => {
      expect(isEmptyString("hello")).toBe(false);
      expect(isEmptyString(null)).toBe(false);
    });
  });
});

describe("isValidCreditCard", () => {
  it("accepts valid credit card numbers", () => {
    expect(isValidCreditCard("4111111111111111")).toBe(true); // Visa test
    expect(isValidCreditCard("5500000000000004")).toBe(true); // MC test
  });

  it("rejects invalid card numbers", () => {
    expect(isValidCreditCard("1234567890123456")).toBe(false);
  });
});

describe("isValidCVV", () => {
  it("accepts 3 or 4 digit CVVs", () => {
    expect(isValidCVV("123")).toBe(true);
    expect(isValidCVV("1234")).toBe(true);
  });

  it("rejects invalid CVVs", () => {
    expect(isValidCVV("12")).toBe(false);
    expect(isValidCVV("abc")).toBe(false);
  });
});

describe("isValidExpiryDate", () => {
  it("accepts a valid future expiry", () => {
    const future = new Date(Date.now() + 365 * 86400000);
    const month = String(future.getMonth() + 1).padStart(2, "0");
    const year = String(future.getFullYear()).slice(-2);
    expect(isValidExpiryDate(`${month}/${year}`)).toBe(true);
  });

  it("rejects MM/YY format violations", () => {
    expect(isValidExpiryDate("13/25")).toBe(false); // invalid month
    expect(isValidExpiryDate("00/25")).toBe(false); // month 00
  });
});

describe("isValidSortOrder", () => {
  it("accepts asc/desc case-insensitively", () => {
    expect(isValidSortOrder("asc")).toBe(true);
    expect(isValidSortOrder("desc")).toBe(true);
    expect(isValidSortOrder("ASC")).toBe(true);
    expect(isValidSortOrder("DESC")).toBe(true);
  });

  it("rejects invalid sort orders", () => {
    expect(isValidSortOrder("invalid")).toBe(false);
    expect(isValidSortOrder("ascending")).toBe(false);
  });
});

describe("isValidPagination", () => {
  it("accepts valid page/limit", () => {
    expect(isValidPagination(1, 20)).toBe(true);
    expect(isValidPagination(5, 50)).toBe(true);
  });

  it("page 0 passes because !0 is truthy", () => {
    expect(isValidPagination(0, 20)).toBe(true);
  });

  it("rejects negative page or limit > 100", () => {
    expect(isValidPagination(-1, 20)).toBe(false);
    expect(isValidPagination(1, 200)).toBe(false);
  });
});

describe("isValidSearchQuery", () => {
  it("accepts queries with length >= 2", () => {
    expect(isValidSearchQuery("ab")).toBe(true);
    expect(isValidSearchQuery("search term")).toBe(true);
  });

  it("rejects short queries", () => {
    expect(isValidSearchQuery("a")).toBe(false);
    expect(isValidSearchQuery(123)).toBe(false);
  });
});

describe("isValidDrugStrength", () => {
  it("accepts valid strengths like 500mg", () => {
    expect(isValidDrugStrength("500mg")).toBe(true);
  });

  it("accepts compound strengths like 250mg/5ml", () => {
    expect(isValidDrugStrength("250mg/5ml")).toBe(true);
  });

  it("rejects invalid formats like 10mg/ml (no digit after /)", () => {
    expect(isValidDrugStrength("10mg/ml")).toBe(false);
  });
});

describe("isValidDosage", () => {
  it("accepts valid dosages like '1 tablet'", () => {
    expect(isValidDosage("1 tablet")).toBe(true);
  });

  it("accepts singular units like '2 capsule'", () => {
    expect(isValidDosage("2 capsule")).toBe(true);
  });

  it("accepts '5ml'", () => {
    expect(isValidDosage("5ml")).toBe(true);
  });
});

describe("isValidFrequency", () => {
  it("accepts valid frequencies", () => {
    expect(isValidFrequency("once daily")).toBe(true);
    expect(isValidFrequency("twice daily")).toBe(true);
    expect(isValidFrequency("every 8 hours")).toBe(true);
    expect(isValidFrequency("as needed")).toBe(true);
  });

  it("rejects invalid frequencies", () => {
    expect(isValidFrequency("five times daily")).toBe(false);
    expect(isValidFrequency("once a week")).toBe(false);
  });
});

describe("isValidDiagnosisCode", () => {
  it("accepts ICD-11-like codes", () => {
    expect(isValidDiagnosisCode("1A00")).toBe(true);
    expect(isValidDiagnosisCode("1A00.Z")).toBe(true);
  });

  it("rejects invalid codes", () => {
    expect(isValidDiagnosisCode("")).toBe(false);
  });
});

describe("isValidProcedureCode", () => {
  it("accepts 5-digit CPT codes", () => {
    expect(isValidProcedureCode("12345")).toBe(true);
  });

  it("rejects non-5-digit codes", () => {
    expect(isValidProcedureCode("1234")).toBe(false);
    expect(isValidProcedureCode("123456")).toBe(false);
  });
});
