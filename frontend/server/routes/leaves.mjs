import express from 'express';
import { query, withTransaction } from '../db/index.mjs';
import { requireHrAdmin } from '../middleware/auth.mjs';
import { logAudit } from '../services/audit.mjs';
import { createNotification } from '../services/notifications.mjs';

const router = express.Router();

const CANONICAL_LEAVE_TYPES = {
  'casual': 'Casual Leave',
  'casual leave': 'Casual Leave',
  'sick': 'Sick Leave',
  'sick leave': 'Sick Leave',
  'earned': 'Earned Leave',
  'earned leave': 'Earned Leave',
  'maternity': 'Maternity Leave',
  'maternity leave': 'Maternity Leave',
  'maternity/paternity': 'Maternity Leave',
  'maternity/paternity leave': 'Maternity Leave',
  'emergency': 'Emergency Leave',
  'emergency leave': 'Emergency Leave',
};

// ── GET /api/hr/leaves ───────────────────────────────────────────────────────
router.get('/leaves', async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId || 1;
    const employeeId = req.query.employeeId || (!req.user.isAdmin ? req.user.employeeId : null);

    let sql = `
      SELECT 
        lr.id,
        lr.employee_id as "staffId",
        lr.staff_name as "staffName",
        lr.department,
        lr.leave_type as "leaveType",
        TO_CHAR(lr.start_date, 'YYYY-MM-DD') as "startDate",
        TO_CHAR(lr.end_date, 'YYYY-MM-DD') as "endDate",
        lr.days,
        lr.reason,
        lr.handover_note as "handoverNote",
        lr.replacement_staff_id as "replacementStaffId",
        lr.status,
        TO_CHAR(lr.applied_on, 'YYYY-MM-DD') as "appliedOn",
        lr.reviewed_by as "reviewedBy",
        lr.reviewed_at as "reviewedAt",
        lr.remarks
      FROM leave_requests lr
      WHERE lr.hospital_id = $1
    `;
    const params = [hospitalId];

    if (employeeId) {
      sql += ' AND lr.employee_id = $2';
      params.push(employeeId);
    }

    sql += ' ORDER BY lr.created_at DESC;';

    const result = await query(sql, params);
    return res.json({ leaves: result.rows });
  } catch (err) {
    console.error('Error fetching leaves:', err);
    return res.status(500).json({ error: 'Failed to fetch leave requests' });
  }
});

// ── POST /api/hr/leaves (Apply Leave) ───────────────────────────────────────
router.post('/leaves', async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId || 1;
    let { staffId, leaveType, startDate, endDate, days, reason, handoverNote, replacementStaffId } = req.body;
    staffId = staffId || req.body.employeeId;

    // Normal staff cannot apply for someone else; force own ID
    if (!req.user.isAdmin && req.user.employeeId) {
      staffId = req.user.employeeId;
    }

    if (!staffId || !leaveType || !startDate || !endDate || !reason) {
      return res.status(400).json({ error: 'Missing required leave application fields' });
    }

    // 1. Leave-type canonicalization and validation
    const normalizedTypeKey = String(leaveType).trim().toLowerCase();
    const canonicalType = CANONICAL_LEAVE_TYPES[normalizedTypeKey];
    if (!canonicalType) {
      return res.status(400).json({
        error: `Unsupported leave type: "${leaveType}". Supported types are Casual Leave, Sick Leave, Earned Leave, Maternity/Paternity Leave, and Emergency Leave.`
      });
    }

    // 2. Strict date format and range validation
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return res.status(400).json({ error: 'Start date and end date must be valid strings in YYYY-MM-DD format.' });
    }

    if (startDate > endDate) {
      return res.status(400).json({ error: 'Start date cannot be after end date' });
    }

    const startYear = parseInt(startDate.split('-')[0], 10);
    const endYear = parseInt(endDate.split('-')[0], 10);
    if (startYear !== endYear) {
      return res.status(400).json({
        error: 'Cross-calendar-year leave requests (spanning December to January) must be submitted as two separate requests per calendar year to correctly debit annual quotas.'
      });
    }

    // Exact calendar days calculation (timezone-immune UTC bounds)
    const [sY, sM, sD] = startDate.split('-').map(Number);
    const [eY, eM, eD] = endDate.split('-').map(Number);
    const computedDays = Math.round((Date.UTC(eY, eM - 1, eD) - Date.UTC(sY, sM - 1, sD)) / (1000 * 60 * 60 * 24)) + 1;
    const calcDays = days ? parseFloat(days) : computedDays;

    if (calcDays <= 0 || isNaN(calcDays)) {
      return res.status(400).json({ error: 'Calculated leave duration must be at least 1 day.' });
    }

    const result = await withTransaction(async (client) => {
      // 1. Fetch & lock employee row to serialize concurrent submissions
      const empRes = await client.query(
        'SELECT * FROM employees WHERE id = $1 AND hospital_id = $2 FOR UPDATE',
        [staffId, hospitalId]
      );
      if (empRes.rows.length === 0) {
        const err = new Error('Employee not found');
        err.statusCode = 404;
        throw err;
      }
      const emp = empRes.rows[0];

      // 2. Prevent overlapping leave requests (both boundary dates included; Pending & Approved)
      const overlapRes = await client.query(`
        SELECT 
          id,
          leave_type as "leaveType",
          TO_CHAR(start_date, 'YYYY-MM-DD') as "startDate",
          TO_CHAR(end_date, 'YYYY-MM-DD') as "endDate",
          status
        FROM leave_requests
        WHERE hospital_id = $1 AND employee_id = $2
          AND status IN ('Pending', 'Approved')
          AND start_date <= $4::date AND end_date >= $3::date
        ORDER BY start_date ASC
        LIMIT 1;
      `, [hospitalId, staffId, startDate, endDate]);

      if (overlapRes.rows.length > 0) {
        const overlap = overlapRes.rows[0];
        const err = new Error(
          `Leave request overlaps with an existing ${overlap.status.toLowerCase()} request (${overlap.id}, ${overlap.leaveType}) from ${overlap.startDate} to ${overlap.endDate}.`
        );
        err.statusCode = 409;
        throw err;
      }

      // 3. Pre-check leave balance for quota-tracked types (using actual calendar year)
      const isCasual = canonicalType.startsWith('Casual');
      const isSick = canonicalType.startsWith('Sick');
      const isEarned = canonicalType.startsWith('Earned');

      if (isCasual || isSick || isEarned) {
        const balRes = await client.query(
          'SELECT * FROM leave_balances WHERE employee_id = $1 AND year = $2',
          [staffId, startYear]
        );
        if (balRes.rows.length === 0) {
          const err = new Error(`Leave quota balance not configured for employee ${staffId} for year ${startYear}`);
          err.statusCode = 400;
          throw err;
        }
        const bal = balRes.rows[0];

        if (isCasual) {
          const available = parseFloat(bal.casual) - parseFloat(bal.casual_used);
          if (available < calcDays) {
            const err = new Error(`Insufficient Casual Leave balance. Available: ${available} days, requested: ${calcDays} days`);
            err.statusCode = 400;
            throw err;
          }
        } else if (isSick) {
          const available = parseFloat(bal.sick) - parseFloat(bal.sick_used);
          if (available < calcDays) {
            const err = new Error(`Insufficient Sick Leave balance. Available: ${available} days, requested: ${calcDays} days`);
            err.statusCode = 400;
            throw err;
          }
        } else if (isEarned) {
          const available = parseFloat(bal.earned) - parseFloat(bal.earned_used);
          if (available < calcDays) {
            const err = new Error(`Insufficient Earned Leave balance. Available: ${available} days, requested: ${calcDays} days`);
            err.statusCode = 400;
            throw err;
          }
        }
      }

      // 4. Generate Monotonic Unique Leave Request ID
      const maxRes = await client.query(
        `SELECT id FROM leave_requests WHERE hospital_id = $1 AND id LIKE $2 ORDER BY id DESC LIMIT 1`,
        [hospitalId, `LR-${startYear}-%`]
      );
      let nextSeq = 1;
      if (maxRes.rows.length > 0) {
        const match = maxRes.rows[0].id.match(/LR-\d+-(\d+)/);
        if (match) nextSeq = parseInt(match[1], 10) + 1;
      }
      const leaveId = `LR-${startYear}-${String(nextSeq).padStart(3, '0')}`;

      // 5. Insert leave request with canonical leave type
      const insertSql = `
        INSERT INTO leave_requests (
          id, hospital_id, employee_id, staff_name, department, leave_type,
          start_date, end_date, days, reason, handover_note, replacement_staff_id, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::date, $9, $10, $11, $12, 'Pending')
        RETURNING 
          id, hospital_id, employee_id as "staffId", staff_name as "staffName", department,
          leave_type as "leaveType", TO_CHAR(start_date, 'YYYY-MM-DD') as "startDate",
          TO_CHAR(end_date, 'YYYY-MM-DD') as "endDate", days, reason,
          handover_note as "handoverNote", replacement_staff_id as "replacementStaffId",
          status, TO_CHAR(applied_on, 'YYYY-MM-DD') as "appliedOn";
      `;

      const insertRes = await client.query(insertSql, [
        leaveId, hospitalId, staffId, emp.name, emp.department, canonicalType,
        startDate, endDate, calcDays, reason, handoverNote || null, replacementStaffId || null
      ]);

      // 6. Notify HR Admin
      await createNotification({
        client,
        hospitalId,
        recipientRole: 'ROLE_ADMIN',
        title: 'New Leave Application',
        message: `${emp.name} (${emp.department}) applied for ${calcDays} days of ${canonicalType}.`,
        type: 'INFO',
        actionUrl: '/hrms?tab=leaves',
      });

      // 7. Write Audit Log
      await logAudit({
        client,
        hospitalId,
        userId: req.user.userId,
        actorUsername: req.user.username,
        employeeId: staffId,
        action: 'LEAVE_APPLIED',
        entityType: 'LEAVE_REQUEST',
        entityId: leaveId,
        newValue: insertRes.rows[0],
      });

      return insertRes.rows[0];
    });

    return res.status(201).json({
      message: 'Leave application submitted successfully for HR approval',
      leave: result,
    });
  } catch (err) {
    console.error('Error applying for leave:', err);
    const status = err.statusCode || (err.message.includes('Insufficient') || err.message.includes('overlaps') ? 409 : 400);
    return res.status(status).json({ error: err.message || 'Failed to submit leave application' });
  }
});

// ── POST /api/hr/leaves/:id/approve (Atomic HR Approval Transaction) ────────
router.post('/leaves/:id/approve', requireHrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const hospitalId = req.user.hospitalId || 1;
    const remarks = req.body.remarks || 'Approved by HR Administration';

    const result = await withTransaction(async (client) => {
      // 1. Fetch leave request with lock
      const leaveRes = await client.query(`
        SELECT 
          id, hospital_id, employee_id, staff_name, department, leave_type,
          TO_CHAR(start_date, 'YYYY-MM-DD') as "startDate",
          TO_CHAR(end_date, 'YYYY-MM-DD') as "endDate",
          days, reason, status
        FROM leave_requests 
        WHERE id = $1 AND hospital_id = $2 
        FOR UPDATE;
      `, [id, hospitalId]);

      if (leaveRes.rows.length === 0) {
        const err = new Error('Leave request not found');
        err.statusCode = 404;
        throw err;
      }
      const leave = leaveRes.rows[0];

      if (leave.status !== 'Pending') {
        const err = new Error(`Cannot approve a leave request that is already ${leave.status}`);
        err.statusCode = 400;
        throw err;
      }

      // 2. Lock employee row to serialize concurrent balance updates
      await client.query(
        'SELECT id FROM employees WHERE id = $1 AND hospital_id = $2 FOR UPDATE',
        [leave.employee_id, hospitalId]
      );

      const leaveYear = parseInt(leave.startDate.split('-')[0], 10);
      const leaveDays = parseFloat(leave.days);

      // 3. Re-validate and deduct leave quota balance inside transaction with FOR UPDATE
      const isCasual = leave.leave_type.startsWith('Casual');
      const isSick = leave.leave_type.startsWith('Sick');
      const isEarned = leave.leave_type.startsWith('Earned');

      if (isCasual || isSick || isEarned) {
        const balRes = await client.query(
          'SELECT * FROM leave_balances WHERE employee_id = $1 AND year = $2 FOR UPDATE',
          [leave.employee_id, leaveYear]
        );
        if (balRes.rows.length === 0) {
          const err = new Error(`Leave quota balance for employee ${leave.employee_id} not configured for year ${leaveYear}`);
          err.statusCode = 400;
          throw err;
        }
        const bal = balRes.rows[0];

        if (isCasual) {
          const available = parseFloat(bal.casual) - parseFloat(bal.casual_used);
          if (available < leaveDays) {
            const err = new Error(`Insufficient Casual Leave balance to approve request. Available: ${available} days, required: ${leaveDays} days.`);
            err.statusCode = 409;
            throw err;
          }
          await client.query(
            'UPDATE leave_balances SET casual_used = casual_used + $1, updated_at = CURRENT_TIMESTAMP WHERE employee_id = $2 AND year = $3',
            [leaveDays, leave.employee_id, leaveYear]
          );
        } else if (isSick) {
          const available = parseFloat(bal.sick) - parseFloat(bal.sick_used);
          if (available < leaveDays) {
            const err = new Error(`Insufficient Sick Leave balance to approve request. Available: ${available} days, required: ${leaveDays} days.`);
            err.statusCode = 409;
            throw err;
          }
          await client.query(
            'UPDATE leave_balances SET sick_used = sick_used + $1, updated_at = CURRENT_TIMESTAMP WHERE employee_id = $2 AND year = $3',
            [leaveDays, leave.employee_id, leaveYear]
          );
        } else if (isEarned) {
          const available = parseFloat(bal.earned) - parseFloat(bal.earned_used);
          if (available < leaveDays) {
            const err = new Error(`Insufficient Earned Leave balance to approve request. Available: ${available} days, required: ${leaveDays} days.`);
            err.statusCode = 409;
            throw err;
          }
          await client.query(
            'UPDATE leave_balances SET earned_used = earned_used + $1, updated_at = CURRENT_TIMESTAMP WHERE employee_id = $2 AND year = $3',
            [leaveDays, leave.employee_id, leaveYear]
          );
        }
      }
      // Note: Maternity Leave and Emergency Leave are non-quota administrative leaves under the current schema.

      // 4. Update leave status
      await client.query(`
        UPDATE leave_requests SET
          status = 'Approved',
          reviewed_by = $1,
          reviewed_at = CURRENT_TIMESTAMP,
          remarks = $2
        WHERE id = $3;
      `, [req.user.username, remarks, id]);

      // 5. Update Shift Roster to "On Leave" for dates in range using native generate_series
      await client.query(`
        INSERT INTO shift_assignments (
          hospital_id, employee_id, shift_date, shift_name, department, notes, assigned_by
        )
        SELECT $1, $2, d::date, 'On Leave', $3, 'Approved Clinical Leave', 'HR System'
        FROM generate_series($4::date, $5::date, '1 day'::interval) as d
        ON CONFLICT (employee_id, shift_date) DO UPDATE SET
          shift_name = 'On Leave',
          notes = 'Approved Clinical Leave';
      `, [hospitalId, leave.employee_id, leave.department, leave.startDate, leave.endDate]);

      // 6. If CURRENT_DATE is within leave range, mark employee On Leave and update attendance
      await client.query(`
        UPDATE employees SET
          status = 'On Leave',
          duty_status = 'Off Duty',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND CURRENT_DATE BETWEEN $2::date AND $3::date;
      `, [leave.employee_id, leave.startDate, leave.endDate]);

      await client.query(`
        UPDATE attendance SET
          attendance_status = 'On Leave',
          clock_in = '---',
          clock_out = '---',
          work_hours = 0,
          updated_at = CURRENT_TIMESTAMP
        WHERE employee_id = $1 AND attendance_date = CURRENT_DATE
          AND CURRENT_DATE BETWEEN $2::date AND $3::date;
      `, [leave.employee_id, leave.startDate, leave.endDate]);

      // 7. Notify Employee
      await createNotification({
        client,
        hospitalId,
        recipientEmployeeId: leave.employee_id,
        title: 'Leave Approved',
        message: `Your ${leave.leave_type} request for ${leave.days} day(s) has been approved by HR.`,
        type: 'SUCCESS',
        actionUrl: '/employees',
      });

      // 8. Write Audit Log
      await logAudit({
        client,
        hospitalId,
        userId: req.user.userId,
        actorUsername: req.user.username,
        employeeId: leave.employee_id,
        action: 'LEAVE_APPROVED',
        entityType: 'LEAVE_REQUEST',
        entityId: id,
        oldValue: { status: leave.status },
        newValue: { status: 'Approved', days: leave.days, type: leave.leave_type },
        reason: remarks,
      });

      return { id, status: 'Approved' };
    });

    return res.json({ message: 'Leave request approved successfully and roster updated', leave: result });
  } catch (err) {
    console.error('Error approving leave:', err);
    const status = err.statusCode || (err.message.includes('Insufficient') ? 409 : 500);
    return res.status(status).json({ error: err.message || 'Failed to approve leave request' });
  }
});

// ── POST /api/hr/leaves/:id/reject ──────────────────────────────────────────
router.post('/leaves/:id/reject', requireHrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const hospitalId = req.user.hospitalId || 1;
    const remarks = req.body.remarks || 'Rejected by HR Administration';

    const result = await withTransaction(async (client) => {
      const leaveRes = await client.query('SELECT * FROM leave_requests WHERE id = $1 AND hospital_id = $2 FOR UPDATE', [id, hospitalId]);
      if (leaveRes.rows.length === 0) {
        const err = new Error('Leave request not found');
        err.statusCode = 404;
        throw err;
      }
      const leave = leaveRes.rows[0];

      if (leave.status !== 'Pending') {
        const err = new Error(`Cannot reject a leave request that is already ${leave.status}`);
        err.statusCode = 400;
        throw err;
      }

      await client.query(`
        UPDATE leave_requests SET
          status = 'Rejected',
          reviewed_by = $1,
          reviewed_at = CURRENT_TIMESTAMP,
          remarks = $2
        WHERE id = $3;
      `, [req.user.username, remarks, id]);

      await createNotification({
        client,
        hospitalId,
        recipientEmployeeId: leave.employee_id,
        title: 'Leave Rejected',
        message: `Your ${leave.leave_type} request was not approved: ${remarks}`,
        type: 'ALERT',
        actionUrl: '/employees',
      });

      await logAudit({
        client,
        hospitalId,
        userId: req.user.userId,
        actorUsername: req.user.username,
        employeeId: leave.employee_id,
        action: 'LEAVE_REJECTED',
        entityType: 'LEAVE_REQUEST',
        entityId: id,
        oldValue: { status: leave.status },
        newValue: { status: 'Rejected', remarks },
        reason: remarks,
      });

      return { id, status: 'Rejected' };
    });

    return res.json({ message: 'Leave request rejected', leave: result });
  } catch (err) {
    console.error('Error rejecting leave:', err);
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message || 'Failed to reject leave request' });
  }
});

export default router;
