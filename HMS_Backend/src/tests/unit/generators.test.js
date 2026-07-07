const {
  generateUUID,
  generateRandomString,
  generateRandomNumber,
  generateOTP,
  generatePatientNumber,
  generateVisitNumber,
  generateAppointmentNumber,
  generateInvoiceNumber,
  generatePaymentNumber,
  generateClaimNumber,
  generatePrescriptionNumber,
  generateLabOrderNumber,
  generateEmployeeId,
  generateBatchNumber,
  generateTransactionReference,
  generateReceiptNumber,
  generateApiKey,
  generateApiSecret,
  generatePasswordResetToken,
  generateEmailVerificationToken,
  generateSessionId,
  generateTrackingNumber,
  generateDrugCode,
  generateTestCode,
  generateProcedureCode,
  generateSupplierCode,
  generateDepartmentCode,
  generateRoomNumber,
  generateBedNumber,
  generateBarcode,
  generateQRData,
} = require("../../utils/generators");

describe("generateUUID", () => {
  it("returns a valid UUID v4", () => {
    const uuid = generateUUID();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("returns unique values on consecutive calls", () => {
    const u1 = generateUUID();
    const u2 = generateUUID();
    expect(u1).not.toBe(u2);
  });
});

describe("generateRandomString", () => {
  it("generates a string of the specified length (default 10)", () => {
    const str = generateRandomString();
    expect(str).toHaveLength(10);
  });

  it("generates a string with custom length", () => {
    const str = generateRandomString(20);
    expect(str).toHaveLength(20);
  });

  it("uses only numbers when numbers:true and others false", () => {
    const str = generateRandomString(50, {
      numbers: true,
      lowercase: false,
      uppercase: false,
      special: false,
    });
    expect(str).toMatch(/^[0-9]+$/);
    expect(str).toHaveLength(50);
  });

  it("uses only lowercase when lowercase:true and others false", () => {
    const str = generateRandomString(50, {
      numbers: false,
      lowercase: true,
      uppercase: false,
      special: false,
    });
    expect(str).toMatch(/^[a-z]+$/);
  });

  it("uses only uppercase when uppercase:true and others false", () => {
    const str = generateRandomString(50, {
      numbers: false,
      lowercase: false,
      uppercase: true,
      special: false,
    });
    expect(str).toMatch(/^[A-Z]+$/);
  });

  it("includes special characters when special:true", () => {
    const str = generateRandomString(100, {
      numbers: false,
      lowercase: false,
      uppercase: false,
      special: true,
    });
    expect(str).toMatch(/^[!@#$%^&*()_\-+=<>?]+$/);
  });

  it("falls back to lowercase charset when all options are false", () => {
    const str = generateRandomString(10, {
      numbers: false,
      lowercase: false,
      uppercase: false,
      special: false,
    });
    expect(str).toMatch(/^[a-z]+$/);
    expect(str).toHaveLength(10);
  });
});

describe("generateRandomNumber", () => {
  it("returns a number within the given inclusive range", () => {
    for (let i = 0; i < 50; i++) {
      const num = generateRandomNumber(5, 10);
      expect(num).toBeGreaterThanOrEqual(5);
      expect(num).toBeLessThanOrEqual(10);
    }
  });

  it("handles same min and max", () => {
    const num = generateRandomNumber(7, 7);
    expect(num).toBe(7);
  });

  it("handles negative ranges", () => {
    const num = generateRandomNumber(-10, -1);
    expect(num).toBeGreaterThanOrEqual(-10);
    expect(num).toBeLessThanOrEqual(-1);
  });
});

describe("generateOTP", () => {
  it("generates a numeric OTP of default length 6", () => {
    const otp = generateOTP();
    expect(otp).toMatch(/^\d{6}$/);
  });

  it("generates OTP of custom length", () => {
    const otp = generateOTP(8);
    expect(otp).toMatch(/^\d{8}$/);
  });
});

describe("Async number generators", () => {
  const createMockClient = (nextSeq = 1) => ({
    query: jest.fn().mockResolvedValue({
      rows: [{ next_seq: nextSeq }, { seq: nextSeq }],
      rowCount: 1,
    }),
  });

  const createVisitMockClient = (seq = 1) => ({
    query: jest.fn().mockResolvedValue({
      rows: [{ seq }],
      rowCount: 1,
    }),
  });

  describe("generatePatientNumber", () => {
    it("returns PAT-YYYY-XXXXX format", async () => {
      const client = createMockClient(1);
      const result = await generatePatientNumber(client, "facility-id");
      expect(result).toMatch(/^PAT-\d{4}-00001$/);
    });

    it("pads sequence to 5 digits", async () => {
      const client = createMockClient(42);
      const result = await generatePatientNumber(client, "facility-id");
      expect(result).toMatch(/^PAT-\d{4}-00042$/);
    });
  });

  describe("generateVisitNumber", () => {
    it("calls nextval('visit_number_seq')", async () => {
      const client = createVisitMockClient(7);
      const result = await generateVisitNumber(client, "facility-id");
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining("nextval")
      );
      expect(result).toMatch(/^VIS-\d{4}-00007$/);
    });
  });

  describe("generateAppointmentNumber", () => {
    it("returns APT-YYYY-XXXXX format", async () => {
      const client = createMockClient(3);
      const result = await generateAppointmentNumber(client, "facility-id");
      expect(result).toMatch(/^APT-\d{4}-00003$/);
    });
  });

  describe("generateInvoiceNumber", () => {
    it("returns INV-YYYY-XXXXX format", async () => {
      const client = createMockClient(15);
      const result = await generateInvoiceNumber(client, "facility-id");
      expect(result).toMatch(/^INV-\d{4}-00015$/);
    });
  });

  describe("generatePaymentNumber", () => {
    it("returns PAY-YYYY-XXXXX format", async () => {
      const client = createMockClient(9);
      const result = await generatePaymentNumber(client, "facility-id");
      expect(result).toMatch(/^PAY-\d{4}-00009$/);
    });
  });

  describe("generateClaimNumber", () => {
    it("returns CLM-YYYY-XXXXX format", async () => {
      const client = createMockClient(22);
      const result = await generateClaimNumber(client, "facility-id");
      expect(result).toMatch(/^CLM-\d{4}-00022$/);
    });
  });

  describe("generatePrescriptionNumber", () => {
    it("returns PRESC-YYYY-XXXXX format", async () => {
      const client = createMockClient(5);
      const result = await generatePrescriptionNumber(client, "facility-id");
      expect(result).toMatch(/^PRESC-\d{4}-00005$/);
    });
  });

  describe("generateLabOrderNumber", () => {
    it("returns LAB-YYYY-XXXXX format", async () => {
      const client = createMockClient(11);
      const result = await generateLabOrderNumber(client, "facility-id");
      expect(result).toMatch(/^LAB-\d{4}-00011$/);
    });
  });

  describe("generateEmployeeId", () => {
    it("returns EMP-YYYY-XXXXX format", async () => {
      const client = createMockClient(8);
      const result = await generateEmployeeId(client, "facility-id");
      expect(result).toMatch(/^EMP-\d{4}-00008$/);
    });
  });
});

describe("Sync generators", () => {
  describe("generateBatchNumber", () => {
    it("returns BATCH-YYYYMMDD-XXXXX format", () => {
      const result = generateBatchNumber();
      expect(result).toMatch(/^BATCH-\d{8}-\d{5}$/);
    });
  });

  describe("generateTransactionReference", () => {
    it("returns TXN-YYYYMMDD-XXXXXX format", () => {
      const result = generateTransactionReference();
      expect(result).toMatch(/^TXN-\d{8}-[A-Z0-9]{8}$/);
    });
  });

  describe("generateReceiptNumber", () => {
    it("returns RCPT-YYYYMMDD-XXXXX format", () => {
      const result = generateReceiptNumber();
      expect(result).toMatch(/^RCPT-\d{8}-\d{5}$/);
    });
  });

  describe("generateApiKey", () => {
    it("returns HMS_timestamp_hex format", () => {
      const result = generateApiKey();
      expect(result).toMatch(/^HMS_[a-z0-9]+_[a-f0-9]{64}$/);
    });
  });

  describe("generateApiSecret", () => {
    it("returns a 96-character hex string", () => {
      const result = generateApiSecret();
      expect(result).toMatch(/^[a-f0-9]{96}$/);
    });
  });

  describe("generatePasswordResetToken", () => {
    it("returns a 64-character hex string", () => {
      const result = generatePasswordResetToken();
      expect(result).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("generateEmailVerificationToken", () => {
    it("returns a 64-character hex string", () => {
      const result = generateEmailVerificationToken();
      expect(result).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("generateSessionId", () => {
    it("returns a 32-character hex string", () => {
      const result = generateSessionId();
      expect(result).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  describe("generateTrackingNumber", () => {
    it("returns TRK-YYYYMMDD-XXXXXX format", () => {
      const result = generateTrackingNumber();
      expect(result).toMatch(/^TRK-\d{8}-[A-Z0-9]{8}$/);
    });
  });
});

describe("generateDrugCode", () => {
  it("returns DRG-namepart-random format", () => {
    const result = generateDrugCode("Paracetamol");
    expect(result).toMatch(/^DRG-PAR-[A-Z0-9]{3}$/);
  });

  it("takes first 3 chars of each word", () => {
    const result = generateDrugCode("Amoxicillin Clavulanic Acid");
    expect(result).toMatch(/^DRG-AMOCLAACI-[A-Z0-9]{3}$/);
  });
});

describe("generateTestCode", () => {
  it("returns TEST-namepart-random format", () => {
    const result = generateTestCode("Blood Glucose");
    expect(result).toMatch(/^TEST-BLOGLU-[A-Z0-9]{3}$/);
  });
});

describe("generateProcedureCode", () => {
  it("returns PROC-namepart-random format", () => {
    const result = generateProcedureCode("X Ray Chest");
    expect(result).toMatch(/^PROC-XRA.CHE?-[A-Z0-9]{3}$/);
  });
});

describe("generateSupplierCode", () => {
  it("returns SUP-namepart-XXXX format", () => {
    const result = generateSupplierCode("Medical Supplies Ltd");
    // Medical -> MED, Supplies -> SUP, Ltd -> LTD => MEDSUPLTD
    expect(result).toMatch(/^SUP-MEDSUPLTD-\d{4}$/);
  });
});

describe("generateDepartmentCode", () => {
  it("returns DEPT-namepart format (first 2 chars of each word)", () => {
    const result = generateDepartmentCode("Cardiology");
    // First 2 chars => CA
    expect(result).toMatch(/^DEPT-CA$/);
  });

  it("handles multi-word department names", () => {
    const result = generateDepartmentCode("Accident and Emergency");
    // Accident -> AC, and -> AN, Emergency -> EM => ACANEM
    expect(result).toMatch(/^DEPT-ACANEM$/);
  });
});

describe("generateRoomNumber", () => {
  it("returns FLR-DEPT-RM format", () => {
    const result = generateRoomNumber(1, "Cardiology");
    // floor=01, dept=CAR, room=3-digit
    expect(result).toMatch(/^01-CAR-\d{3}$/);
  });

  it("pads floor to 2 digits", () => {
    const result = generateRoomNumber(12, "Ward");
    expect(result).toMatch(/^12-WAR-\d{3}$/);
  });
});

describe("generateBedNumber", () => {
  it("returns BED-roomPart-index format", () => {
    const result = generateBedNumber("01-CAR-005", 1);
    expect(result).toBe("BED-005-01");
  });

  it("pads index to 2 digits", () => {
    const result = generateBedNumber("02-WAR-010", 10);
    expect(result).toBe("BED-010-10");
  });
});

describe("generateBarcode", () => {
  it("returns prefix + timestamp + random + checkDigit", () => {
    const result = generateBarcode();
    expect(result).toMatch(/^HMS\d+$/);
    // Should include the timestamp (13+ digits) + 5 random + 1 check digit
    expect(result.length).toBeGreaterThan(15);
  });

  it("accepts custom prefix", () => {
    const result = generateBarcode("LAB");
    expect(result).toMatch(/^LAB\d+$/);
  });
});

describe("generateQRData", () => {
  it("returns a base64-encoded JSON string", () => {
    const result = generateQRData("patient", "123");
    expect(typeof result).toBe("string");
    // Decode and verify structure
    const decoded = JSON.parse(Buffer.from(result, "base64").toString("utf8"));
    expect(decoded).toHaveProperty("type", "patient");
    expect(decoded).toHaveProperty("id", "123");
    expect(decoded).toHaveProperty("timestamp");
  });

  it("includes extra data", () => {
    const result = generateQRData("visit", "456", { ward: "A" });
    const decoded = JSON.parse(Buffer.from(result, "base64").toString("utf8"));
    expect(decoded.ward).toBe("A");
  });
});
