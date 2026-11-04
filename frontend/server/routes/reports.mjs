import express from 'express';
import { query } from '../db/index.mjs';
import { requireHrAdmin } from '../middleware/auth.mjs';

const router = express.Router();

// ── GET /api/hr/reports/:type ───────────────────────────────────────────────
router.get('/reports/:type', requireHrAdmin, async (req, res) => {
  try {
    const { type: reportType } = req.params;
    const hospitalId = req.user.hospitalId || 1;

    if (reportType === 'headcount') {
      const result = await query(`
        SELECT department, category, COUNT(*) as staff_count
        FROM employees
        WHERE hospital_id = $1 AND is_active = TRUE
        GROUP BY department, category
        ORDER BY department ASC;
      `, [hospitalId]);
      return res.json({ report: 'Workforce Headcount', distribution: result.rows });
    }

    if (reportType === 'attendance') {
      const month = req.query.month || new Date().toISOString().slice(0, 7);
      const result = await query(`
        SELECT 
          attendance_status,
          COUNT(*) as status_count,
          ROUND(AVG(work_hours), 2) as avg_work_hours,
          ROUND(SUM(overtime_hours), 2) as total_overtime_hours
        FROM attendance
        WHERE hospital_id = $1 AND TO_CHAR(attendance_date, 'YYYY-MM') = $2
        GROUP BY attendance_status;
      `, [hospitalId, month]);
      return res.json({ report: 'Monthly Attendance Analytics', month, metrics: result.rows });
    }

    if (reportType === 'leaves') {
      const year = parseInt(req.query.year || '2026', 10);
      const result = await query(`
        SELECT 
          leave_type,
          status,
          COUNT(*) as request_count,
          COALESCE(SUM(days), 0) as total_days
        FROM leave_requests
        WHERE hospital_id = $1 AND EXTRACT(YEAR FROM applied_on) = $2
        GROUP BY leave_type, status;
      `, [hospitalId, year]);
      return res.json({ report: 'Annual Leave Consumption', year, summary: result.rows });
    }

    if (reportType === 'payroll') {
      const year = parseInt(req.query.year || '2026', 10);
      const runRes = await query(`
        SELECT month, year, total_staff, total_gross, total_deductions, total_disbursed, status, executed_at
        FROM payroll_runs
        WHERE hospital_id = $1 AND year = $2
        ORDER BY executed_at DESC;
      `, [hospitalId, year]);

      const deptCostRes = await query(`
        SELECT pi.department, SUM(pi.net_pay) as total_cost
        FROM payroll_items pi
        JOIN payroll_runs pr ON pr.id = pi.payroll_run_id
        WHERE pr.hospital_id = $1 AND pr.year = $2
        GROUP BY pi.department
        ORDER BY total_cost DESC;
      `, [hospitalId, year]);

      return res.json({
        report: 'Financial Compensation & Payroll Summary',
        year,
        history: runRes.rows,
        departmentCosts: deptCostRes.rows,
      });
    }

    if (reportType === 'compliance') {
      const credRes = await query(`
        SELECT 
          c.id, c.staff_name, c.department, c.credential_type, c.license_no, c.valid_until,
          CASE 
            WHEN c.valid_until < CURRENT_DATE THEN 'Expired'
            WHEN c.valid_until <= CURRENT_DATE + INTERVAL '30 days' THEN 'Expiring Soon'
            ELSE 'Valid'
          END as status
        FROM employee_credentials c
        JOIN employees e ON e.id = c.employee_id
        WHERE e.hospital_id = $1 AND e.is_active = TRUE
        ORDER BY c.valid_until ASC;
      `, [hospitalId]);

      return res.json({
        report: 'Accreditation & Medical License Compliance',
        records: credRes.rows,
      });
    }

    return res.status(400).json({ error: `Unknown report type: ${reportType}` });
  } catch (err) {
    console.error('Error generating report:', err);
    return res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ── GET /api/hr/audit-logs (Centralized Searchable Audit Trail) ───────────────
router.get('/audit-logs', requireHrAdmin, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId || 1;
    const { employeeId, action, search, startDate, endDate } = req.query;
    const limit = parseInt(req.query.limit || '100', 10);

    let sql = `
      SELECT 
        id,
        hospital_id,
        user_id as "userId",
        actor_username as "actorUsername",
        employee_id as "employeeId",
        employee_name as "employeeName",
        module,
        action,
        entity_type as "entityType",
        entity_id as "entityId",
        old_value as "oldValue",
        new_value as "newValue",
        reason,
        ip_address as "ipAddress",
        created_at as "createdAt"
      FROM audit_logs
      WHERE hospital_id = $1
    `;
    const params = [hospitalId];
    let pIdx = 2;

    if (employeeId) {
      sql += ` AND employee_id = $${pIdx}`;
      params.push(employeeId);
      pIdx++;
    }

    if (action && action !== 'All') {
      sql += ` AND action = $${pIdx}`;
      params.push(action);
      pIdx++;
    }

    if (startDate && endDate) {
      sql += ` AND created_at BETWEEN $${pIdx} AND $${pIdx + 1}`;
      params.push(startDate, endDate);
      pIdx += 2;
    }

    if (search) {
      sql += ` AND (
        actor_username ILIKE $${pIdx} 
        OR employee_name ILIKE $${pIdx} 
        OR action ILIKE $${pIdx} 
        OR reason ILIKE $${pIdx}
      )`;
      params.push(`%${search}%`);
      pIdx++;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${pIdx};`;
    params.push(limit);

    const result = await query(sql, params);
    return res.json({ total: result.rows.length, auditLogs: result.rows, logs: result.rows });
  } catch (err) {
    console.error('Error fetching audit logs:', err);
    return res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// ── GET /api/hr/alerts (Real-Time System Alerts & Notifications) ─────────────
router.get('/alerts', requireHrAdmin, async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId || 1;
    const alerts = [];

    // 1. Check licenses and clinical credentials nearing expiry (< 60 days) or expired
    const licenseRes = await query(`
      SELECT 
        e.id, 
        e.name, 
        e.department, 
        COALESCE(c.license_no, e.license_number) as license_number, 
        COALESCE(c.valid_until, e.license_expiry) as expiry_date,
        COALESCE(c.title, 'Medical License') as credential_title,
        CASE 
          WHEN COALESCE(c.valid_until, e.license_expiry) < CURRENT_DATE THEN 'Expired'
          WHEN COALESCE(c.valid_until, e.license_expiry) <= CURRENT_DATE + INTERVAL '60 days' THEN 'Expiring Soon'
          ELSE 'Valid'
        END as status,
        (COALESCE(c.valid_until, e.license_expiry) - CURRENT_DATE) as days_remaining
      FROM employees e
      LEFT JOIN employee_credentials c ON c.employee_id = e.id
      WHERE e.hospital_id = $1 AND e.is_active = TRUE 
        AND COALESCE(c.valid_until, e.license_expiry) IS NOT NULL
        AND COALESCE(c.valid_until, e.license_expiry) <= CURRENT_DATE + INTERVAL '60 days'
      ORDER BY expiry_date ASC;
    `, [hospitalId]);

    const seenAlertIds = new Set();
    for (const lic of licenseRes.rows) {
      const expDateStr = lic.expiry_date instanceof Date ? lic.expiry_date.toISOString().split('T')[0] : String(lic.expiry_date).split('T')[0];
      const alertId = `LIC-${lic.id}-${lic.license_number}`;
      if (seenAlertIds.has(alertId)) continue;
      seenAlertIds.add(alertId);

      alerts.push({
        id: alertId,
        type: lic.status === 'Expired' ? 'CRITICAL' : 'WARNING',
        category: 'License & Compliance',
        title: lic.status === 'Expired' ? `Expired Credential: ${lic.name} (${lic.credential_title})` : `Expiring Soon: ${lic.name} (${lic.credential_title})`,
        message: lic.status === 'Expired'
          ? `${lic.name} (${lic.department}) ${lic.credential_title} [${lic.license_number}] expired on ${expDateStr}. Clinical scheduling blocked.`
          : `${lic.name} ${lic.credential_title} [${lic.license_number}] expires in ${Math.round(lic.days_remaining)} days (${expDateStr}). Renewal required.`,
        employeeId: lic.id,
        employeeName: lic.name,
        date: new Date().toISOString(),
      });
    }

    // 2. Check pending leave approvals
    const leaveRes = await query(`
      SELECT id, staff_name, leave_type, days, start_date, end_date, applied_on
      FROM leave_requests
      WHERE hospital_id = $1 AND status = 'Pending'
      ORDER BY applied_on ASC;
    `, [hospitalId]);

    for (const l of leaveRes.rows) {
      alerts.push({
        id: `LEAVE-${l.id}`,
        type: 'INFO',
        category: 'Leave Approval',
        title: `Pending Leave Request: ${l.staff_name}`,
        message: `${l.staff_name} applied for ${l.days} day(s) of ${l.leave_type} (${l.start_date.toISOString().split('T')[0]} to ${l.end_date.toISOString().split('T')[0]}).`,
        leaveId: l.id,
        employeeName: l.staff_name,
        date: l.applied_on,
      });
    }

    // 3. Check upcoming employee exits on notice period
    const exitRes = await query(`
      SELECT id, name, department, resignation_date, last_working_date, status, exit_reason
      FROM employees
      WHERE hospital_id = $1 AND status = 'Notice Period' AND last_working_date >= CURRENT_DATE
      ORDER BY last_working_date ASC;
    `, [hospitalId]);

    for (const ex of exitRes.rows) {
      alerts.push({
        id: `EXIT-${ex.id}`,
        type: 'WARNING',
        category: 'Employee Exit',
        title: `Upcoming Employee Exit: ${ex.name}`,
        message: `${ex.name} (${ex.department}) is on notice period. Last working date: ${ex.last_working_date.toISOString().split('T')[0]}.`,
        employeeId: ex.id,
        employeeName: ex.name,
        date: ex.resignation_date,
      });
    }

    // 4. Check unapproved payroll runs
    const payrollRes = await query(`
      SELECT id, month, year, status, total_staff, total_gross
      FROM payroll_runs
      WHERE hospital_id = $1 AND status IN ('Calculated', 'Reviewed')
      ORDER BY executed_at DESC;
    `, [hospitalId]);

    for (const pr of payrollRes.rows) {
      alerts.push({
        id: `PAY-${pr.id}`,
        type: 'ACTION_REQUIRED',
        category: 'Payroll',
        title: `Payroll ${pr.status}: ${pr.month} ${pr.year}`,
        message: `${pr.month} ${pr.year} payroll (${pr.total_staff} employees, ₹${pr.total_gross}) is currently in '${pr.status}' status awaiting authorization.`,
        payrollRunId: pr.id,
        date: new Date().toISOString(),
      });
    }

    return res.json({ alerts, total: alerts.length });
  } catch (err) {
    console.error('Error fetching alerts:', err);
    return res.status(500).json({ error: 'Failed to fetch HR alerts' });
  }
});

export default router;
