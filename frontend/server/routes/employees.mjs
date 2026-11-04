import express from 'express';
import { query, withTransaction } from '../db/index.mjs';
import { requireHrAdmin } from '../middleware/auth.mjs';
import { logAudit } from '../services/audit.mjs';

const router = express.Router();

/**
 * Helper to format DB row to frontend StaffMember shape
 */
export function formatStaffMember(row, includeConfidential = false) {
  const staff = {
    id: row.id,
    name: row.name,
    gender: row.gender,
    dob: row.dob ? row.dob.toISOString().split('T')[0] : '',
    email: row.email,
    phone: row.phone,
    avatarInitials: row.avatar_initials,
    department: row.department,
    designation: row.designation,
    category: row.category,
    employmentType: row.employment_type,
    status: row.status,
    dutyStatus: row.duty_status,
    shift: row.default_shift,
    joiningDate: row.joining_date ? row.joining_date.toISOString().split('T')[0] : '',
    qualification: row.qualification,
    licenseNumber: row.license_number,
    licenseExpiry: row.license_expiry ? row.license_expiry.toISOString().split('T')[0] : '',
    address: row.address,
    resignationDate: row.resignation_date ? row.resignation_date.toISOString().split('T')[0] : null,
    lastWorkingDate: row.last_working_date ? row.last_working_date.toISOString().split('T')[0] : null,
    noticePeriodDays: row.notice_period_days || 30,
    exitReason: row.exit_reason || null,
    exitClearanceStatus: row.exit_clearance_status || 'Not Applicable',
    finalSettlementStatus: row.final_settlement_status || 'Not Applicable',
    isActive: row.is_active !== false,
    emergencyContact: {
      name: row.emergency_contact_name || '',
      relation: row.emergency_contact_relation || '',
      phone: row.emergency_contact_phone || '',
    },
    leaveBalance: {
      casual: parseFloat(row.casual || 12),
      casualUsed: parseFloat(row.casual_used || 0),
      sick: parseFloat(row.sick || 10),
      sickUsed: parseFloat(row.sick_used || 0),
      earned: parseFloat(row.earned || 15),
      earnedUsed: parseFloat(row.earned_used || 0),
    },
  };

  if (includeConfidential) {
    staff.salary = {
      basic: parseFloat(row.basic || 0),
      hra: parseFloat(row.hra || 0),
      allowances: parseFloat(row.allowances || 0),
      pf: parseFloat(row.pf || 0),
      tax: parseFloat(row.tax || 0),
      netPay: parseFloat(row.net_pay || 0),
    };
    staff.bankDetails = {
      accountNo: row.account_number || '',
      ifsc: row.ifsc_code || '',
      bankName: row.bank_name || '',
      pan: row.pan_number || '',
    };
  } else {
    // Masked identifiers for safe staff views
    if (row.account_number) {
      staff.bankDetails = {
        accountNo: `••••••••${row.account_number.slice(-4)}`,
        bankName: row.bank_name || '',
        ifsc: row.ifsc_code || '',
        pan: row.pan_number ? `•••••${row.pan_number.slice(-4)}` : '',
      };
    }
  }

  return staff;
}

// ── GET /api/hr/overview/kpis ────────────────────────────────────────────────
router.get('/overview/kpis', async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId || 1;

    const [staffStats, leaveStats, credStats, payrollStats] = await Promise.all([
      query(`
        SELECT 
          COUNT(*) FILTER (WHERE is_active = TRUE) as total_staff,
          COUNT(*) FILTER (WHERE is_active = TRUE AND duty_status = 'On Duty') as on_duty,
          COUNT(*) FILTER (WHERE is_active = TRUE AND category = 'Doctor') as doctors,
          COUNT(*) FILTER (WHERE is_active = TRUE AND category = 'Nursing') as nurses
        FROM employees
        WHERE hospital_id = $1;
      `, [hospitalId]),

      query(`
        SELECT COUNT(*) as pending_leaves
        FROM leave_requests
        WHERE hospital_id = $1 AND status = 'Pending';
      `, [hospitalId]),

      query(`
        SELECT COUNT(*) as expiring_licenses
        FROM employee_credentials c
        JOIN employees e ON e.id = c.employee_id
        WHERE e.hospital_id = $1 
          AND c.valid_until <= CURRENT_DATE + INTERVAL '30 days';
      `, [hospitalId]),

      query(`
        SELECT COALESCE(SUM(s.net_pay), 0) as monthly_payroll
        FROM salary_structures s
        JOIN employees e ON e.id = s.employee_id
        WHERE e.hospital_id = $1 AND e.is_active = TRUE AND s.is_active = TRUE;
      `, [hospitalId]),
    ]);

    const stats = staffStats.rows[0];
    const leaves = leaveStats.rows[0];
    const creds = credStats.rows[0];
    const payroll = payrollStats.rows[0];

    return res.json({
      totalWorkforce: parseInt(stats.total_staff || 0, 10),
      onDutyNow: parseInt(stats.on_duty || 0, 10),
      doctorsOnDuty: parseInt(stats.doctors || 0, 10),
      nursesOnDuty: parseInt(stats.nurses || 0, 10),
      pendingLeaves: parseInt(leaves.pending_leaves || 0, 10),
      expiringLicenses: parseInt(creds.expiring_licenses || 0, 10),
      monthlyPayrollEstimate: parseFloat(payroll.monthly_payroll || 0),
    });
  } catch (err) {
    console.error('Error fetching HRMS KPIs:', err);
    return res.status(500).json({ error: 'Failed to compute workforce KPIs' });
  }
});

// ── GET /api/hr/employees ───────────────────────────────────────────────────
router.get('/employees', async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId || 1;
    const isSafeOnly = req.query.safeOnly === 'true' || !req.user.isAdmin;
    const includeConfidential = !isSafeOnly && req.user.isAdmin;

    const activeOnly = req.query.activeOnly === 'true';

    let sql = `
      SELECT 
        e.*,
        b.account_number, b.ifsc_code, b.bank_name, b.pan_number,
        s.basic, s.hra, s.allowances, s.pf, s.tax, s.net_pay,
        lb.casual, lb.casual_used, lb.sick, lb.sick_used, lb.earned, lb.earned_used
      FROM employees e
      LEFT JOIN employee_bank_details b ON b.employee_id = e.id
      LEFT JOIN salary_structures s ON s.employee_id = e.id AND s.is_active = TRUE
      LEFT JOIN leave_balances lb ON lb.employee_id = e.id AND lb.year = 2026
      WHERE e.hospital_id = $1
    `;

    if (activeOnly) {
      sql += ` AND e.is_active = TRUE AND e.status NOT IN ('Inactive', 'Resigned', 'Terminated')`;
    }

    sql += ` ORDER BY e.created_at DESC;`;

    const result = await query(sql, [hospitalId]);
    const staffList = result.rows.map((r) => formatStaffMember(r, includeConfidential));

    return res.json({
      total: staffList.length,
      employees: staffList,
    });
  } catch (err) {
    console.error('Error fetching employees:', err);
    return res.status(500).json({ error: 'Failed to retrieve employee directory' });
  }
});

// ── GET /api/hr/employees/:id ───────────────────────────────────────────────
router.get('/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const hospitalId = req.user.hospitalId || 1;
    const isOwnProfile = req.user.employeeId === id;
    const includeConfidential = req.user.isAdmin || isOwnProfile;

    const sql = `
      SELECT 
        e.*,
        b.account_number, b.ifsc_code, b.bank_name, b.pan_number,
        s.basic, s.hra, s.allowances, s.pf, s.tax, s.net_pay,
        lb.casual, lb.casual_used, lb.sick, lb.sick_used, lb.earned, lb.earned_used
      FROM employees e
      LEFT JOIN employee_bank_details b ON b.employee_id = e.id
      LEFT JOIN salary_structures s ON s.employee_id = e.id AND s.is_active = TRUE
      LEFT JOIN leave_balances lb ON lb.employee_id = e.id AND lb.year = 2026
      WHERE e.id = $1 AND e.hospital_id = $2;
    `;

    const result = await query(sql, [id, hospitalId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employee = formatStaffMember(result.rows[0], includeConfidential);
    return res.json({ employee });
  } catch (err) {
    console.error('Error fetching employee details:', err);
    return res.status(500).json({ error: 'Failed to retrieve employee profile' });
  }
});

// ── POST /api/hr/employees (Onboarding Transaction) ─────────────────────────
router.post('/employees', requireHrAdmin, async (req, res) => {
  try {
    const payload = req.body;
    const hospitalId = req.user.hospitalId || 1;

    // Validate required fields
    if (!payload.name || !payload.department || !payload.designation || !payload.category) {
      return res.status(400).json({ error: 'Missing required onboarding parameters (name, department, designation, category)' });
    }

    const result = await withTransaction(async (client) => {
      // 1. Generate next sequential Employee ID: EMP-101, EMP-102...
      const countRes = await client.query('SELECT COUNT(*) FROM employees WHERE hospital_id = $1', [hospitalId]);
      const nextNum = parseInt(countRes.rows[0].count, 10) + 101;
      const empId = `EMP-${nextNum}`;

      // Avatar initials
      const parts = payload.name.trim().split(/\s+/);
      const avatarInitials = (parts.length > 1
        ? `${parts[0][0]}${parts[parts.length - 1][0]}`
        : parts[0].slice(0, 2)
      ).toUpperCase();

      // 2. Insert into employees master
      const empSql = `
        INSERT INTO employees (
          id, hospital_id, name, gender, dob, blood_group, email, phone, avatar_initials,
          department, designation, category, employment_type, status, duty_status,
          default_shift, joining_date, qualification, license_number, license_expiry,
          address, emergency_contact_name, emergency_contact_relation, emergency_contact_phone,
          is_active
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20,
          $21, $22, $23, $24,
          TRUE
        ) RETURNING *;
      `;

      const empParams = [
        empId,
        hospitalId,
        payload.name.trim(),
        payload.gender || 'Male',
        payload.dob || '1990-01-01',
        payload.bloodGroup || 'O+',
        payload.email || `${empId.toLowerCase()}@imperialhospitals.org`,
        payload.phone || '+91 98480 00000',
        avatarInitials,
        payload.department,
        payload.designation,
        payload.category,
        payload.employmentType || 'Full-Time',
        payload.status || 'Active',
        payload.dutyStatus || 'On Duty',
        payload.shift || 'Morning (07:00 - 15:00)',
        payload.joiningDate || new Date().toISOString().split('T')[0],
        payload.qualification || 'MBBS / Allied Health Degree',
        payload.licenseNumber || 'MCI-PENDING',
        payload.licenseExpiry || null,
        payload.address || 'Hyderabad, Telangana',
        payload.emergencyContact?.name || 'Primary Contact',
        payload.emergencyContact?.relation || 'Relative',
        payload.emergencyContact?.phone || '+91 98480 00000',
      ];

      const empRes = await client.query(empSql, empParams);
      const newEmpRow = empRes.rows[0];

      // 3. Insert Confidential Bank Details
      const bank = payload.bankDetails || {};
      const bankSql = `
        INSERT INTO employee_bank_details (
          employee_id, account_number, ifsc_code, bank_name, pan_number
        ) VALUES ($1, $2, $3, $4, $5);
      `;
      await client.query(bankSql, [
        empId,
        bank.accountNo || 'XXXX-XXXX-1001',
        bank.ifsc || 'HDFC0001234',
        bank.bankName || 'HDFC Bank Healthcare Branch',
        bank.pan || 'ABCDE1234F',
      ]);

      // 4. Insert Salary Structure
      const salary = payload.salary || {};
      const basic = parseFloat(salary.basic ?? 0);
      const hra = parseFloat(salary.hra ?? basic * 0.4);
      const allowances = parseFloat(salary.allowances ?? basic * 0.15);
      const pf = parseFloat(salary.pf ?? Math.round(basic * 0.12));
      const gross = basic + hra + allowances;
      const tax = parseFloat(salary.tax ?? Math.round(gross * 0.1));
      const totalDeductions = pf + tax;
      const netPay = gross - totalDeductions;

      const salarySql = `
        INSERT INTO salary_structures (
          employee_id, basic, hra, allowances, pf, tax, gross, total_deductions, net_pay, effective_from, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE, TRUE);
      `;
      await client.query(salarySql, [
        empId, basic, hra, allowances, pf, tax, gross, totalDeductions, netPay
      ]);

      // 5. Initialize Leave Balances dynamically from form
      const leaveBalances = payload.leaveBalance || {};
      const casualQuota = parseFloat(leaveBalances.casual ?? 12);
      const sickQuota = parseFloat(leaveBalances.sick ?? 10);
      const earnedQuota = parseFloat(leaveBalances.earned ?? 15);

      const leaveSql = `
        INSERT INTO leave_balances (
          employee_id, year, casual, casual_used, sick, sick_used, earned, earned_used
        ) VALUES ($1, 2026, $2, 0, $3, 0, $4, 0);
      `;
      await client.query(leaveSql, [empId, casualQuota, sickQuota, earnedQuota]);

      // 6. If Medical License provided, create Credential Tracking Record
      if (payload.licenseNumber && payload.licenseNumber !== 'MCI-PENDING') {
        const credId = `CRD-${nextNum}`;
        const credSql = `
          INSERT INTO employee_credentials (
            id, employee_id, staff_name, department, title, credential_type, authority,
            license_no, valid_from, valid_until, verified_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_DATE, $9, 'Verified');
        `;
        const credExpiry = payload.licenseExpiry || new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().split('T')[0];
        await client.query(credSql, [
          credId,
          empId,
          payload.name.trim(),
          payload.department,
          payload.designation,
          payload.category === 'Doctor' ? 'State Medical Council / NMC License' : 'Nursing / Clinical License',
          payload.category === 'Doctor' ? 'National Medical Commission' : 'State Nursing Council',
          payload.licenseNumber.trim(),
          credExpiry,
        ]);
      }

      // 7. Schedule Shift in Roster for Today
      const today = new Date().toISOString().split('T')[0];
      const rosterSql = `
        INSERT INTO shift_assignments (
          hospital_id, employee_id, shift_date, shift_name, department, assigned_by
        ) VALUES ($1, $2, $3, $4, $5, 'HR Administrator')
        ON CONFLICT (employee_id, shift_date) DO UPDATE SET shift_name = EXCLUDED.shift_name;
      `;
      await client.query(rosterSql, [
        hospitalId,
        empId,
        today,
        payload.shift || 'Morning (07:00 - 15:00)',
        payload.department,
      ]);

      // 8. If employee was marked "On Duty" at onboarding, record live clock-in
      if (payload.dutyStatus === 'On Duty') {
        const clockTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const attId = `ATT-${empId}-${today}`;
        const attSql = `
          INSERT INTO attendance (
            id, hospital_id, employee_id, employee_name, department, attendance_date,
            assigned_shift, clock_in, attendance_status, work_hours, attendance_source
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Present', 0, 'Staff Portal')
          ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
            clock_in = EXCLUDED.clock_in,
            attendance_status = 'Present';
        `;
        await client.query(attSql, [
          attId,
          hospitalId,
          empId,
          payload.name.trim(),
          payload.department,
          today,
          payload.shift || 'Morning (07:00 - 15:00)',
          clockTime,
        ]);
      }

      // 9. Write Immutable Audit Log
      await logAudit({
        client,
        hospitalId,
        userId: req.user.userId,
        actorUsername: req.user.username,
        employeeId: empId,
        action: 'EMPLOYEE_ONBOARDED',
        entityType: 'EMPLOYEE',
        entityId: empId,
        newValue: {
          id: empId,
          name: payload.name,
          department: payload.department,
          designation: payload.designation,
          category: payload.category,
        },
      });

      return {
        ...formatStaffMember(newEmpRow, true),
        salary: { basic, hra, allowances, pf, tax, netPay },
        bankDetails: bank,
      };
    });

    return res.status(201).json({
      message: 'Employee successfully registered and scheduled',
      employee: result,
    });
  } catch (err) {
    console.error('Error onboarding employee:', err);
    return res.status(500).json({ error: err.message || 'Failed to onboard employee' });
  }
});

// ── PUT /api/hr/employees/:id (Update Profile with History & Lock) ───────────
router.put('/employees/:id', requireHrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body;
    const hospitalId = req.user.hospitalId || 1;

    const result = await withTransaction(async (client) => {
      // 1. Fetch existing employee with lock
      const existingRes = await client.query('SELECT * FROM employees WHERE id = $1 AND hospital_id = $2 FOR UPDATE', [id, hospitalId]);
      if (existingRes.rows.length === 0) {
        throw new Error('Employee not found');
      }
      const existing = existingRes.rows[0];

      // Optimistic Locking Check if version provided
      if (payload.version && existing.version !== payload.version) {
        throw new Error('Concurrency Conflict: This record was modified by another administrator. Please reload and try again.');
      }

      // 2. Track Department / Designation Promotion & Transfer History
      const deptChanged = payload.department && payload.department !== existing.department;
      const desigChanged = payload.designation && payload.designation !== existing.designation;
      const statusChanged = payload.status && payload.status !== existing.status;

      if (deptChanged || desigChanged || statusChanged) {
        const histSql = `
          INSERT INTO employee_employment_history (
            employee_id, old_department, new_department, old_designation, new_designation,
            old_status, new_status, effective_from, reason, changed_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, $8, $9);
        `;
        await client.query(histSql, [
          id,
          existing.department,
          payload.department || existing.department,
          existing.designation,
          payload.designation || existing.designation,
          existing.status,
          payload.status || existing.status,
          payload.changeReason || 'Administrative update / Internal transfer',
          req.user.username,
        ]);
      }

      // 3. Update Employee Master
      const updateEmpSql = `
        UPDATE employees SET
          name = COALESCE($1, name),
          department = COALESCE($2, department),
          designation = COALESCE($3, designation),
          category = COALESCE($4, category),
          employment_type = COALESCE($5, employment_type),
          status = COALESCE($6, status),
          duty_status = COALESCE($7, duty_status),
          default_shift = COALESCE($8, default_shift),
          qualification = COALESCE($9, qualification),
          license_number = COALESCE($10, license_number),
          license_expiry = COALESCE($11, license_expiry),
          phone = COALESCE($12, phone),
          email = COALESCE($13, email),
          address = COALESCE($14, address),
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $15 AND hospital_id = $16
        RETURNING *;
      `;

      const updateRes = await client.query(updateEmpSql, [
        payload.name,
        payload.department,
        payload.designation,
        payload.category,
        payload.employmentType,
        payload.status,
        payload.dutyStatus,
        payload.shift,
        payload.qualification,
        payload.licenseNumber,
        payload.licenseExpiry,
        payload.phone,
        payload.email,
        payload.address,
        id,
        hospitalId,
      ]);

      // 4. Update Bank Details if provided
      if (payload.bankDetails) {
        await client.query(`
          INSERT INTO employee_bank_details (employee_id, account_number, ifsc_code, bank_name, pan_number)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (employee_id) DO UPDATE SET
            account_number = EXCLUDED.account_number,
            ifsc_code = EXCLUDED.ifsc_code,
            bank_name = EXCLUDED.bank_name,
            pan_number = EXCLUDED.pan_number,
            updated_at = CURRENT_TIMESTAMP;
        `, [
          id,
          payload.bankDetails.accountNo || 'XXXX-XXXX-1001',
          payload.bankDetails.ifsc || 'HDFC0001234',
          payload.bankDetails.bankName || 'HDFC Bank',
          payload.bankDetails.pan || 'ABCDE1234F',
        ]);
      }

      // 5. Update Salary Structure if provided
      if (payload.salary) {
        const s = payload.salary;
        const basic = parseFloat(s.basic || 150000);
        const hra = parseFloat(s.hra || 40000);
        const allowances = parseFloat(s.allowances || 20000);
        const pf = parseFloat(s.pf || basic * 0.12);
        const tax = parseFloat(s.tax || (basic + hra + allowances) * 0.1);
        const gross = basic + hra + allowances;
        const netPay = gross - (pf + tax);

        await client.query(`
          UPDATE salary_structures SET is_active = FALSE WHERE employee_id = $1;
        `, [id]);

        await client.query(`
          INSERT INTO salary_structures (
            employee_id, basic, hra, allowances, pf, tax, gross, total_deductions, net_pay, effective_from, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE, TRUE);
        `, [id, basic, hra, allowances, pf, tax, gross, pf + tax, netPay]);
      }

      // 6. Log Audit
      await logAudit({
        client,
        hospitalId,
        userId: req.user.userId,
        actorUsername: req.user.username,
        employeeId: id,
        action: 'EMPLOYEE_UPDATED',
        entityType: 'EMPLOYEE',
        entityId: id,
        oldValue: existing,
        newValue: updateRes.rows[0],
      });

      return formatStaffMember(updateRes.rows[0], true);
    });

    return res.json({
      message: 'Employee profile updated successfully',
      employee: result,
    });
  } catch (err) {
    console.error('Error updating employee:', err);
    return res.status(500).json({ error: err.message || 'Failed to update employee' });
  }
});

// ── DELETE /api/hr/employees/:id (Soft Deactivation) ────────────────────────
router.delete('/employees/:id', requireHrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const hospitalId = req.user.hospitalId || 1;

    const result = await withTransaction(async (client) => {
      const getRes = await client.query('SELECT * FROM employees WHERE id = $1 AND hospital_id = $2', [id, hospitalId]);
      if (getRes.rows.length === 0) {
        throw new Error('Employee not found');
      }

      // Soft-deactivate employee
      await client.query(`
        UPDATE employees SET
          is_active = FALSE,
          status = 'Inactive',
          duty_status = 'Off Duty',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND hospital_id = $2;
      `, [id, hospitalId]);

      // Record employment history event
      await client.query(`
        INSERT INTO employee_employment_history (
          employee_id, old_department, new_department, old_designation, new_designation,
          old_status, new_status, effective_from, reason, changed_by
        ) VALUES ($1, $2, $2, $3, $3, $4, 'Inactive', CURRENT_DATE, 'Employee Soft Deactivation / Offboarding', $5);
      `, [id, getRes.rows[0].department, getRes.rows[0].designation, getRes.rows[0].status, req.user.username]);

      await logAudit({
        client,
        hospitalId,
        userId: req.user.userId,
        actorUsername: req.user.username,
        employeeId: id,
        action: 'EMPLOYEE_DEACTIVATED',
        entityType: 'EMPLOYEE',
        entityId: id,
        oldValue: getRes.rows[0],
      });

      return true;
    });

    return res.json({ message: `Employee ${id} deactivated successfully (historical records retained).` });
  } catch (err) {
    console.error('Error deactivating employee:', err);
    return res.status(500).json({ error: 'Failed to deactivate employee' });
  }
});

// ── POST /api/hr/employees/:id/promote ──────────────────────────────────────
router.post('/employees/:id/promote', requireHrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { newDesignation, effectiveDate, remarks } = req.body;
    const hospitalId = req.user.hospitalId || 1;

    if (!newDesignation) {
      return res.status(400).json({ error: 'newDesignation is required for promotion' });
    }

    const result = await withTransaction(async (client) => {
      const empRes = await client.query('SELECT * FROM employees WHERE id = $1 AND hospital_id = $2 FOR UPDATE', [id, hospitalId]);
      if (empRes.rows.length === 0) throw new Error('Employee not found');
      const emp = empRes.rows[0];
      const oldDesignation = emp.designation;

      // 1. Update designation in employees table
      await client.query(`
        UPDATE employees SET designation = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;
      `, [newDesignation, id]);

      // 2. Insert into employee_promotions
      const promRes = await client.query(`
        INSERT INTO employee_promotions (
          employee_id, employee_name, old_designation, new_designation, effective_date, approved_by, remarks
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
      `, [
        id, emp.name, oldDesignation, newDesignation,
        effectiveDate || new Date().toISOString().split('T')[0],
        req.user.username, remarks || `Promoted from ${oldDesignation} to ${newDesignation}`
      ]);

      await logAudit({
        client,
        hospitalId,
        userId: req.user.userId,
        actorUsername: req.user.username,
        employeeId: id,
        employeeName: emp.name,
        action: 'EMPLOYEE_PROMOTION',
        entityType: 'EMPLOYEE',
        entityId: id,
        reason: remarks,
        oldValue: { designation: oldDesignation },
        newValue: { designation: newDesignation, effectiveDate },
      });

      return promRes.rows[0];
    });

    return res.json({ message: 'Employee promotion recorded successfully', promotion: result });
  } catch (err) {
    console.error('Error recording promotion:', err);
    return res.status(400).json({ error: err.message || 'Failed to record promotion' });
  }
});

// ── POST /api/hr/employees/:id/transfer ─────────────────────────────────────
router.post('/employees/:id/transfer', requireHrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { newDepartment, effectiveDate, remarks } = req.body;
    const hospitalId = req.user.hospitalId || 1;

    if (!newDepartment) {
      return res.status(400).json({ error: 'newDepartment is required for transfer' });
    }

    const result = await withTransaction(async (client) => {
      const empRes = await client.query('SELECT * FROM employees WHERE id = $1 AND hospital_id = $2 FOR UPDATE', [id, hospitalId]);
      if (empRes.rows.length === 0) throw new Error('Employee not found');
      const emp = empRes.rows[0];
      const oldDepartment = emp.department;

      // 1. Update department in employees table
      await client.query(`
        UPDATE employees SET department = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;
      `, [newDepartment, id]);

      // 2. Insert into employee_transfers
      const transRes = await client.query(`
        INSERT INTO employee_transfers (
          employee_id, employee_name, old_department, new_department, effective_date, approved_by, remarks
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
      `, [
        id, emp.name, oldDepartment, newDepartment,
        effectiveDate || new Date().toISOString().split('T')[0],
        req.user.username, remarks || `Transferred from ${oldDepartment} to ${newDepartment}`
      ]);

      await logAudit({
        client,
        hospitalId,
        userId: req.user.userId,
        actorUsername: req.user.username,
        employeeId: id,
        employeeName: emp.name,
        action: 'EMPLOYEE_TRANSFER',
        entityType: 'EMPLOYEE',
        entityId: id,
        reason: remarks,
        oldValue: { department: oldDepartment },
        newValue: { department: newDepartment, effectiveDate },
      });

      return transRes.rows[0];
    });

    return res.json({ message: 'Employee department transfer recorded successfully', transfer: result });
  } catch (err) {
    console.error('Error recording transfer:', err);
    return res.status(400).json({ error: err.message || 'Failed to record transfer' });
  }
});

// ── POST /api/hr/employees/:id/salary-revision ──────────────────────────────
router.post('/employees/:id/salary-revision', requireHrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { effectiveDate, reason } = req.body;
    const rawSalary = req.body.newBaseSalary !== undefined 
      ? req.body.newBaseSalary 
      : (req.body.newBasic !== undefined ? req.body.newBasic : req.body.basic);
    const hospitalId = req.user.hospitalId || 1;

    if (!rawSalary || isNaN(rawSalary)) {
      return res.status(400).json({ error: 'Valid newBaseSalary (or newBasic) is required' });
    }

    const result = await withTransaction(async (client) => {
      const empRes = await client.query('SELECT * FROM employees WHERE id = $1 AND hospital_id = $2', [id, hospitalId]);
      if (empRes.rows.length === 0) throw new Error('Employee not found');
      const emp = empRes.rows[0];

      const currentSalRes = await client.query(
        'SELECT * FROM salary_structures WHERE employee_id = $1 AND is_active = TRUE ORDER BY created_at DESC LIMIT 1',
        [id]
      );
      const oldBasic = currentSalRes.rows.length > 0 ? parseFloat(currentSalRes.rows[0].basic) : 0;
      const oldGross = currentSalRes.rows.length > 0 ? parseFloat(currentSalRes.rows[0].gross) : 0;

      const base = parseFloat(rawSalary);
      const basic = parseFloat((base * 0.60).toFixed(2));
      const hra = parseFloat((base * 0.40).toFixed(2));
      const allowances = parseFloat((base * 0.15).toFixed(2));
      const gross = parseFloat((basic + hra + allowances).toFixed(2));
      const pf = parseFloat((basic * 0.12).toFixed(2));
      const tax = parseFloat((gross * 0.10).toFixed(2));
      const totalDeductions = parseFloat((pf + tax).toFixed(2));
      const netPay = parseFloat((gross - totalDeductions).toFixed(2));

      // 1. Deactivate old salary structures
      await client.query('UPDATE salary_structures SET is_active = FALSE WHERE employee_id = $1;', [id]);

      // 2. Insert new active salary structure
      await client.query(`
        INSERT INTO salary_structures (
          employee_id, basic, hra, allowances, pf, tax, gross, total_deductions, net_pay, effective_from, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE, TRUE);
      `, [id, basic, hra, allowances, pf, tax, gross, totalDeductions, netPay]);

      // 3. Insert into salary_revisions history table
      const revRes = await client.query(`
        INSERT INTO salary_revisions (
          employee_id, employee_name, old_salary, new_salary, effective_date, reason, approved_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
      `, [
        id, emp.name, oldGross || oldBasic, gross,
        effectiveDate || new Date().toISOString().split('T')[0],
        reason || 'Periodic Performance & Compensation Review', req.user.username
      ]);

      await logAudit({
        client,
        hospitalId,
        userId: req.user.userId,
        actorUsername: req.user.username,
        employeeId: id,
        employeeName: emp.name,
        action: 'SALARY_REVISION',
        entityType: 'SALARY',
        entityId: id,
        reason,
        oldValue: { gross: oldGross, basic: oldBasic },
        newValue: { baseMonthly: base, gross, basic, hra, allowances, pf, tax, netPay, effectiveDate },
      });

      return revRes.rows[0];
    });

    return res.json({ message: 'Salary revision recorded successfully', revision: result });
  } catch (err) {
    console.error('Error recording salary revision:', err);
    return res.status(400).json({ error: err.message || 'Failed to record salary revision' });
  }
});

// ── POST /api/hr/employees/:id/exit ─────────────────────────────────────────
router.post('/employees/:id/exit', requireHrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      exitType, // "Resignation" | "Termination"
      resignationDate,
      noticePeriodDays = 30,
      lastWorkingDate,
      exitReason,
      exitClearanceStatus = 'Pending',
      finalSettlementStatus = 'Pending',
    } = req.body;
    const hospitalId = req.user.hospitalId || 1;

    if (!exitType || !resignationDate || !lastWorkingDate) {
      return res.status(400).json({ error: 'exitType, resignationDate, and lastWorkingDate are required' });
    }

    const result = await withTransaction(async (client) => {
      const empRes = await client.query('SELECT * FROM employees WHERE id = $1 AND hospital_id = $2 FOR UPDATE', [id, hospitalId]);
      if (empRes.rows.length === 0) throw new Error('Employee not found');
      const emp = empRes.rows[0];

      const today = new Date().toISOString().split('T')[0];
      const isPastLastDay = lastWorkingDate <= today;
      const targetStatus = isPastLastDay 
        ? (exitType === 'Termination' ? 'Terminated' : 'Resigned') 
        : 'Notice Period';
      const isActive = !isPastLastDay;

      // 1. Update employees table (maintain ID and past data, mark status)
      await client.query(`
        UPDATE employees SET
          status = $1,
          is_active = $2,
          duty_status = 'Off Duty',
          resignation_date = $3,
          notice_period_days = $4,
          last_working_date = $5,
          exit_reason = $6,
          exit_clearance_status = $7,
          final_settlement_status = $8,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $9 AND hospital_id = $10;
      `, [
        targetStatus, isActive, resignationDate, noticePeriodDays,
        lastWorkingDate, exitReason || `${exitType} initiated`,
        exitClearanceStatus, finalSettlementStatus, id, hospitalId
      ]);

      // 2. Insert into employee_exits table
      const exitRes = await client.query(`
        INSERT INTO employee_exits (
          employee_id, employee_name, exit_type, resignation_date, notice_period_days,
          last_working_date, exit_reason, exit_clearance_status, final_settlement_status, approved_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *;
      `, [
        id, emp.name, exitType, resignationDate, noticePeriodDays,
        lastWorkingDate, exitReason || '', exitClearanceStatus, finalSettlementStatus, req.user.username
      ]);

      await logAudit({
        client,
        hospitalId,
        userId: req.user.userId,
        actorUsername: req.user.username,
        employeeId: id,
        employeeName: emp.name,
        action: 'EMPLOYEE_EXIT_INITIATED',
        entityType: 'EMPLOYEE',
        entityId: id,
        reason: exitReason,
        oldValue: { status: emp.status, isActive: emp.is_active },
        newValue: { exitType, resignationDate, lastWorkingDate, status: targetStatus, isActive },
      });

      return exitRes.rows[0];
    });

    return res.json({ message: 'Employee exit details recorded successfully', exit: result });
  } catch (err) {
    console.error('Error recording employee exit:', err);
    return res.status(400).json({ error: err.message || 'Failed to record employee exit' });
  }
});

// ── GET /api/hr/employees/:id/lifecycle ─────────────────────────────────────
router.get('/employees/:id/lifecycle', async (req, res) => {
  try {
    const { id } = req.params;

    const [promotionsRes, transfersRes, salaryRevisionsRes, exitsRes] = await Promise.all([
      query('SELECT * FROM employee_promotions WHERE employee_id = $1 ORDER BY effective_date DESC;', [id]),
      query('SELECT * FROM employee_transfers WHERE employee_id = $1 ORDER BY effective_date DESC;', [id]),
      query('SELECT * FROM salary_revisions WHERE employee_id = $1 ORDER BY effective_date DESC;', [id]),
      query('SELECT * FROM employee_exits WHERE employee_id = $1 ORDER BY created_at DESC;', [id]),
    ]);

    return res.json({
      promotions: promotionsRes.rows,
      transfers: transfersRes.rows,
      salaryRevisions: salaryRevisionsRes.rows,
      exits: exitsRes.rows,
    });
  } catch (err) {
    console.error('Error fetching employee lifecycle:', err);
    return res.status(500).json({ error: 'Failed to fetch employee lifecycle history' });
  }
});

export default router;

