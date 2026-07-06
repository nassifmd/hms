const db = require("../config/database");
const { generateEmployeeId } = require("../utils/generators");
const auth = require("../config/auth");
const logger = require("../config/logger");

class User {
  constructor(data = {}) {
    this.id = data.id;
    this.employee_id = data.employee_id;
    this.facility_id = data.facility_id;
    this.department_id = data.department_id;
    this.title = data.title;
    this.first_name = data.first_name;
    this.middle_name = data.middle_name;
    this.last_name = data.last_name;
    this.date_of_birth = data.date_of_birth;
    this.gender = data.gender;
    this.phone_number = data.phone_number;
    this.alternate_phone = data.alternate_phone;
    this.email = data.email;
    this.password_hash = data.password_hash;
    this.profile_picture_url = data.profile_picture_url;
    this.national_id_type = data.national_id_type;
    this.national_id_number = data.national_id_number;
    this.professional_license_number = data.professional_license_number;
    this.license_expiry_date = data.license_expiry_date;
    this.specialization = data.specialization;
    this.qualification = data.qualification;
    this.years_of_experience = data.years_of_experience;
    this.joining_date = data.joining_date;
    this.employment_status = data.employment_status;
    this.emergency_contact_name = data.emergency_contact_name;
    this.emergency_contact_phone = data.emergency_contact_phone;
    this.emergency_contact_relationship = data.emergency_contact_relationship;
    this.address = data.address;
    this.city = data.city;
    this.region = data.region;
    this.postal_code = data.postal_code;
    this.last_login = data.last_login;
    this.login_attempts = data.login_attempts || 0;
    this.account_locked = data.account_locked || false;
    this.user_status = data.user_status || "Active";
    this.two_factor_enabled = data.two_factor_enabled || false;
    this.two_factor_secret = data.two_factor_secret;
    this.refresh_token = data.refresh_token;
    this.password_reset_token = data.password_reset_token;
    this.password_reset_expires = data.password_reset_expires;
    this.branch_id = data.branch_id;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.created_by = data.created_by;
    this.updated_by = data.updated_by;
    // Populated by findById via JSON aggregation
    this.roles = data.roles || [];
    this.permissions = data.permissions || [];
    this.facility = data.facility || null;
    this.department = data.department || null;
  }

  static async create(userData, createdBy = null) {
    return db.transaction(async (client) => {
      // Run employee ID generation (DB I/O) and password hashing (CPU) in parallel
      const [employeeId, passwordHash] = await Promise.all([
        generateEmployeeId(client, userData.facility_id),
        auth.hashPassword(userData.password),
      ]);

      const result = await client.query(
        `
        INSERT INTO users (
          employee_id, facility_id, department_id, title,
          first_name, middle_name, last_name, date_of_birth,
          gender, phone_number, alternate_phone, email,
          password_hash, profile_picture_url, national_id_type,
          national_id_number, professional_license_number,
          license_expiry_date, specialization, qualification,
          years_of_experience, joining_date, employment_status,
          emergency_contact_name, emergency_contact_phone,
          emergency_contact_relationship, address, city, region,
          postal_code, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
          $23, $24, $25, $26, $27, $28, $29, $30, $31, NOW(), NOW()
        ) RETURNING *
      `,
        [
          employeeId,
          userData.facility_id,
          userData.department_id,
          userData.title,
          userData.first_name,
          userData.middle_name,
          userData.last_name,
          userData.date_of_birth,
          userData.gender,
          userData.phone_number,
          userData.alternate_phone,
          userData.email,
          passwordHash,
          userData.profile_picture_url,
          userData.national_id_type,
          userData.national_id_number,
          userData.professional_license_number,
          userData.license_expiry_date,
          userData.specialization,
          userData.qualification,
          userData.years_of_experience,
          userData.joining_date,
          userData.employment_status,
          userData.emergency_contact_name,
          userData.emergency_contact_phone,
          userData.emergency_contact_relationship,
          userData.address,
          userData.city,
          userData.region,
          userData.postal_code,
          createdBy,
        ]
      );

      // Assign roles if provided; include facility/department to match
      // the unique constraint on user_roles.
      if (userData.roles && userData.roles.length > 0) {
        for (const roleId of userData.roles) {
          await client.query(
            `
            INSERT INTO user_roles (user_id, role_id, facility_id, department_id, assigned_by, assigned_date)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (user_id, role_id, facility_id, department_id) DO UPDATE
              SET is_active = true, assigned_date = NOW()
          `,
            [
              result.rows[0].id,
              roleId,
              result.rows[0].facility_id,
              result.rows[0].department_id,
              createdBy,
            ]
          );
        }
      }

      logger.audit("USER_CREATED", createdBy, "user", {
        userId: result.rows[0].id,
        email: result.rows[0].email,
      });

      return new User(result.rows[0]);
    });
  }

  static async findById(id) {
    const result = await db.query(
      `
      SELECT
        u.*,
        json_build_object(
          'id', f.id,
          'name', f.facility_name,
          'code', f.facility_code
        ) as facility,
        json_build_object(
          'id', d.id,
          'name', d.department_name,
          'code', d.department_code
        ) as department,
        (
          SELECT json_agg(
            json_build_object(
              'id', r.id,
              'code', r.role_code,
              'name', r.role_name
            )
          )
          FROM user_roles ur
          JOIN roles r ON ur.role_id = r.id
          WHERE ur.user_id = u.id AND ur.is_active = true
        ) as roles,
        (
          SELECT json_agg(
            json_build_object(
              'id', p.id,
              'code', p.permission_code,
              'name', p.permission_name
            )
          )
          FROM user_roles ur
          JOIN role_permissions rp ON ur.role_id = rp.role_id
          JOIN permissions p ON rp.permission_id = p.id
          WHERE ur.user_id = u.id AND ur.is_active = true
        ) as permissions
      FROM users u
      LEFT JOIN facilities f ON u.facility_id = f.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = $1
    `,
      [id]
    );

    return result.rows[0] ? new User(result.rows[0]) : null;
  }

  static async findByEmail(email) {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    return result.rows[0] ? new User(result.rows[0]) : null;
  }

  static async findByEmployeeId(employeeId) {
    const result = await db.query(
      "SELECT * FROM users WHERE employee_id = $1",
      [employeeId]
    );
    return result.rows[0] ? new User(result.rows[0]) : null;
  }

  static async findByUsername(username) {
    const result = await db.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);
    return result.rows[0] ? new User(result.rows[0]) : null;
  }

  static async findAll(filters = {}, pagination = {}) {
    const { facility_id, department_id, role, status, search } = filters;

    const { page = 1, limit = 50 } = pagination;
    const offset = (page - 1) * limit;

    let conditions = ["1=1"];
    let params = [];
    let paramIndex = 1;

    if (facility_id) {
      conditions.push(`u.facility_id = $${paramIndex}`);
      params.push(facility_id);
      paramIndex++;
    }

    if (department_id) {
      conditions.push(`u.department_id = $${paramIndex}`);
      params.push(department_id);
      paramIndex++;
    }

    if (status) {
      conditions.push(`u.user_status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (role) {
      conditions.push(`
        u.id IN (
          SELECT user_id FROM user_roles ur
          JOIN roles r ON ur.role_id = r.id
          WHERE r.role_code = $${paramIndex}
        )
      `);
      params.push(role);
      paramIndex++;
    }

    if (search) {
      conditions.push(`
        (u.first_name ILIKE $${paramIndex} OR
         u.last_name ILIKE $${paramIndex} OR
         u.email ILIKE $${paramIndex} OR
         u.employee_id ILIKE $${paramIndex})
      `);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(" AND ");

    const countResult = await db.query(
      `
      SELECT COUNT(*) as total
      FROM users u
      WHERE ${whereClause}
    `,
      params
    );

    const result = await db.query(
      `
      SELECT
        u.*,
        json_build_object(
          'id', f.id,
          'name', f.facility_name
        ) as facility,
        json_build_object(
          'id', d.id,
          'name', d.department_name
        ) as department,
        (
          SELECT json_agg(json_build_object('id', r.id, 'code', r.role_code, 'name', r.role_name))
          FROM user_roles ur
          JOIN roles r ON ur.role_id = r.id
          WHERE ur.user_id = u.id AND ur.is_active = true
        ) as roles
      FROM users u
      LEFT JOIN facilities f ON u.facility_id = f.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `,
      [...params, limit, offset]
    );

    return {
      users: result.rows.map((row) => new User(row)),
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(countResult.rows[0].total / limit),
    };
  }

  async update(updateData) {
    // allow nulling out values by explicitly passing null; COALESCE would ignore
    // them, so use CASE expressions for those fields where null is meaningful
    const result = await db.query(
      `
      UPDATE users
      SET
        facility_id = COALESCE($1, facility_id),
        department_id = COALESCE($2, department_id),
        employee_id = COALESCE($3, employee_id),
        title = COALESCE($4, title),
        first_name = COALESCE($5, first_name),
        middle_name = COALESCE($6, middle_name),
        last_name = COALESCE($7, last_name),
        date_of_birth = COALESCE($8, date_of_birth),
        gender = COALESCE($9, gender),
        phone_number = COALESCE($10, phone_number),
        alternate_phone = COALESCE($11, alternate_phone),
        email = COALESCE($12, email),
        profile_picture_url = COALESCE($13, profile_picture_url),
        national_id_type = COALESCE($14, national_id_type),
        national_id_number = COALESCE($15, national_id_number),
        professional_license_number = COALESCE($16, professional_license_number),
        license_expiry_date = COALESCE($17, license_expiry_date),
        specialization = COALESCE($18, specialization),
        qualification = COALESCE($19, qualification),
        years_of_experience = COALESCE($20, years_of_experience),
        joining_date = COALESCE($21, joining_date),
        employment_status = COALESCE($22, employment_status),
        emergency_contact_name = COALESCE($23, emergency_contact_name),
        emergency_contact_phone = COALESCE($24, emergency_contact_phone),
        emergency_contact_relationship = COALESCE($25, emergency_contact_relationship),
        address = COALESCE($26, address),
        city = COALESCE($27, city),
        region = COALESCE($28, region),
        postal_code = COALESCE($29, postal_code),
        user_status = COALESCE($30, user_status),
        two_factor_enabled = COALESCE($31, two_factor_enabled),
        updated_at = NOW(),
        updated_by = $32
      WHERE id = $33
      RETURNING *
    `,
      [
        updateData.facility_id,
        updateData.department_id,
        updateData.employee_id,
        updateData.title,
        updateData.first_name,
        updateData.middle_name,
        updateData.last_name,
        updateData.date_of_birth,
        updateData.gender,
        updateData.phone_number,
        updateData.alternate_phone,
        updateData.email,
        updateData.profile_picture_url,
        updateData.national_id_type,
        updateData.national_id_number,
        updateData.professional_license_number,
        updateData.license_expiry_date,
        updateData.specialization,
        updateData.qualification,
        updateData.years_of_experience,
        updateData.joining_date,
        updateData.employment_status,
        updateData.emergency_contact_name,
        updateData.emergency_contact_phone,
        updateData.emergency_contact_relationship,
        updateData.address,
        updateData.city,
        updateData.region,
        updateData.postal_code,
        updateData.user_status,
        updateData.two_factor_enabled,
        updateData.updated_by,
        this.id,
      ]
    );

    Object.assign(this, result.rows[0]);
    return this;
  }

  async updatePassword(newPassword) {
    const passwordHash = await auth.hashPassword(newPassword);

    const result = await db.query(
      `
      UPDATE users
      SET password_hash = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id
    `,
      [passwordHash, this.id]
    );

    return result.rowCount > 0;
  }

  async verifyPassword(password) {
    return auth.verifyPassword(password, this.password_hash);
  }

  async generatePasswordResetToken() {
    // use 5 bytes (10 hex characters) to keep token short
    const token = auth.generateRandomToken(5);
    const expires = new Date(Date.now() + 3600000); // 1 hour

    await db.query(
      `
      UPDATE users
      SET password_reset_token = $1, password_reset_expires = $2
      WHERE id = $3
    `,
      [token, expires, this.id]
    );

    return token;
  }

  async login() {
    await db.query(
      `
      UPDATE users
      SET
        last_login = NOW(),
        login_attempts = 0,
        refresh_token = $1
      WHERE id = $2
    `,
      [auth.generateRandomToken(), this.id]
    );
  }

  async logout() {
    await db.query(
      `
      UPDATE users
      SET refresh_token = NULL
      WHERE id = $1
    `,
      [this.id]
    );
  }

  async incrementLoginAttempts() {
    this.login_attempts += 1;
    // Track failed attempts without locking the account
    await db.query(`UPDATE users SET login_attempts = $1 WHERE id = $2`, [
      this.login_attempts,
      this.id,
    ]);
  }

  async assignRole(roleId, assignedBy) {
    await db.query(
      `
      INSERT INTO user_roles (user_id, role_id, facility_id, department_id, assigned_by, assigned_date)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id, role_id, facility_id, department_id)
      DO UPDATE SET is_active = true, assigned_date = NOW()
    `,
      [this.id, roleId, this.facility_id, this.department_id, assignedBy]
    );
  }

  async removeRole(roleId) {
    await db.query(
      `
      UPDATE user_roles
      SET is_active = false
      WHERE user_id = $1 AND role_id = $2
        AND facility_id = $3 AND department_id = $4
    `,
      [this.id, roleId, this.facility_id, this.department_id]
    );
  }

  async getRoles() {
    const result = await db.query(
      `
      SELECT DISTINCT r.*
      FROM roles r
      JOIN user_roles ur ON r.id = ur.role_id
      WHERE ur.user_id = $1 AND ur.is_active = true
    `,
      [this.id]
    );

    return result.rows;
  }

  async getPermissions() {
    const result = await db.query(
      `
      SELECT DISTINCT p.*
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      JOIN user_roles ur ON rp.role_id = ur.role_id
      WHERE ur.user_id = $1 AND ur.is_active = true
    `,
      [this.id]
    );

    return result.rows;
  }

  async getSchedule(startDate, endDate) {
    const result = await db.query(
      `
      SELECT *
      FROM appointments
      WHERE doctor_id = $1
        AND appointment_date BETWEEN $2 AND $3
        AND status NOT IN ('Cancelled')
      ORDER BY appointment_date, start_time
    `,
      [this.id, startDate, endDate]
    );

    return result.rows;
  }

  toJSON() {
    // Derive a single role code from the roles array (set by findById)
    const role =
      this.roles && this.roles.length > 0 ? this.roles[0].code : undefined;
    const departmentName =
      this.department && this.department.id ? this.department.name : undefined;

    return {
      id: this.id,
      employeeId: this.employee_id,
      facilityId: this.facility_id,
      departmentId: this.department_id,
      branchId: this.branch_id,
      title: this.title,
      firstName: this.first_name,
      middleName: this.middle_name,
      lastName: this.last_name,
      dateOfBirth: this.date_of_birth,
      gender: this.gender,
      phone: this.phone_number,
      alternatePhone: this.alternate_phone,
      email: this.email,
      profilePhoto: this.profile_picture_url,
      nationalIdType: this.national_id_type,
      nationalIdNumber: this.national_id_number,
      professionalLicenseNumber: this.professional_license_number,
      licenseExpiryDate: this.license_expiry_date,
      specialization: this.specialization,
      qualification: this.qualification,
      yearsOfExperience: this.years_of_experience,
      joiningDate: this.joining_date,
      employmentStatus: this.employment_status,
      emergencyContactName: this.emergency_contact_name,
      emergencyContactPhone: this.emergency_contact_phone,
      emergencyContactRelationship: this.emergency_contact_relationship,
      address: this.address,
      city: this.city,
      region: this.region,
      postalCode: this.postal_code,
      lastLogin: this.last_login,
      loginAttempts: this.login_attempts,
      accountLocked: this.account_locked,
      userStatus: this.user_status,
      isActive: this.user_status === "Active",
      twoFactorEnabled: this.two_factor_enabled,
      role,
      department: departmentName,
      facility: this.facility,
      roles: this.roles,
      permissions: this.permissions,
      createdAt: this.created_at,
      updatedAt: this.updated_at,
      createdBy: this.created_by,
      updatedBy: this.updated_by,
    };
  }

  static async getDoctorsByDepartment(departmentId) {
    const result = await db.query(
      `
      SELECT u.*
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE u.department_id = $1
        AND r.role_code IN ('DOCTOR', 'MED_OFFICER', 'DENTIST', 'OPTOMETRIST', 'OPHTHALMOLOGIST', 'DENTAL_SURGEON', 'DENTAL_TECH')
        AND u.user_status = 'Active'
      ORDER BY u.first_name
    `,
      [departmentId]
    );

    return result.rows.map((row) => new User(row));
  }

  static async getAvailableDoctors(
    date,
    startTime,
    endTime,
    departmentId = null
  ) {
    let query = `
      SELECT DISTINCT u.*
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.role_code IN ('DOCTOR', 'MED_OFFICER', 'DENTIST', 'OPTOMETRIST', 'OPHTHALMOLOGIST', 'DENTAL_SURGEON', 'DENTAL_TECH')
        AND u.user_status = 'Active'
    `;

    const params = [];
    let paramIndex = 1;

    if (departmentId) {
      query += ` AND u.department_id = $${paramIndex}`;
      params.push(departmentId);
      paramIndex++;
    }

    query += `
      AND u.id NOT IN (
        SELECT doctor_id
        FROM appointments
        WHERE appointment_date = $${paramIndex}
          AND status NOT IN ('Cancelled', 'Completed')
          AND (
            (start_time <= $${paramIndex + 1} AND end_time > $${
      paramIndex + 1
    }) OR
            (start_time < $${paramIndex + 2} AND end_time >= $${
      paramIndex + 2
    }) OR
            (start_time >= $${paramIndex + 1} AND end_time <= $${
      paramIndex + 2
    })
          )
      )
      ORDER BY u.first_name
    `;

    params.push(date, startTime, endTime);

    const result = await db.query(query, params);
    return result.rows.map((row) => new User(row));
  }
}

module.exports = User;
