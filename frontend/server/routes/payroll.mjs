import express from 'express';
import { query, withTransaction } from '../db/index.mjs';
import { requireHrAdmin } from '../middleware/auth.mjs';
import { logAudit } from '../services/audit.mjs';

const router = express.Router();

const MONTH_NUMBERS = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
};

// Tested decimal-safe rounding to 2 decimal places using MDN exponential notation
export function round2(num) {
  if (num === null || num === undefined || isNaN(Number(num))) return 0;
  return Number(Math.round(Number(Number(num) + 'e+2')) + 'e-2');
}


// ── GET /api/hr/payroll ──────────────────────────────────────────────────────
router.get('/payroll', async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId || 1;
    const month = req.query.month || 'September';
    const year = parseInt(req.query.year || '2026', 10);
    const employeeId = !req.user.isAdmin ? req.user.employeeId : null;

    const runRes = await query(`
      SELECT * FROM payroll_runs
      WHERE hospital_id = $1 AND month = $2 AND year = $3;
    `, [hospitalId, month, year]);

    let itemsSql = `
      SELECT 
        pi.id,
        pi.payroll_run_id as "payrollRunId",
        pi.employee_id as "staffId",
        pi.staff_name as "staffName",
        pi.department,
        pi.designation,
        pi.basic,
        pi.hra,
        pi.allowances,
        pi.gross,
        pi.pf,
        COALESCE(pi.professional_tax, 0) as "professionalTax",
        pi.tax,
        pi.other_deductions as "otherDeductions",
        pi.total_deductions as "totalDeductions",
        pi.net_pay as "netPay",
        COALESCE(pi.paid_leave_days, 0) as "paidLeaveDays",
        COALESCE(pi.unpaid_leave_days, 0) as "unpaidLeaveDays",
        COALESCE(pi.absent_days, 0) as "absentDays",
        COALESCE(pi.overtime_hours, 0) as "overtimeHours",
        COALESCE(pi.overtime_amount, 0) as "overtimeAmount",
        COALESCE(pi.leave_deductions, 0) as "leaveDeductions",
        pi.attendance_summary as "attendanceSummary",
        pi.revision_number as "revisionNumber",
        pi.revision_reason as "revisionReason",
        pi.reviewed_by as "reviewedBy",
        pi.approved_by as "approvedBy",
        pi.bank_account_masked as "bankAccountMasked",
        pi.pan_masked as "panMasked",
        pi.bank_name as "bankName",
        pi.ifsc_code as "ifscCode",
        pi.status,
        pi.payment_date as "paymentDate",
        pi.transaction_ref as "transactionRef",
        pr.month,
        pr.year,
        pr.status as "runStatus"
      FROM payroll_items pi
      JOIN payroll_runs pr ON pr.id = pi.payroll_run_id
      WHERE pr.hospital_id = $1 AND pr.month = $2 AND pr.year = $3
    `;
    const params = [hospitalId, month, year];

    if (employeeId) {
      itemsSql += ' AND pi.employee_id = $4';
      params.push(employeeId);
    }

    itemsSql += ' ORDER BY pi.staff_name ASC;';

    const itemsRes = await query(itemsSql, params);

    return res.json({
      run: runRes.rows[0] || null,
      payroll: itemsRes.rows,
    });
  } catch (err) {
    console.error('Error fetching payroll:', err);
    return res.status(500).json({ error: 'Failed to fetch payroll records' });
  }
});

// ── GET /api/hr/payroll/policies (Configurable Payroll Rules) ────────────────
router.get('/payroll/policies', async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId || 1;
    const result = await query(`
      SELECT * FROM payroll_policies
      WHERE hospital_id = $1 AND is_active = TRUE
      ORDER BY updated_at DESC LIMIT 1;
    `, [hospitalId]);

    const policy = result.rows[0] || {
      id: 1,
      hospital_id: hospitalId,
      policy_name: 'Standard Hospital Payroll Policy',
      pf_percentage: 12.0,
      tds_percentage: 10.0,
      daily_pay_divisor_type: '30_days',
      daily_pay_fixed_days: 30.0,
      overtime_multiplier: 1.50,
      standard_work_hours_per_day: 8.0,
      is_active: true
    };

    return res.json({ policy });
  } catch (err) {
    console.error('Error fetching payroll policy:', err);
    return res.status(500).json({ error: 'Failed to fetch payroll policy' });
  }
});

// ── GET /api/hr/payroll/preview (Unsaved Dynamic Calendar Proration Preview) ─
router.get('/payroll/preview', async (req, res) => {
  try {
    const hospitalId = (req.user && req.user.hospitalId) || 1;
    const employeeId = req.query.employeeId || 'EMP-101';
    const month = req.query.month || 'October';
    const year = parseInt(req.query.year || '2026', 10);
    const includeLoan = req.query.includeLoan === 'true' || req.query.includeLoan === true;

    const monthNum = MONTH_NUMBERS[month.toLowerCase()] || '10';
    const startDate = `${year}-${monthNum}-01`;
    const lastDayOfMonth = new Date(year, parseInt(monthNum, 10), 0).getDate();
    const endDate = `${year}-${monthNum}-${String(lastDayOfMonth).padStart(2, '0')}`;

    // 1. Fetch dynamic policy
    const policyRes = await query(`
      SELECT * FROM payroll_policies WHERE hospital_id = $1 AND is_active = TRUE ORDER BY updated_at DESC LIMIT 1;
    `, [hospitalId]);
    const policy = policyRes.rows[0] || {
      pf_percentage: 12.0,
      tds_percentage: 10.0,
      daily_pay_divisor_type: 'month_days',
      daily_pay_fixed_days: 30.0,
      overtime_multiplier: 1.50,
      standard_work_hours_per_day: 8.0,
    };

    const dailyDivisor = policy.daily_pay_divisor_type === 'month_days'
      ? lastDayOfMonth
      : (parseFloat(policy.daily_pay_fixed_days) || 30.0);
    const otMultiplier = parseFloat(policy.overtime_multiplier) || 1.50;
    const stdWorkHours = parseFloat(policy.standard_work_hours_per_day) || 8.0;
    const pfPct = parseFloat(policy.pf_percentage) || 12.0;
    const tdsPct = parseFloat(policy.tds_percentage) || 10.0;

    // 2. Fetch employee details
    const empRes = await query(`
      SELECT 
        e.id, e.name, e.department, e.designation, e.joining_date, e.status, e.last_working_date,
        b.account_number, b.ifsc_code, b.bank_name, b.pan_number,
        s.basic, s.hra, s.allowances, s.pf, s.tax,
        COALESCE(s.professional_tax, 0) as professional_tax
      FROM employees e
      JOIN salary_structures s ON s.employee_id = e.id AND s.is_active = TRUE
      LEFT JOIN employee_bank_details b ON b.employee_id = e.id
      WHERE e.id = $1 AND e.hospital_id = $2;
    `, [employeeId, hospitalId]);

    if (empRes.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found or salary structure not active' });
    }

    const emp = empRes.rows[0];
    const empJoinDateStr = emp.joining_date
      ? (typeof emp.joining_date === 'string' ? emp.joining_date.split('T')[0] : emp.joining_date.toISOString().split('T')[0])
      : startDate;
    const cycleStartDate = empJoinDateStr > startDate ? empJoinDateStr : startDate;

    // Check if joined after period
    if (empJoinDateStr > endDate) {
      return res.json({
        isUnsavedPreview: true,
        previewType: 'UNSAVED_CALCULATION',
        employeeId,
        staffName: emp.name,
        month,
        year,
        paidDays: 0,
        activeDays: 0,
        daysInMonth: lastDayOfMonth,
        basic: 0, hra: 0, allowances: 0, gross: 0,
        pf: 0, tax: 0, professionalTax: 0, otherDeductions: 0,
        totalDeductions: 0, netPay: 0,
        note: 'Employee joined after payroll month end. Zero eligible earnings.'
      });
    }

    let activeDaysInMonth = lastDayOfMonth;
    let preJoiningUnworkedDays = 0;
    if (empJoinDateStr > startDate) {
      const joinDay = parseInt(empJoinDateStr.split('-')[2], 10);
      activeDaysInMonth = Math.max(0, lastDayOfMonth - joinDay + 1);
      preJoiningUnworkedDays = Math.max(0, joinDay - 1);
    }

    // Attendance
    const attRes = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE attendance_status IN ('Present', 'Late')) as present_days,
        COUNT(*) FILTER (WHERE attendance_status = 'Absent') as absent_days,
        COUNT(*) FILTER (WHERE attendance_status IN ('Half Day', 'Half-Day')) as half_days,
        COALESCE(SUM(overtime_hours), 0) as total_overtime_hours
      FROM attendance
      WHERE employee_id = $1 AND attendance_date BETWEEN $2 AND $3;
    `, [emp.id, cycleStartDate, endDate]);
    const att = attRes.rows[0] || {};

    // Leaves
    const leaveRes = await query(`
      SELECT 
        leave_type,
        SUM(
          LEAST(end_date, $3::date) - GREATEST(start_date, $2::date) + 1
        ) as total_days
      FROM leave_requests
      WHERE employee_id = $1 AND status = 'Approved' 
        AND (start_date <= $3::date AND end_date >= $2::date)
      GROUP BY leave_type;
    `, [emp.id, cycleStartDate, endDate]);

    let paidLeaveDays = 0;
    let unpaidLeaveDays = 0;
    for (const l of leaveRes.rows) {
      const lDays = parseFloat(l.total_days || 0);
      if (l.leave_type.toLowerCase().includes('unpaid') || l.leave_type.toLowerCase().includes('without pay')) {
        unpaidLeaveDays += lDays;
      } else {
        paidLeaveDays += lDays;
      }
    }

    const absentDays = parseFloat(att.absent_days || 0);
    const halfDays = parseFloat(att.half_days || 0);
    const overtimeHours = parseFloat(att.total_overtime_hours || 0);
    const unworkedUnpaidDays = unpaidLeaveDays + absentDays + (halfDays * 0.5);
    const paidDays = Math.max(0, activeDaysInMonth - unworkedUnpaidDays);

    const baseBasic = parseFloat(emp.basic || 0);
    const baseHra = parseFloat(emp.hra || 0);
    const baseAllowances = parseFloat(emp.allowances || 0);
    const baseProfessionalTax = parseFloat(emp.professional_tax || 0);
    const baseMonthlyGross = round2(baseBasic + baseHra + baseAllowances);

    // Actual calendar-day proration (days in month = actual calendar days in month)
    const paidRatio = lastDayOfMonth > 0 ? (paidDays / lastDayOfMonth) : 0;
    const earnedGross = round2(baseMonthlyGross * paidRatio);
    const earnedBasic = round2(baseBasic * paidRatio);
    const earnedHra = round2(baseHra * paidRatio);
    const earnedAllowances = round2(earnedGross - earnedBasic - earnedHra);

    const hourlyOvertimeRate = ((baseBasic / dailyDivisor) / stdWorkHours) * otMultiplier;
    const overtimeAmount = round2(overtimeHours * hourlyOvertimeRate);
    const totalEarnings = round2(earnedGross + overtimeAmount);

    const pf = round2(earnedBasic * (pfPct / 100));
    const tax = round2(earnedGross * (tdsPct / 100));
    const professionalTax = round2(baseProfessionalTax * paidRatio);
    const statutoryDeductions = round2(pf + tax + professionalTax);

    const netBeforeLoan = round2(totalEarnings - statutoryDeductions);

    // Loan query
    let scheduledEmi = 0;
    let actualLoanDeduct = 0;
    let unpaidEmiAmount = 0;
    if (includeLoan) {
      const loanRes = await query(`
        SELECT monthly_emi, balance_outstanding, remaining_tenure_months
        FROM staff_loans
        WHERE employee_id = $1 AND status = 'Active' AND balance_outstanding > 0
        LIMIT 1;
      `, [emp.id]);
      if (loanRes.rows.length > 0) {
        const l = loanRes.rows[0];
        const bal = parseFloat(l.balance_outstanding);
        const emi = parseFloat(l.monthly_emi);
        const tenure = parseInt(l.remaining_tenure_months, 10);
        scheduledEmi = (emi >= bal || tenure <= 1) ? bal : emi;
        actualLoanDeduct = Math.min(scheduledEmi, Math.max(0, netBeforeLoan));
        unpaidEmiAmount = round2(scheduledEmi - actualLoanDeduct);
      }
    }

    const totalDeductions = round2(statutoryDeductions + actualLoanDeduct);
    const netPay = round2(totalEarnings - totalDeductions);
    const leaveDeductions = round2(Math.max(0, baseMonthlyGross - earnedGross));

    return res.json({
      isUnsavedPreview: true,
      previewType: 'UNSAVED_CALCULATION',
      employeeId: emp.id,
      staffName: emp.name,
      department: emp.department,
      designation: emp.designation,
      joiningDate: empJoinDateStr,
      month,
      year,
      daysInMonth: lastDayOfMonth,
      activeDays: activeDaysInMonth,
      paidDays,
      preJoiningDays: preJoiningUnworkedDays,
      workingDaysDisplay: `${paidDays} / ${lastDayOfMonth} Days`,
      basic: earnedBasic,
      hra: earnedHra,
      allowances: earnedAllowances,
      gross: earnedGross,
      overtimeHours,
      overtimeAmount,
      totalEarnings,
      pf,
      tax,
      professionalTax,
      statutoryDeductions,
      netBeforeLoan,
      scheduledEmi,
      otherDeductions: actualLoanDeduct,
      unpaidEmiAmount,
      totalDeductions,
      netPay,
      leaveDeductions,
      invariants: {
        componentsSumToGross: round2(earnedBasic + earnedHra + earnedAllowances) === earnedGross,
        accountingEquation: round2(totalEarnings - totalDeductions) === netPay
      }
    });
  } catch (err) {
    console.error('Error generating payroll preview:', err);
    return res.status(500).json({ error: 'Failed to generate payroll preview' });
  }
});

// ── PUT /api/hr/payroll/policies (Update Configurable Payroll Rules) ──────────
router.put('/payroll/policies', requireHrAdmin, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId || 1;
    const {
      policyName,
      pfPercentage,
      tdsPercentage,
      dailyPayDivisorType,
      dailyPayFixedDays,
      overtimeMultiplier,
      standardWorkHoursPerDay,
      reason
    } = req.body;

    const pf = parseFloat(pfPercentage);
    const tds = parseFloat(tdsPercentage);
    const divisorType = dailyPayDivisorType === 'month_days' ? 'month_days' : '30_days';
    const fixedDays = parseFloat(dailyPayFixedDays || 30.0);
    const otMult = parseFloat(overtimeMultiplier);
    const stdHours = parseFloat(standardWorkHoursPerDay || 8.0);

    if (isNaN(pf) || pf < 0 || pf > 50) {
      return res.status(400).json({ error: 'Valid PF percentage between 0 and 50 is required' });
    }
    if (isNaN(tds) || tds < 0 || tds > 50) {
      return res.status(400).json({ error: 'Valid TDS percentage between 0 and 50 is required' });
    }
    if (isNaN(otMult) || otMult < 1.0 || otMult > 5.0) {
      return res.status(400).json({ error: 'Overtime multiplier must be between 1.0 and 5.0' });
    }
    if (isNaN(stdHours) || stdHours < 4.0 || stdHours > 16.0) {
      return res.status(400).json({ error: 'Standard daily work hours must be between 4 and 16' });
    }

    const result = await withTransaction(async (client) => {
      // 1. Fetch current policy
      const currRes = await client.query(`
        SELECT * FROM payroll_policies WHERE hospital_id = $1 AND is_active = TRUE ORDER BY updated_at DESC LIMIT 1;
      `, [hospitalId]);
      const oldPolicy = currRes.rows[0] || null;

      // 2. Deactivate previous
      await client.query(`
        UPDATE payroll_policies SET is_active = FALSE WHERE hospital_id = $1;
      `, [hospitalId]);

      // 3. Insert new policy version
      const insRes = await client.query(`
        INSERT INTO payroll_policies (
          hospital_id, policy_name, pf_percentage, tds_percentage,
          daily_pay_divisor_type, daily_pay_fixed_days, overtime_multiplier,
          standard_work_hours_per_day, is_active, updated_by, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, CURRENT_TIMESTAMP)
        RETURNING *;
      `, [
        hospitalId,
        policyName || 'Updated Hospital Payroll Policy',
        pf,
        tds,
        divisorType,
        fixedDays,
        otMult,
        stdHours,
        req.user.username
      ]);

      const newPolicy = insRes.rows[0];

      // 4. Log Audit
      await logAudit({
        client,
        hospitalId,
        userId: req.user.userId,
        actorUsername: req.user.username,
        action: 'PAYROLL_POLICY_UPDATED',
        entityType: 'PAYROLL_POLICY',
        entityId: String(newPolicy.id),
        reason: reason || 'Hospital administrator updated payroll policy rules',
        oldValue: oldPolicy,
        newValue: newPolicy,
      });

      return newPolicy;
    });

    return res.json({ message: 'Payroll policy updated successfully', policy: result });
  } catch (err) {
    console.error('Error updating payroll policy:', err);
    return res.status(400).json({ error: err.message || 'Failed to update payroll policy' });
  }
});

// ── POST /api/hr/payroll/run (Generate Draft / Calculated Payroll Based on Attendance & Leave)
router.post('/payroll/run', requireHrAdmin, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId || 1;
    const month = req.body.month || 'September';
    const year = parseInt(req.body.year || '2026', 10);
    const runId = `PR-${year}-${month.slice(0, 3).toUpperCase()}`;

    const monthNum = MONTH_NUMBERS[month.toLowerCase()] || '09';
    const startDate = `${year}-${monthNum}-01`;
    const lastDayOfMonth = new Date(year, parseInt(monthNum, 10), 0).getDate();
    const endDate = `${year}-${monthNum}-${String(lastDayOfMonth).padStart(2, '0')}`;

    const result = await withTransaction(async (client) => {
      // 1. Check if run is locked or already paid
      const existingRunRes = await client.query(`
        SELECT * FROM payroll_runs WHERE id = $1 AND hospital_id = $2;
      `, [runId, hospitalId]);

      if (existingRunRes.rows.length > 0 && ['Locked', 'Paid'].includes(existingRunRes.rows[0].status)) {
        throw new Error(`This payroll cycle is ${existingRunRes.rows[0].status} and cannot be recalculated directly. Please use controlled revision.`);
      }

      // Fetch dynamic active payroll policy for this hospital
      const policyRes = await client.query(`
        SELECT * FROM payroll_policies WHERE hospital_id = $1 AND is_active = TRUE ORDER BY updated_at DESC LIMIT 1;
      `, [hospitalId]);
      const policy = policyRes.rows[0] || {
        pf_percentage: 12.0,
        tds_percentage: 10.0,
        daily_pay_divisor_type: '30_days',
        daily_pay_fixed_days: 30.0,
        overtime_multiplier: 1.50,
        standard_work_hours_per_day: 8.0,
      };

      const dailyDivisor = policy.daily_pay_divisor_type === 'month_days' 
        ? lastDayOfMonth 
        : (parseFloat(policy.daily_pay_fixed_days) || 30.0);
      const otMultiplier = parseFloat(policy.overtime_multiplier) || 1.50;
      const stdWorkHours = parseFloat(policy.standard_work_hours_per_day) || 8.0;
      const pfPct = parseFloat(policy.pf_percentage) || 12.0;
      const tdsPct = parseFloat(policy.tds_percentage) || 10.0;

      // 2. Fetch all active employees eligible in this period (excluding Inactive, Resigned, Terminated or joined after period ends)
      const empSql = `
        SELECT 
          e.id, e.name, e.department, e.designation, e.joining_date, e.status, e.last_working_date,
          b.account_number, b.ifsc_code, b.bank_name, b.pan_number,
          s.basic, s.hra, s.allowances, s.pf, s.tax,
          COALESCE(s.professional_tax, 0) as professional_tax
        FROM employees e
        JOIN salary_structures s ON s.employee_id = e.id AND s.is_active = TRUE
        LEFT JOIN employee_bank_details b ON b.employee_id = e.id
        WHERE e.hospital_id = $1 
          AND e.is_active = TRUE 
          AND e.status NOT IN ('Inactive', 'Resigned', 'Terminated')
          AND e.joining_date <= $2
          AND (e.last_working_date IS NULL OR e.last_working_date >= $3)
        ORDER BY e.name ASC;
      `;
      const empRes = await client.query(empSql, [hospitalId, endDate, startDate]);

      // Remove existing unlocked items for this run if recalculating
      if (existingRunRes.rows.length > 0) {
        await client.query('DELETE FROM payroll_items WHERE payroll_run_id = $1;', [runId]);
      }

      let totalGross = 0;
      let totalDeductions = 0;
      let totalDisbursed = 0;
      const preparedItems = [];

      for (const emp of empRes.rows) {
        const empJoinDateStr = emp.joining_date 
          ? (typeof emp.joining_date === 'string' ? emp.joining_date.split('T')[0] : emp.joining_date.toISOString().split('T')[0]) 
          : startDate;
        const cycleStartDate = empJoinDateStr > startDate ? empJoinDateStr : startDate;

        // Mid-period joining and active calendar days in month
        let activeDaysInMonth = lastDayOfMonth;
        let preJoiningUnworkedDays = 0;
        if (empJoinDateStr > startDate) {
          const joinDay = parseInt(empJoinDateStr.split('-')[2], 10);
          activeDaysInMonth = Math.max(0, lastDayOfMonth - joinDay + 1);
          preJoiningUnworkedDays = Math.max(0, joinDay - 1);
        }

        // Query Attendance strictly between cycleStartDate and endDate to prevent double deductions
        const attSql = `
          SELECT 
            COUNT(*) FILTER (WHERE attendance_status IN ('Present', 'Late')) as present_days,
            COUNT(*) FILTER (WHERE attendance_status = 'Absent') as absent_days,
            COUNT(*) FILTER (WHERE attendance_status IN ('Half Day', 'Half-Day')) as half_days,
            COUNT(*) FILTER (WHERE attendance_status = 'On Leave') as on_leave_days,
            COALESCE(SUM(overtime_hours), 0) as total_overtime_hours,
            COALESCE(SUM(work_hours), 0) as total_work_hours,
            COALESCE(SUM(late_minutes), 0) as total_late_minutes
          FROM attendance
          WHERE employee_id = $1 AND attendance_date BETWEEN $2 AND $3;
        `;
        const attRes = await client.query(attSql, [emp.id, cycleStartDate, endDate]);
        const att = attRes.rows[0] || {};

        // Query Leaves strictly between cycleStartDate and endDate (attributing only days overlapping this period)
        const leaveSql = `
          SELECT 
            leave_type,
            SUM(
              LEAST(end_date, $3::date) - GREATEST(start_date, $2::date) + 1
            ) as total_days
          FROM leave_requests
          WHERE employee_id = $1 AND status = 'Approved' 
            AND (start_date <= $3::date AND end_date >= $2::date)
          GROUP BY leave_type;
        `;
        const leaveRes = await client.query(leaveSql, [emp.id, cycleStartDate, endDate]);

        let paidLeaveDays = 0;
        let unpaidLeaveDays = 0;
        for (const l of leaveRes.rows) {
          const lDays = parseFloat(l.total_days || 0);
          if (l.leave_type.toLowerCase().includes('unpaid') || l.leave_type.toLowerCase().includes('without pay')) {
            unpaidLeaveDays += lDays;
          } else {
            paidLeaveDays += lDays;
          }
        }

        const absentDays = parseFloat(att.absent_days || 0);
        const halfDays = parseFloat(att.half_days || 0);
        const overtimeHours = parseFloat(att.total_overtime_hours || 0);
        const unworkedUnpaidDays = unpaidLeaveDays + absentDays + (halfDays * 0.5);

        // Paid days strictly within eligible active days
        const paidDays = Math.max(0, activeDaysInMonth - unworkedUnpaidDays);

        // Salary components from active salary structure
        const baseBasic = parseFloat(emp.basic || 0);
        const baseHra = parseFloat(emp.hra || 0);
        const baseAllowances = parseFloat(emp.allowances || 0);
        const baseProfessionalTax = parseFloat(emp.professional_tax || 0);
        const baseMonthlyGross = round2(baseBasic + baseHra + baseAllowances);

        // Actual calendar-day proration: employed days divided by total calendar days in month
        const paidRatio = lastDayOfMonth > 0 ? (paidDays / lastDayOfMonth) : 0;

        const earnedGross = round2(baseMonthlyGross * paidRatio);
        const earnedBasic = round2(baseBasic * paidRatio);
        const earnedHra = round2(baseHra * paidRatio);
        // Balancing component ensures: earnedBasic + earnedHra + earnedAllowances === earnedGross exactly!
        const earnedAllowances = round2(earnedGross - earnedBasic - earnedHra);

        // Overtime rate based on base hourly basic
        const hourlyOvertimeRate = ((baseBasic / dailyDivisor) / stdWorkHours) * otMultiplier;
        const overtimeAmount = round2(overtimeHours * hourlyOvertimeRate);

        // Total earnings
        const totalEarnings = round2(earnedGross + overtimeAmount);

        // Statutory deductions calculated using policy percentages on earned values
        const pf = round2(earnedBasic * (pfPct / 100));
        const tax = round2(earnedGross * (tdsPct / 100));
        const professionalTax = round2(baseProfessionalTax * paidRatio);
        const statutoryDeductions = round2(pf + tax + professionalTax);

        // Disposable net before loan recovery (ensures take-home cannot become negative)
        const netBeforeLoan = round2(totalEarnings - statutoryDeductions);

        // Active staff loan EMI deduction from staff_loans table
        const cyclePeriod = `${year}-${monthNum}`;
        const loanRes = await client.query(
          `SELECT sl.id, sl.monthly_emi, sl.balance_outstanding, sl.remaining_tenure_months
           FROM staff_loans sl
           WHERE sl.employee_id = $1 AND sl.status = 'Active' AND sl.balance_outstanding > 0
             AND NOT EXISTS (
               SELECT 1 FROM staff_loan_repayments slr 
               WHERE slr.loan_id = sl.id AND slr.recovery_period = $2
             )`,
          [emp.id, cyclePeriod]
        );

        let actualLoanDeduct = 0;
        let scheduledEmiTotal = 0;
        let availableForLoan = Math.max(0, netBeforeLoan);

        for (const l of loanRes.rows) {
          const bal = parseFloat(l.balance_outstanding);
          const emi = parseFloat(l.monthly_emi);
          const tenure = parseInt(l.remaining_tenure_months, 10);
          const scheduledEmi = (emi >= bal || tenure <= 1) ? bal : emi;
          scheduledEmiTotal += scheduledEmi;

          const loanRecovery = Math.min(scheduledEmi, availableForLoan);
          actualLoanDeduct += loanRecovery;
          availableForLoan = Math.max(0, round2(availableForLoan - loanRecovery));
        }
        actualLoanDeduct = round2(actualLoanDeduct);
        const unpaidEmiAmount = round2(scheduledEmiTotal - actualLoanDeduct);

        // Total Deductions = Statutory Deductions + Actual Loan Recovery Withheld
        // (Note: Unpaid leave / LOP is already reflected in earned gross, NOT double-deducted here)
        const totalDeductionsItem = round2(statutoryDeductions + actualLoanDeduct);

        // Net Pay: Guaranteed accounting invariant
        const netPay = round2(totalEarnings - totalDeductionsItem);

        // Informational leave deductions (full base minus earned gross)
        const leaveDeductions = round2(Math.max(0, baseMonthlyGross - earnedGross));

        totalGross = round2(totalGross + earnedGross);
        totalDeductions = round2(totalDeductions + totalDeductionsItem);
        totalDisbursed = round2(totalDisbursed + netPay);

        const maskedAcc = emp.account_number ? `••••••••${emp.account_number.slice(-4)}` : '••••••••1001';
        const maskedPan = emp.pan_number ? `•••••${emp.pan_number.slice(-4)}` : '•••••1234';

        const attSummary = {
          presentDays: parseInt(att.present_days || 0, 10),
          absentDays,
          halfDays,
          paidLeaveDays,
          unpaidLeaveDays,
          preJoiningDays: preJoiningUnworkedDays,
          eligibleDays: activeDaysInMonth,
          overtimeHours,
          totalWorkHours: parseFloat(att.total_work_hours || 0),
          totalLateMinutes: parseInt(att.total_late_minutes || 0, 10),
          scheduledEmi: scheduledEmiTotal,
          actualLoanDeduct,
          unpaidEmiAmount,
        };

        preparedItems.push({
          empId: emp.id,
          name: emp.name,
          department: emp.department,
          designation: emp.designation,
          basic: earnedBasic,
          hra: earnedHra,
          allowances: earnedAllowances,
          gross: earnedGross,
          pf,
          tax,
          professionalTax,
          otherDeductions: actualLoanDeduct,
          totalDeductions: totalDeductionsItem,
          netPay,
          paidLeaveDays,
          unpaidLeaveDays,
          absentDays,
          overtimeHours,
          overtimeAmount,
          leaveDeductions,
          attSummary,
          maskedAcc, maskedPan,
          bankName: emp.bank_name || 'HDFC Bank',
          ifsc: emp.ifsc_code || 'HDFC0001234'
        });
      }

      // 3. Upsert Parent Payroll Run with status 'Calculated' (NOT directly 'Paid')
      const runSql = `
        INSERT INTO payroll_runs (
          id, hospital_id, month, year, total_staff, total_gross, total_deductions, total_disbursed, status, executed_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Calculated', $9)
        ON CONFLICT (hospital_id, month, year) DO UPDATE SET
          total_staff = EXCLUDED.total_staff,
          total_gross = EXCLUDED.total_gross,
          total_deductions = EXCLUDED.total_deductions,
          total_disbursed = EXCLUDED.total_disbursed,
          status = 'Calculated',
          executed_by = EXCLUDED.executed_by,
          executed_at = CURRENT_TIMESTAMP
        RETURNING *;
      `;
      const runRes = await client.query(runSql, [
        runId, hospitalId, month, year, preparedItems.length,
        totalGross, totalDeductions, totalDisbursed, req.user.username
      ]);

      // 4. Insert Child Payroll Items
      for (const item of preparedItems) {
        await client.query(`
          INSERT INTO payroll_items (
            payroll_run_id, employee_id, staff_name, department, designation,
            basic, hra, allowances, gross, pf, professional_tax, tax, other_deductions, total_deductions, net_pay,
            paid_leave_days, unpaid_leave_days, absent_days, overtime_hours,
            overtime_amount, leave_deductions, attendance_summary,
            bank_account_masked, pan_masked, bank_name, ifsc_code, status
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19,
            $20, $21, $22,
            $23, $24, $25, $26, 'Pending'
          );
        `, [
          runId, item.empId, item.name, item.department, item.designation,
          item.basic, item.hra, item.allowances, item.gross, item.pf, item.professionalTax, item.tax, item.otherDeductions, item.totalDeductions, item.netPay,
          item.paidLeaveDays, item.unpaidLeaveDays, item.absentDays, item.overtimeHours,
          item.overtimeAmount, item.leaveDeductions, JSON.stringify(item.attSummary),
          item.maskedAcc, item.maskedPan, item.bankName, item.ifsc
        ]);
      }

      await logAudit({
        client,
        hospitalId,
        userId: req.user.userId,
        actorUsername: req.user.username,
        action: 'PAYROLL_CALCULATED',
        entityType: 'PAYROLL_RUN',
        entityId: runId,
        reason: `Calculated for ${month} ${year} with configurable policy rules & live attendance/leaves`,
        newValue: { runId, totalStaff: preparedItems.length, totalGross, totalDisbursed, status: 'Calculated' },
      });

      return runRes.rows[0];
    });

    return res.status(201).json({
      message: `${month} ${year} payroll calculated based on attendance & leaves (Status: Calculated)`,
      run: result,
    });
  } catch (err) {
    console.error('Error running payroll:', err);
    return res.status(400).json({ error: err.message || 'Failed to calculate payroll' });
  }
});

// ── POST /api/hr/payroll/:id/review (HR Review Step with strict status transition)
router.post('/payroll/:id/review', requireHrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const hospitalId = req.user.hospitalId || 1;

    // Strict status transition check
    const currentRun = await query(`
      SELECT * FROM payroll_runs WHERE id = $1 AND hospital_id = $2;
    `, [id, hospitalId]);

    if (currentRun.rows.length === 0) return res.status(404).json({ error: 'Payroll run not found' });
    const currentStatus = currentRun.rows[0].status;

    if (currentStatus === 'Paid') {
      return res.status(400).json({ error: 'Cannot transition a Paid payroll back to Reviewed.' });
    }
    if (!['Draft', 'Calculated'].includes(currentStatus)) {
      return res.status(400).json({ error: `Cannot review payroll in status '${currentStatus}'. Only 'Draft' or 'Calculated' payroll can be reviewed.` });
    }

    const result = await query(`
      UPDATE payroll_runs 
      SET status = 'Reviewed', executed_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND hospital_id = $2
      RETURNING *;
    `, [id, hospitalId]);

    await logAudit({
      hospitalId,
      userId: req.user.userId,
      actorUsername: req.user.username,
      action: 'PAYROLL_REVIEWED',
      entityType: 'PAYROLL_RUN',
      entityId: id,
      oldValue: { status: currentStatus },
      newValue: { status: 'Reviewed' },
      reason: 'HR Administrator reviewed and verified attendance calculations',
    });

    return res.json({ message: 'Payroll marked as Reviewed by HR', run: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/hr/payroll/:id/approve (HR Approval Step with strict status transition)
router.post('/payroll/:id/approve', requireHrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const hospitalId = req.user.hospitalId || 1;

    // Strict status transition check
    const currentRun = await query(`
      SELECT * FROM payroll_runs WHERE id = $1 AND hospital_id = $2;
    `, [id, hospitalId]);

    if (currentRun.rows.length === 0) return res.status(404).json({ error: 'Payroll run not found' });
    const currentStatus = currentRun.rows[0].status;

    if (currentStatus === 'Paid') {
      return res.status(400).json({ error: 'Payroll is already Paid and cannot be re-approved.' });
    }
    if (!['Reviewed', 'Revised'].includes(currentStatus)) {
      return res.status(400).json({ error: `Cannot approve payroll in status '${currentStatus}'. Payroll must be 'Reviewed' or 'Revised' before approval.` });
    }

    const result = await query(`
      UPDATE payroll_runs 
      SET status = 'Approved', executed_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND hospital_id = $2 
      RETURNING *;
    `, [id, hospitalId]);

    // Mark all child items approved
    await query(`
      UPDATE payroll_items
      SET approved_by = $1
      WHERE payroll_run_id = $2;
    `, [req.user.username, id]);

    await logAudit({
      hospitalId,
      userId: req.user.userId,
      actorUsername: req.user.username,
      action: 'PAYROLL_APPROVED',
      entityType: 'PAYROLL_RUN',
      entityId: id,
      oldValue: { status: currentStatus },
      newValue: { status: 'Approved' },
      reason: 'Payroll authorized for disbursement',
    });

    return res.json({ message: 'Payroll approved successfully', run: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/hr/payroll/:id/revise (Controlled Revision Process) ────────────
router.post('/payroll/:id/revise', requireHrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { employeeId, adjustments, reason } = req.body;
    const hospitalId = req.user.hospitalId || 1;

    if (!employeeId || !adjustments || !reason) {
      return res.status(400).json({ error: 'employeeId, adjustments, and reason are required for controlled payroll revision' });
    }

    const result = await withTransaction(async (client) => {
      // 1. Fetch parent payroll run with lock
      const runRes = await client.query('SELECT * FROM payroll_runs WHERE id = $1 AND hospital_id = $2 FOR UPDATE;', [id, hospitalId]);
      if (runRes.rows.length === 0) throw new Error('Payroll run not found');
      const parentRun = runRes.rows[0];

      const itemRes = await client.query(`
        SELECT * FROM payroll_items 
        WHERE payroll_run_id = $1 AND employee_id = $2;
      `, [id, employeeId]);

      if (itemRes.rows.length === 0) {
        throw new Error('Payroll item not found for this employee');
      }

      const item = itemRes.rows[0];
      const newGross = adjustments.gross !== undefined ? parseFloat(adjustments.gross) : parseFloat(item.gross);
      const newDeductions = adjustments.totalDeductions !== undefined ? parseFloat(adjustments.totalDeductions) : parseFloat(item.total_deductions);
      const newNet = Math.max(0, newGross - newDeductions);
      const newRevNum = (item.revision_number || 1) + 1;

      // Update payroll item with revision number & reason
      const updateRes = await client.query(`
        UPDATE payroll_items SET
          gross = $1,
          total_deductions = $2,
          net_pay = $3,
          revision_number = $4,
          revision_reason = $5,
          reviewed_by = $6
        WHERE id = $7
        RETURNING *;
      `, [newGross, newDeductions, newNet, newRevNum, reason, req.user.username, item.id]);

      // If run was already Paid, preserve Paid status so it cannot be casually reverted or re-disbursed
      const targetRunStatus = parentRun.status === 'Paid' ? 'Paid' : 'Revised';

      // Re-sum parent payroll run totals
      await client.query(`
        UPDATE payroll_runs SET
          total_gross = (SELECT SUM(gross) FROM payroll_items WHERE payroll_run_id = $1),
          total_deductions = (SELECT SUM(total_deductions) FROM payroll_items WHERE payroll_run_id = $1),
          total_disbursed = (SELECT SUM(net_pay) FROM payroll_items WHERE payroll_run_id = $1),
          status = $2,
          executed_at = CURRENT_TIMESTAMP
        WHERE id = $1;
      `, [id, targetRunStatus]);

      await logAudit({
        client,
        hospitalId,
        userId: req.user.userId,
        actorUsername: req.user.username,
        employeeId,
        employeeName: item.staff_name,
        action: parentRun.status === 'Paid' ? 'POST_PAYMENT_PAYROLL_REVISION' : 'PAYROLL_REVISED',
        entityType: 'PAYROLL_ITEM',
        entityId: item.id,
        reason,
        oldValue: item,
        newValue: updateRes.rows[0],
      });

      return updateRes.rows[0];
    });

    return res.json({ message: 'Controlled payroll revision recorded successfully', item: result });
  } catch (err) {
    console.error('Error revising payroll:', err);
    return res.status(400).json({ error: err.message || 'Failed to revise payroll' });
  }
});

// ── POST /api/hr/payroll/:id/pay (Disburse & Payout Step) ────────────────────
router.post('/payroll/:id/pay', requireHrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const hospitalId = req.user.hospitalId || 1;
    const today = new Date().toISOString().split('T')[0];
    const txnPrefix = `TXN-${Date.now().toString().slice(-6)}`;

    const result = await withTransaction(async (client) => {
      const runRes = await client.query(`SELECT * FROM payroll_runs WHERE id = $1 AND hospital_id = $2;`, [id, hospitalId]);
      if (runRes.rows.length === 0) throw new Error('Payroll run not found');

      if (!['Approved', 'Revised'].includes(runRes.rows[0].status)) {
        throw new Error(`Payroll must be Approved or Reviewed before payout. Current status: ${runRes.rows[0].status}`);
      }

      const updatedRun = await client.query(`
        UPDATE payroll_runs SET status = 'Paid' WHERE id = $1 AND hospital_id = $2 RETURNING *;
      `, [id, hospitalId]);

      await client.query(`
        UPDATE payroll_items SET
          status = 'Paid',
          payment_date = $1,
          transaction_ref = $2
        WHERE payroll_run_id = $3;
      `, [today, txnPrefix, id]);

      // Deduct monthly installment from active loans for employees in this payroll run,
      // strictly skipping loans whose installment for this recovery period was already recovered (manual or prior)
      const runMonth = runRes.rows[0].month;
      const runYear = runRes.rows[0].year;
      const runMonthNum = MONTH_NUMBERS[runMonth.toLowerCase()] || '09';
      const recoveryPeriod = `${runYear}-${runMonthNum}`;

      const eligibleLoans = await client.query(`
        SELECT sl.id, sl.employee_id, sl.employee_name, sl.monthly_emi, sl.balance_outstanding, sl.remaining_tenure_months, sl.status
        FROM staff_loans sl
        WHERE sl.status = 'Active' AND sl.balance_outstanding > 0
          AND sl.employee_id IN (SELECT employee_id FROM payroll_items WHERE payroll_run_id = $1)
          AND NOT EXISTS (
            SELECT 1 FROM staff_loan_repayments slr
            WHERE slr.loan_id = sl.id AND slr.recovery_period = $2
          )
        FOR UPDATE OF sl;
      `, [id, recoveryPeriod]);

      for (const loan of eligibleLoans.rows) {
        const bal = parseFloat(loan.balance_outstanding);
        const tenure = parseInt(loan.remaining_tenure_months, 10);
        const scheduledEmi = parseFloat(loan.monthly_emi);

        // Fetch actual loan deduction recorded on payroll_items for this employee in this run
        const itemRes = await client.query(
          `SELECT other_deductions FROM payroll_items WHERE payroll_run_id = $1 AND employee_id = $2;`,
          [id, loan.employee_id]
        );
        const actualDeduction = itemRes.rows.length > 0 ? parseFloat(itemRes.rows[0].other_deductions || 0) : 0;

        if (actualDeduction > 0) {
          const repaymentAmount = Math.min(bal, actualDeduction);
          const newBalance = Math.max(0, round2(bal - repaymentAmount));
          // If repayment covers at least the full scheduled EMI or closes the loan, decrement tenure
          const newTenure = (repaymentAmount >= scheduledEmi || newBalance <= 0) ? Math.max(0, tenure - 1) : tenure;
          const newStatus = (newBalance <= 0 || newTenure <= 0) ? 'Closed' : 'Active';

          // 1. Record repayment in ledger
          await client.query(`
            INSERT INTO staff_loan_repayments (
              loan_id, hospital_id, employee_id, amount,
              balance_before, balance_after, recovery_type,
              recovery_period, payroll_run_id, remarks, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, 'PAYROLL_DEDUCTION', $7, $8, $9, $10)
            ON CONFLICT (loan_id, recovery_period) DO NOTHING;
          `, [
            loan.id, hospitalId, loan.employee_id, repaymentAmount,
            bal, newBalance, recoveryPeriod, id,
            `Automated deduction via payroll cycle ${runMonth} ${runYear} (${id})`,
            req.user.username
          ]);

          // 2. Update loan master row
          await client.query(`
            UPDATE staff_loans
            SET balance_outstanding = $1, remaining_tenure_months = $2, status = $3, updated_at = CURRENT_TIMESTAMP
            WHERE id = $4;
          `, [newBalance, newTenure, newStatus, loan.id]);

          // 3. Log audit entry for loan recovery
          await logAudit({
            client,
            hospitalId,
            userId: req.user.userId,
            actorUsername: req.user.username,
            employeeId: loan.employee_id,
            employeeName: loan.employee_name,
            module: 'Payroll',
            action: 'LOAN_EMI_REPAYMENT',
            entityType: 'STAFF_LOAN',
            entityId: loan.id,
            oldValue: {
              balanceOutstanding: bal,
              remainingTenureMonths: tenure,
              status: loan.status,
            },
            newValue: {
              repaymentAmount,
              balanceOutstanding: newBalance,
              remainingTenureMonths: newTenure,
              status: newStatus,
              recoveryPeriod,
              payrollRunId: id,
            },
            reason: `Payroll deduction for cycle ${runMonth} ${runYear} (${id})`,
            ipAddress: req.ip || '127.0.0.1',
          });
        }
      }

      await logAudit({
        client,
        hospitalId,
        userId: req.user.userId,
        actorUsername: req.user.username,
        action: 'PAYROLL_DISBURSED',
        entityType: 'PAYROLL_RUN',
        entityId: id,
        reason: 'Salaries disbursed to employee bank accounts',
        newValue: { status: 'Paid', paymentDate: today, transactionRef: txnPrefix },
      });

      return updatedRun.rows[0];
    });

    return res.json({ message: 'Payroll disbursed and marked Paid', run: result });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

export default router;
