import express from 'express';
import { query } from '../db/index.mjs';
import { requireHrAdmin } from '../middleware/auth.mjs';
import { logAudit } from '../services/audit.mjs';

const router = express.Router();

// ── GET /api/hr/shifts ───────────────────────────────────────────────────────
router.get('/shifts', async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId || 1;
    const result = await query(
      'SELECT * FROM shifts WHERE hospital_id = $1 AND is_active = TRUE ORDER BY start_time ASC;',
      [hospitalId]
    );
    return res.json({ shifts: result.rows });
  } catch (err) {
    console.error('Error fetching shifts:', err);
    return res.status(500).json({ error: 'Failed to fetch shifts' });
  }
});

// ── GET /api/hr/shift-assignments (Roster) ──────────────────────────────────
router.get('/shift-assignments', async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId || 1;
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const employeeId = req.query.employeeId || null;

    let sql = `
      SELECT 
        sa.*,
        e.name as employee_name,
        e.designation,
        e.category,
        e.duty_status
      FROM shift_assignments sa
      JOIN employees e ON e.id = sa.employee_id
      WHERE sa.hospital_id = $1 AND sa.shift_date = $2
    `;
    const params = [hospitalId, date];

    if (employeeId) {
      sql += ' AND sa.employee_id = $3';
      params.push(employeeId);
    }

    sql += ' ORDER BY e.name ASC;';

    const result = await query(sql, params);
    return res.json({
      date,
      assignments: result.rows,
    });
  } catch (err) {
    console.error('Error fetching shift roster:', err);
    return res.status(500).json({ error: 'Failed to fetch shift roster' });
  }
});

// ── POST /api/hr/shift-assignments (Assign Roster Slot with Strict Validations)
router.post('/shift-assignments', requireHrAdmin, async (req, res) => {
  try {
    const { employeeId, shiftDate, shiftName, department, isOnCall, notes, allowOverwrite } = req.body;
    const hospitalId = req.user.hospitalId || 1;

    if (!employeeId || !shiftDate || !shiftName) {
      return res.status(400).json({ error: 'Missing required roster fields (employeeId, shiftDate, shiftName)' });
    }

    // 1. Fetch employee & validate status
    const empRes = await query('SELECT * FROM employees WHERE id = $1 AND hospital_id = $2;', [employeeId, hospitalId]);
    if (empRes.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const emp = empRes.rows[0];

    if (!emp.is_active || ['Inactive', 'Resigned', 'Terminated'].includes(emp.status)) {
      return res.status(400).json({ error: `Cannot schedule shift: Employee ${emp.name} is ${emp.status || 'Inactive'}.` });
    }

    // 2. Validation: Prevent clinical scheduling when medical license is expired
    const isClinical = ['Doctor', 'Nurse', 'Surgeon', 'Clinical'].includes(emp.category) ||
      ['Doctor', 'Physician', 'Surgeon', 'Nurse', 'Medical Officer'].some(term => (emp.designation || '').toLowerCase().includes(term.toLowerCase()));

    if (isClinical) {
      const today = new Date().toISOString().split('T')[0];
      if (emp.license_expiry) {
        const expiryStr = emp.license_expiry.toISOString().split('T')[0];
        if (expiryStr < shiftDate || expiryStr < today) {
          return res.status(400).json({
            error: `Cannot schedule clinical shift: Clinical license (${emp.license_number || 'N/A'}) expired on ${expiryStr}. License renewal is required.`
          });
        }
      }

      // Check credentials table for expired clinical credentials
      const credRes = await query(`
        SELECT * FROM employee_credentials 
        WHERE employee_id = $1 AND (valid_until < CURRENT_DATE OR valid_until < $2::date)
        ORDER BY valid_until ASC LIMIT 1;
      `, [employeeId, shiftDate]);

      if (credRes.rows.length > 0) {
        const c = credRes.rows[0];
        const expStr = c.valid_until.toISOString().split('T')[0];
        return res.status(400).json({
          error: `Cannot schedule clinical shift: Credential '${c.credential_type}' (${c.license_no}) expired on ${expStr}. License renewal is required.`
        });
      }
    }

    // 3. Validation: Prevent employee being scheduled while on approved leave
    const leaveRes = await query(`
      SELECT * FROM leave_requests 
      WHERE employee_id = $1 AND status = 'Approved' 
        AND $2::date >= start_date AND $2::date <= end_date;
    `, [employeeId, shiftDate]);

    if (leaveRes.rows.length > 0) {
      const leave = leaveRes.rows[0];
      return res.status(400).json({
        error: `Cannot schedule shift: Employee ${emp.name} is on approved ${leave.leave_type} (${leave.start_date.toISOString().split('T')[0]} to ${leave.end_date.toISOString().split('T')[0]}).`
      });
    }

    // 4. Validation: Prevent same employee being assigned to overlapping shifts
    const existingRes = await query(`
      SELECT * FROM shift_assignments 
      WHERE employee_id = $1 AND shift_date = $2;
    `, [employeeId, shiftDate]);

    const isConflict = existingRes.rows.length > 0 && existingRes.rows[0].shift_name !== shiftName;
    const oldAssignment = isConflict ? existingRes.rows[0] : null;

    if (isConflict) {
      if (!allowOverwrite) {
        return res.status(400).json({
          error: `Conflict detected: ${emp.name} is already assigned to "${existingRes.rows[0].shift_name}" on ${shiftDate}. Overlapping shift assignments are not permitted.`
        });
      }

      // Security check: Only authenticated Administrators can override shift conflicts
      const isAuthorizedAdmin = req.user.isAdmin || ['ROLE_ADMIN', 'ROLE_SUPERADMIN'].includes(req.user.role);
      if (!isAuthorizedAdmin) {
        return res.status(403).json({
          error: 'Unauthorized: Only hospital administrators are permitted to override clinical shift conflicts.'
        });
      }

      // Require explicit justification
      const overrideReason = req.body.overrideReason || req.body.reason;
      if (!overrideReason || !overrideReason.trim()) {
        return res.status(400).json({
          error: 'Shift override justification is strictly mandatory to override an existing clinical shift assignment.'
        });
      }
    }

    const sql = `
      INSERT INTO shift_assignments (
        hospital_id, employee_id, shift_date, shift_name, department, is_on_call, notes, assigned_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (employee_id, shift_date) DO UPDATE SET
        shift_name = EXCLUDED.shift_name,
        department = EXCLUDED.department,
        is_on_call = EXCLUDED.is_on_call,
        notes = EXCLUDED.notes,
        assigned_by = EXCLUDED.assigned_by
      RETURNING *;
    `;

    const result = await query(sql, [
      hospitalId,
      employeeId,
      shiftDate,
      shiftName,
      department || emp.department || 'General',
      isOnCall || false,
      notes || null,
      req.user.username,
    ]);

    if (isConflict && allowOverwrite) {
      await logAudit({
        hospitalId,
        userId: req.user.userId,
        actorUsername: req.user.username,
        employeeId,
        employeeName: emp.name,
        action: 'SHIFT_OVERRIDE',
        entityType: 'SHIFT_ASSIGNMENT',
        entityId: result.rows[0].id,
        reason: req.body.overrideReason || req.body.reason,
        oldValue: oldAssignment,
        newValue: result.rows[0],
      });
    } else {
      await logAudit({
        hospitalId,
        userId: req.user.userId,
        actorUsername: req.user.username,
        employeeId,
        employeeName: emp.name,
        action: 'ROSTER_ASSIGNED',
        entityType: 'SHIFT_ASSIGNMENT',
        entityId: result.rows[0].id,
        newValue: result.rows[0],
      });
    }

    return res.status(201).json({
      message: 'Roster slot assigned successfully',
      assignment: result.rows[0],
    });
  } catch (err) {
    console.error('Error assigning roster slot:', err);
    return res.status(400).json({ error: err.message || 'Failed to assign shift roster' });
  }
});

// ── DELETE /api/hr/shift-assignments/:id (Remove Roster Slot with Audit) ────
router.delete('/shift-assignments/:id', requireHrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const hospitalId = req.user.hospitalId || 1;

    const existing = await query('SELECT * FROM shift_assignments WHERE id = $1 AND hospital_id = $2', [id, hospitalId]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Shift assignment not found' });

    await query('DELETE FROM shift_assignments WHERE id = $1 AND hospital_id = $2', [id, hospitalId]);

    await logAudit({
      hospitalId,
      userId: req.user.userId,
      actorUsername: req.user.username,
      employeeId: existing.rows[0].employee_id,
      action: 'ROSTER_SLOT_DELETED',
      entityType: 'SHIFT_ASSIGNMENT',
      entityId: id,
      oldValue: existing.rows[0],
      reason: req.body.reason || 'Shift assignment deleted from roster by administrator',
    });

    return res.json({ message: 'Roster slot removed successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
