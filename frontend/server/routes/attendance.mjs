import express from 'express';
import { query, withTransaction } from '../db/index.mjs';
import { requireHrAdmin } from '../middleware/auth.mjs';
import { logAudit } from '../services/audit.mjs';
import { broadcastEvent } from './events.mjs';

const router = express.Router();

function getNowTimeString() {
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Convert time string (e.g. "07:25 AM", "15:00", "07:00") to total minutes from midnight
 */
export function timeStringToMinutes(timeStr) {
  if (!timeStr || timeStr === '--' || timeStr === '---') return 0;
  
  // Format: "07:25 AM" or "07:25 PM"
  const ampmMatch = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = parseInt(ampmMatch[2], 10);
    const meridian = ampmMatch[3].toUpperCase();
    if (meridian === 'PM' && hours < 12) hours += 12;
    if (meridian === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }

  // Format: "15:00" (24-hr)
  const hhmmMatch = timeStr.match(/(\d+):(\d+)/);
  if (hhmmMatch) {
    const hours = parseInt(hhmmMatch[1], 10);
    const minutes = parseInt(hhmmMatch[2], 10);
    return hours * 60 + minutes;
  }

  return 0;
}

/**
 * Extract shift start and end times from shift string
 * e.g. "Morning (07:00 - 15:00)" -> { start: "07:00", end: "15:00" }
 */
export function extractShiftTimes(shiftStr) {
  if (!shiftStr) return { start: '07:00', end: '15:00' };
  const match = shiftStr.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (match) {
    return { start: match[1], end: match[2] };
  }
  if (shiftStr.toLowerCase().includes('evening')) return { start: '15:00', end: '23:00' };
  if (shiftStr.toLowerCase().includes('night')) return { start: '23:00', end: '07:00' };
  if (shiftStr.toLowerCase().includes('general')) return { start: '09:00', end: '17:30' };
  return { start: '07:00', end: '15:00' };
}

/**
 * Robust Attendance & Shift Calculator
 * Handles day shifts as well as 23:00–07:00 overnight shifts crossing midnight accurately.
 */
export function calculateAttendanceMetrics({
  shiftStartStr,
  shiftEndStr,
  clockInStr,
  clockOutStr,
  gracePeriodMinutes = 15,
  halfDayHours = 4.0,
}) {
  const shiftStartMins = timeStringToMinutes(shiftStartStr);
  let shiftEndMins = timeStringToMinutes(shiftEndStr);
  // Overnight shift if scheduled end time is numerically less than start time
  const isNightShift = shiftEndMins < shiftStartMins;
  const effectiveShiftEndMins = isNightShift ? shiftEndMins + 1440 : shiftEndMins;
  const scheduledDurationHours = Math.max(1, parseFloat(((effectiveShiftEndMins - shiftStartMins) / 60).toFixed(2)));

  let lateMinutes = 0;
  let earlyExitMinutes = 0;
  let workHours = 0;
  let overtimeHours = 0;
  let status = 'Present';

  if (clockInStr) {
    let inMins = timeStringToMinutes(clockInStr);
    if (isNightShift && inMins < 720) {
      // Checked in past midnight (e.g. 00:20 AM for a 23:00 shift)
      inMins += 1440;
    }
    lateMinutes = Math.max(0, inMins - shiftStartMins);
    status = lateMinutes > gracePeriodMinutes ? 'Late' : 'Present';
  }

  if (clockInStr && clockOutStr) {
    let inMins = timeStringToMinutes(clockInStr);
    let outMins = timeStringToMinutes(clockOutStr);

    if (isNightShift) {
      if (inMins < 720) inMins += 1440;
      if (outMins < 720 || outMins <= inMins) outMins += 1440;
    } else if (outMins < inMins) {
      // Day/Evening shift extending past midnight
      outMins += 1440;
    }

    if (outMins <= inMins) {
      throw new Error('Invalid check-out: Check-out time cannot be earlier than or equal to check-in time.');
    }

    const totalWorkedMins = outMins - inMins;
    workHours = parseFloat((totalWorkedMins / 60).toFixed(2));

    // Early exit
    earlyExitMinutes = Math.max(0, effectiveShiftEndMins - outMins);

    // Overtime
    overtimeHours = workHours > scheduledDurationHours 
      ? parseFloat((workHours - scheduledDurationHours).toFixed(2)) 
      : 0;

    // Status classification
    if (workHours < halfDayHours) {
      status = 'Half Day';
    } else if (lateMinutes > gracePeriodMinutes) {
      status = 'Late';
    } else {
      status = 'Present';
    }
  }

  return {
    workHours,
    lateMinutes,
    earlyExitMinutes,
    overtimeHours,
    status,
    isNightShift,
    scheduledDurationHours,
  };
}

// ── GET /api/hr/attendance (Comprehensive Filtering & Querying) ─────────────
router.get('/attendance', async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId || 1;
    const {
      date,
      startDate,
      endDate,
      employeeId,
      department,
      status,
      filter,
    } = req.query;

    let sql = `
      SELECT 
        a.id,
        a.employee_id as "staffId",
        a.employee_name as "staffName",
        a.department,
        TO_CHAR(a.attendance_date, 'YYYY-MM-DD') as "date",
        a.assigned_shift as "shift",
        COALESCE(a.shift_start_time, '07:00') as "shiftStartTime",
        COALESCE(a.shift_end_time, '15:00') as "shiftEndTime",
        a.clock_in as "checkIn",
        a.clock_out as "checkOut",
        a.attendance_status as "status",
        COALESCE(a.work_hours, 0) as "workHours",
        COALESCE(a.late_minutes, 0) as "lateMinutes",
        COALESCE(a.early_exit_minutes, 0) as "earlyExitMinutes",
        COALESCE(a.overtime_hours, 0) as "overtimeHours",
        a.remarks,
        a.attendance_source as "source",
        e.duty_status as "currentDutyStatus",
        e.category as "category",
        e.designation as "designation",
        e.is_active as "isActive"
      FROM attendance a
      JOIN employees e ON e.id = a.employee_id
      WHERE a.hospital_id = $1
    `;
    const params = [hospitalId];
    let pIdx = 2;

    const cleanDate = date && String(date).trim() ? String(date).split('T')[0] : null;
    const cleanStartDate = startDate && String(startDate).trim() ? String(startDate).split('T')[0] : null;
    const cleanEndDate = endDate && String(endDate).trim() ? String(endDate).split('T')[0] : null;

    if (cleanStartDate && cleanEndDate) {
      sql += ` AND a.attendance_date BETWEEN $${pIdx} AND $${pIdx + 1}`;
      params.push(cleanStartDate, cleanEndDate);
      pIdx += 2;
    } else if (cleanDate) {
      sql += ` AND a.attendance_date = $${pIdx}`;
      params.push(cleanDate);
      pIdx++;
    } else {
      // Default: recent history (last 30 days) to prevent 0-record blackout on date roll-over
      sql += ` AND a.attendance_date >= (CURRENT_DATE - INTERVAL '30 days')`;
    }

    if (employeeId) {
      sql += ` AND a.employee_id = $${pIdx}`;
      params.push(employeeId);
      pIdx++;
    }

    if (department && department !== 'All') {
      sql += ` AND a.department = $${pIdx}`;
      params.push(department);
      pIdx++;
    }

    if (status && status !== 'All') {
      sql += ` AND a.attendance_status = $${pIdx}`;
      params.push(status);
      pIdx++;
    }

    // Quick filter presets
    if (filter === 'late') {
      sql += ` AND (a.late_minutes > 0 OR a.attendance_status = 'Late')`;
    } else if (filter === 'absent') {
      sql += ` AND a.attendance_status = 'Absent'`;
    } else if (filter === 'overtime') {
      sql += ` AND a.overtime_hours > 0`;
    } else if (filter === 'missed_punch') {
      sql += ` AND (a.attendance_status = 'Missed Punch' OR (a.clock_in IS NOT NULL AND a.clock_out IS NULL))`;
    }

    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 500), 1000);
    sql += ` ORDER BY a.attendance_date DESC, a.employee_name ASC LIMIT ${limit};`;

    const result = await query(sql, params);
    const attendanceList = result.rows.map((r) => ({
      ...r,
      date: r.date ? (typeof r.date === 'string' ? r.date.split('T')[0] : new Date(r.date).toISOString().split('T')[0]) : '',
      workHours: parseFloat(r.workHours || 0),
      overtimeHours: parseFloat(r.overtimeHours || 0),
      lateMinutes: parseInt(r.lateMinutes || 0, 10),
      earlyExitMinutes: parseInt(r.earlyExitMinutes || 0, 10),
    }));

    return res.json({
      date: cleanDate || new Date().toISOString().split('T')[0],
      total: attendanceList.length,
      attendance: attendanceList,
    });
  } catch (err) {
    console.error('Error fetching attendance:', err);
    return res.status(500).json({ error: 'Failed to fetch attendance records' });
  }
});

// ── GET /api/hr/attendance/corrections/:attendanceId ─────────────────────────
router.get('/attendance/corrections/:attendanceId', async (req, res) => {
  try {
    const { attendanceId } = req.params;
    const sql = `
      SELECT * FROM attendance_corrections
      WHERE attendance_id = $1
      ORDER BY created_at DESC;
    `;
    const result = await query(sql, [attendanceId]);
    return res.json({ corrections: result.rows });
  } catch (err) {
    console.error('Error fetching attendance corrections:', err);
    return res.status(500).json({ error: 'Failed to fetch correction history' });
  }
});

// ── POST /api/hr/attendance/clock-in ─────────────────────────────────────────
router.post('/attendance/clock-in', async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId || 1;
    // Security: Non-admin users cannot spoof another employee's attendance
    const employeeId = (!req.user.isAdmin && req.user.employeeId) 
      ? req.user.employeeId 
      : (req.body.employeeId || req.user.employeeId);

    if (!employeeId) {
      return res.status(400).json({ error: 'Employee ID is required for clock-in' });
    }

    const today = new Date().toISOString().split('T')[0];
    const clockTime = getNowTimeString();

    const result = await withTransaction(async (client) => {
      // 1. Validate employee
      const empRes = await client.query('SELECT * FROM employees WHERE id = $1 AND hospital_id = $2', [employeeId, hospitalId]);
      if (empRes.rows.length === 0) throw new Error('Employee not found');
      const emp = empRes.rows[0];

      // Validation: Inactive / resigned employees cannot clock in
      if (!emp.is_active || ['Inactive', 'Resigned', 'Terminated'].includes(emp.status)) {
        throw new Error(`Cannot clock in: Employee ${emp.name} is ${emp.status || 'Inactive'}`);
      }

      // 2. Determine shift timing from roster assignment or default shift
      const rosterRes = await client.query(
        `SELECT shift_name FROM shift_assignments WHERE employee_id = $1 AND shift_date = $2 LIMIT 1`,
        [employeeId, today]
      );
      const activeShift = rosterRes.rows[0]?.shift_name || emp.default_shift || 'Morning (07:00 - 15:00)';
      const shiftTimes = extractShiftTimes(activeShift);
      const metrics = calculateAttendanceMetrics({
        shiftStartStr: shiftTimes.start,
        shiftEndStr: shiftTimes.end,
        clockInStr: clockTime,
        gracePeriodMinutes: 15,
      });

      // 3. Update employee duty_status
      await client.query(`UPDATE employees SET duty_status = 'On Duty', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [employeeId]);

      // 4. Upsert attendance record for today (never overwrite old days)
      const attId = `ATT-${employeeId}-${today}`;
      const attSql = `
        INSERT INTO attendance (
          id, hospital_id, employee_id, employee_name, department, attendance_date,
          assigned_shift, shift_start_time, shift_end_time, clock_in,
          late_minutes, attendance_status, work_hours, overtime_hours, early_exit_minutes, attendance_source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, 0, 0, 'Staff Portal')
        ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
          clock_in = COALESCE(attendance.clock_in, EXCLUDED.clock_in),
          assigned_shift = EXCLUDED.assigned_shift,
          shift_start_time = EXCLUDED.shift_start_time,
          shift_end_time = EXCLUDED.shift_end_time,
          late_minutes = CASE 
            WHEN attendance.clock_in IS NOT NULL THEN attendance.late_minutes 
            ELSE EXCLUDED.late_minutes 
          END,
          attendance_status = CASE 
            WHEN attendance.clock_out IS NOT NULL THEN attendance.attendance_status 
            WHEN attendance.clock_in IS NOT NULL THEN attendance.attendance_status
            ELSE EXCLUDED.attendance_status 
          END,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *;
      `;

      const attRes = await client.query(attSql, [
        attId, hospitalId, employeeId, emp.name, emp.department, today,
        activeShift, shiftTimes.start, shiftTimes.end, clockTime,
        metrics.lateMinutes, metrics.status
      ]);

      await logAudit({
        client,
        hospitalId,
        userId: req.user.userId,
        actorUsername: req.user.username,
        employeeId,
        employeeName: emp.name,
        action: 'ATTENDANCE_CLOCK_IN',
        entityType: 'ATTENDANCE',
        entityId: attId,
        newValue: { 
          clockIn: attRes.rows[0].clock_in, 
          status: attRes.rows[0].attendance_status, 
          lateMinutes: attRes.rows[0].late_minutes 
        },
      });

      return attRes.rows[0];
    });

    // Real-time broadcast after successful database commit
    broadcastEvent('ATTENDANCE_UPDATE', {
      staffId: employeeId,
      status: result.attendance_status,
      dutyStatus: 'On Duty',
      attendance: result,
    });

    return res.json({ message: 'Clock-in recorded successfully', attendance: result });
  } catch (err) {
    console.error('Error in clock-in:', err);
    return res.status(400).json({ error: err.message || 'Failed to record clock-in' });
  }
});

// ── POST /api/hr/attendance/clock-out ────────────────────────────────────────
router.post('/attendance/clock-out', async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId || 1;
    // Security: Non-admin users cannot spoof another employee's attendance
    const employeeId = (!req.user.isAdmin && req.user.employeeId) 
      ? req.user.employeeId 
      : (req.body.employeeId || req.user.employeeId);

    if (!employeeId) {
      return res.status(400).json({ error: 'Employee ID is required for clock-out' });
    }

    const today = new Date().toISOString().split('T')[0];
    const clockTime = getNowTimeString();

    const result = await withTransaction(async (client) => {
      // 1. Fetch today's attendance record & employee
      const attRes = await client.query(
        `SELECT * FROM attendance WHERE employee_id = $1 AND attendance_date = $2`,
        [employeeId, today]
      );
      if (attRes.rows.length === 0 || !attRes.rows[0].clock_in) {
        throw new Error('No clock-in record found for today. Please clock in first.');
      }

      const att = attRes.rows[0];

      // Check employee status
      const empRes = await client.query('SELECT * FROM employees WHERE id = $1 AND hospital_id = $2', [employeeId, hospitalId]);
      if (empRes.rows.length > 0) {
        const emp = empRes.rows[0];
        if (!emp.is_active || ['Inactive', 'Resigned', 'Terminated'].includes(emp.status)) {
          throw new Error(`Cannot clock out: Employee ${emp.name} is ${emp.status || 'Inactive'}`);
        }
      }

      // Calculate shift metrics with overnight shift handling
      const shiftTimes = extractShiftTimes(att.assigned_shift || '07:00 - 15:00');
      const shiftStartStr = att.shift_start_time || shiftTimes.start;
      const shiftEndStr = att.shift_end_time || shiftTimes.end;

      const metrics = calculateAttendanceMetrics({
        shiftStartStr,
        shiftEndStr,
        clockInStr: att.clock_in,
        clockOutStr: clockTime,
      });

      // 2. Overtime compliance rule: payable overtime must be approved in overtime_records
      const otApprovalRes = await client.query(
        `SELECT COALESCE(SUM(extra_hours), 0) as approved_ot 
         FROM overtime_records 
         WHERE employee_id = $1 AND overtime_date = $2 AND status = 'Approved'`,
        [employeeId, today]
      );
      const approvedOtHours = parseFloat(otApprovalRes.rows[0]?.approved_ot || 0);

      // Status logic: if total work hours < 4, flag as Half-Day
      const finalStatus = metrics.workHours < 4.0 
        ? 'Half-Day' 
        : (metrics.lateMinutes > 15 ? 'Late' : 'Present');

      // 3. Update employee duty_status
      await client.query(`UPDATE employees SET duty_status = 'Off Duty', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [employeeId]);

      // 4. Update attendance record
      const updateSql = `
        UPDATE attendance SET
          clock_out = $1,
          work_hours = $2,
          early_exit_minutes = $3,
          overtime_hours = $4,
          attendance_status = $5,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING *;
      `;

      const updatedAtt = await client.query(updateSql, [
        clockTime, metrics.workHours, metrics.earlyExitMinutes, approvedOtHours, finalStatus, att.id
      ]);

      await logAudit({
        client,
        hospitalId,
        userId: req.user.userId,
        actorUsername: req.user.username,
        employeeId,
        employeeName: att.employee_name,
        action: 'ATTENDANCE_CLOCK_OUT',
        entityType: 'ATTENDANCE',
        entityId: att.id,
        newValue: { 
          clockOut: clockTime, 
          workHours: metrics.workHours, 
          earlyExitMinutes: metrics.earlyExitMinutes, 
          overtimeHours: approvedOtHours, 
          status: finalStatus 
        },
      });

      return updatedAtt.rows[0];
    });

    // Real-time broadcast after successful database commit
    broadcastEvent('ATTENDANCE_UPDATE', {
      staffId: employeeId,
      status: result.attendance_status,
      dutyStatus: 'Off Duty',
      attendance: result,
    });

    return res.json({ message: 'Clock-out recorded successfully', attendance: result });
  } catch (err) {
    console.error('Error in clock-out:', err);
    return res.status(400).json({ error: err.message || 'Failed to record clock-out' });
  }
});

// ── POST /api/hr/attendance/toggle ──────────────────────────────────────────
router.post('/attendance/toggle', async (req, res) => {
  try {
    const { staffId, currentDuty } = req.body;
    const nextStatus = currentDuty === 'On Duty' ? 'Off Duty' : 'On Duty';

    req.body.employeeId = staffId;
    if (nextStatus === 'On Duty') {
      return router.handle({ ...req, url: '/attendance/clock-in', method: 'POST' }, res);
    } else {
      return router.handle({ ...req, url: '/attendance/clock-out', method: 'POST' }, res);
    }
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// ── POST /api/hr/attendance/manual (HR Manual Entry) ────────────────────────
router.post('/attendance/manual', requireHrAdmin, async (req, res) => {
  try {
    const {
      employeeId,
      date,
      status,
      shift,
      clockIn,
      clockOut,
      reason,
    } = req.body;
    const hospitalId = req.user.hospitalId || 1;

    if (!employeeId || !date || !status || !reason) {
      return res.status(400).json({ error: 'employeeId, date, status, and reason are required' });
    }

    const result = await withTransaction(async (client) => {
      // 1. Fetch employee
      const empRes = await client.query('SELECT * FROM employees WHERE id = $1 AND hospital_id = $2', [employeeId, hospitalId]);
      if (empRes.rows.length === 0) throw new Error('Employee not found');
      const emp = empRes.rows[0];

      // Block inactive / resigned / terminated staff from attendance entry
      if (!emp.is_active || ['Inactive', 'Resigned', 'Terminated'].includes(emp.status)) {
        throw new Error(`Cannot record attendance: Employee ${emp.name} is ${emp.status || 'Inactive'}`);
      }

      // Shift timings & overnight calculation
      const shiftTimes = extractShiftTimes(shift || emp.default_shift);
      let workHours = 0;
      let lateMins = 0;
      let earlyExitMins = 0;
      let overtimeHours = 0;
      let derivedStatus = status;

      if (clockIn) {
        const metrics = calculateAttendanceMetrics({
          shiftStartStr: shiftTimes.start,
          shiftEndStr: shiftTimes.end,
          clockInStr: clockIn,
          clockOutStr: clockOut || null,
        });
        workHours = metrics.workHours;
        lateMins = metrics.lateMinutes;
        earlyExitMins = metrics.earlyExitMinutes;
        overtimeHours = metrics.overtimeHours;
        if (!status || status === 'Present' || status === 'Late') {
          derivedStatus = metrics.status;
        }
      }

      const attId = `ATT-${employeeId}-${date}`;
      const upsertSql = `
        INSERT INTO attendance (
          id, hospital_id, employee_id, employee_name, department, attendance_date,
          assigned_shift, shift_start_time, shift_end_time, clock_in, clock_out,
          attendance_status, work_hours, late_minutes, early_exit_minutes, overtime_hours,
          remarks, attendance_source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'Manual')
        ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
          attendance_status = EXCLUDED.attendance_status,
          clock_in = EXCLUDED.clock_in,
          clock_out = EXCLUDED.clock_out,
          work_hours = EXCLUDED.work_hours,
          late_minutes = EXCLUDED.late_minutes,
          early_exit_minutes = EXCLUDED.early_exit_minutes,
          overtime_hours = EXCLUDED.overtime_hours,
          remarks = EXCLUDED.remarks,
          attendance_source = 'Manual',
          updated_at = CURRENT_TIMESTAMP
        RETURNING *;
      `;

      const attRes = await client.query(upsertSql, [
        attId, hospitalId, employeeId, emp.name, emp.department, date,
        shift || emp.default_shift, shiftTimes.start, shiftTimes.end,
        clockIn || null, clockOut || null, derivedStatus, workHours, lateMins, earlyExitMins, overtimeHours,
        reason
      ]);

      await logAudit({
        client,
        hospitalId,
        userId: req.user.userId,
        actorUsername: req.user.username,
        employeeId,
        employeeName: emp.name,
        action: 'ATTENDANCE_MANUAL_ENTRY',
        entityType: 'ATTENDANCE',
        entityId: attId,
        reason,
        newValue: attRes.rows[0],
      });

      return attRes.rows[0];
    });

    broadcastEvent('ATTENDANCE_UPDATE', {
      staffId: employeeId,
      status: result.attendance_status,
      attendance: result,
    });

    return res.status(201).json({ message: 'Manual attendance recorded successfully', attendance: result });
  } catch (err) {
    console.error('Error recording manual attendance:', err);
    return res.status(400).json({ error: err.message || 'Failed to record manual attendance' });
  }
});

// ── POST /api/hr/attendance/correct (Audit-backed correction with recalculation)
router.post('/attendance/correct', requireHrAdmin, async (req, res) => {
  try {
    const { attendanceId } = req.body;
    const clockInParam = req.body.newClockIn !== undefined ? req.body.newClockIn : req.body.clockIn;
    const clockOutParam = req.body.newClockOut !== undefined ? req.body.newClockOut : req.body.clockOut;
    const statusParam = req.body.newStatus !== undefined ? req.body.newStatus : req.body.status;
    const reasonParam = req.body.correctionReason || req.body.reason;
    const hospitalId = req.user.hospitalId || 1;

    if (!attendanceId || !reasonParam) {
      return res.status(400).json({ error: 'attendanceId and correctionReason (or reason) are mandatory for attendance corrections' });
    }

    const result = await withTransaction(async (client) => {
      const oldRes = await client.query(
        'SELECT * FROM attendance WHERE id = $1 AND hospital_id = $2 FOR UPDATE',
        [attendanceId, hospitalId]
      );
      if (oldRes.rows.length === 0) throw new Error('Attendance record not found');
      const old = oldRes.rows[0];

      const clockInToUse = clockInParam !== undefined ? clockInParam : old.clock_in;
      const clockOutToUse = clockOutParam !== undefined ? clockOutParam : old.clock_out;

      // Recalculate work hours using calculateAttendanceMetrics (handles midnight-crossing shifts)
      let workHours = old.work_hours;
      let lateMins = old.late_minutes;
      let earlyExitMins = old.early_exit_minutes;
      let overtime = old.overtime_hours;
      let newStatus = statusParam || old.attendance_status;

      if (clockInToUse) {
        const shiftTimes = extractShiftTimes(old.assigned_shift);
        const metrics = calculateAttendanceMetrics({
          shiftStartStr: old.shift_start_time || shiftTimes.start,
          shiftEndStr: old.shift_end_time || shiftTimes.end,
          clockInStr: clockInToUse,
          clockOutStr: clockOutToUse || null,
        });
        workHours = metrics.workHours;
        lateMins = metrics.lateMinutes;
        earlyExitMins = metrics.earlyExitMinutes;
        overtime = metrics.overtimeHours;
        if (!statusParam) {
          newStatus = metrics.status;
        }
      }

      // Insert correction log record into attendance_corrections table
      await client.query(`
        INSERT INTO attendance_corrections (
          attendance_id, employee_id, old_clock_in, new_clock_in,
          old_clock_out, new_clock_out, old_status, new_status,
          correction_reason, corrected_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);
      `, [
        attendanceId, old.employee_id, old.clock_in, clockInToUse,
        old.clock_out, clockOutToUse, old.attendance_status, statusParam || old.attendance_status,
        reasonParam, req.user.username
      ]);

      // Update attendance table
      const updateRes = await client.query(`
        UPDATE attendance SET
          clock_in = $1,
          clock_out = $2,
          attendance_status = COALESCE($3, attendance_status),
          work_hours = $4,
          late_minutes = $5,
          early_exit_minutes = $6,
          overtime_hours = $7,
          remarks = $8,
          attendance_source = 'Manual',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $9
        RETURNING *;
      `, [
        clockInToUse, clockOutToUse, statusParam || null, workHours, lateMins, earlyExitMins, overtime,
        reasonParam, attendanceId
      ]);

      await logAudit({
        client,
        hospitalId,
        userId: req.user.userId,
        actorUsername: req.user.username,
        employeeId: old.employee_id,
        employeeName: old.employee_name,
        action: 'ATTENDANCE_CORRECTED',
        entityType: 'ATTENDANCE',
        entityId: attendanceId,
        reason: reasonParam,
        oldValue: old,
        newValue: updateRes.rows[0],
      });

      return updateRes.rows[0];
    });

    broadcastEvent('ATTENDANCE_UPDATE', {
      attendanceId,
      status: result.attendance_status,
      attendance: result,
    });

    return res.json({ message: 'Attendance correction recorded successfully', attendance: result });
  } catch (err) {
    console.error('Error correcting attendance:', err);
    return res.status(400).json({ error: err.message || 'Failed to correct attendance' });
  }
});

export default router;
