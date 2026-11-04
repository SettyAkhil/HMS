import net from 'node:net';
import { query, withTransaction } from '../db/index.mjs';
import { extractShiftTimes, calculateAttendanceMetrics } from '../routes/attendance.mjs';
import { broadcastEvent } from '../routes/events.mjs';
import { logAudit } from './audit.mjs';

/**
 * Extract exact clock time string (e.g. "07:10 AM") preserving the original device string
 */
export function formatClockTimeString(input) {
  if (typeof input === 'string') {
    const timeMatch = input.match(/(?:T|\s)(\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/);
    const directMatch = input.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
    const m = timeMatch || directMatch;
    if (m) {
      let h = parseInt(m[1], 10);
      const mins = m[2];
      const ampm = m[3];
      if (ampm) {
        return `${String(h).padStart(2, '0')}:${mins} ${ampm.toUpperCase()}`;
      }
      const period = h >= 12 ? 'PM' : 'AM';
      if (h > 12) h -= 12;
      if (h === 0) h = 12;
      return `${String(h).padStart(2, '0')}:${mins} ${period}`;
    }
  }
  const dateObj = input instanceof Date ? input : new Date(input);
  return dateObj.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Genuine TCP Socket probe for hardware terminals (Port 4370 or specified port).
 * Never fabricates latency or status; reports true TCP connection result.
 */
export function probeDeviceSocket(host, port = 4370, timeoutMs = 2500) {
  return new Promise((resolve) => {
    if (!host) {
      return resolve({ reachable: false, error: 'No IP address provided' });
    }
    const startTime = Date.now();
    const socket = new net.Socket();
    let resolved = false;

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      const latencyMs = Date.now() - startTime;
      socket.destroy();
      if (!resolved) {
        resolved = true;
        resolve({ reachable: true, latencyMs });
      }
    });

    socket.on('timeout', () => {
      socket.destroy();
      if (!resolved) {
        resolved = true;
        resolve({ reachable: false, error: `Connection timed out (${timeoutMs}ms) to ${host}:${port}` });
      }
    });

    socket.on('error', (err) => {
      socket.destroy();
      if (!resolved) {
        resolved = true;
        resolve({ reachable: false, error: `${err.code || 'ECONNREFUSED'}: Failed to connect to ${host}:${port}` });
      }
    });

    try {
      socket.connect(port, host);
    } catch (err) {
      if (!resolved) {
        resolved = true;
        resolve({ reachable: false, error: err.message });
      }
    }
  });
}

/**
 * Parse standard eSSL / ZKTeco Cloud Server (ADMS / iClock) ATTLOG text lines
 * Format: UserPIN\tPunchTime\tStatus\tVerifyType\tWorkCode...
 */
export function parseAdmsAttLog(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const punches = [];

  for (const line of lines) {
    // Delimited by tabs or commas
    const parts = line.includes('\t') ? line.split('\t') : line.split(',');
    if (parts.length >= 2) {
      const deviceUserId = parts[0].trim();
      const rawTime = parts[1].trim(); // e.g. "2026-10-26 08:05:00"
      const statusBit = parts[2] ? parts[2].trim() : '0'; // 0=IN, 1=OUT
      const verifyBit = parts[3] ? parts[3].trim() : '1'; // 1=FP, 15=Face, 4=Card

      let direction = 'IN';
      if (statusBit === '1' || statusBit.toUpperCase() === 'OUT' || statusBit === '5') {
        direction = 'OUT';
      }

      let verifyMode = 'Fingerprint';
      if (verifyBit === '15' || verifyBit.toLowerCase().includes('face')) verifyMode = 'Face ID';
      else if (verifyBit === '4' || verifyBit.toLowerCase().includes('card') || verifyBit.toLowerCase().includes('rfid')) verifyMode = 'RFID Card';
      else if (verifyBit === '2' || verifyBit.toLowerCase().includes('pass')) verifyMode = 'Password';

      // Validate date
      const parsedDate = new Date(rawTime.replace(' ', 'T'));
      if (!isNaN(parsedDate.getTime())) {
        punches.push({
          deviceUserId,
          punchTime: parsedDate,
          direction,
          verifyMode,
          rawLine: line,
        });
      }
    }
  }

  return punches;
}

/**
 * Ingest and process a biometric punch into PostgreSQL with de-duplication,
 * shift compliance, and real-time SSE broadcasting.
 */
export async function processBiometricPunch({
  deviceSn,
  deviceId,
  deviceUserId,
  punchTime,
  direction = 'IN',
  verifyMode = 'Fingerprint',
  rawPayload = null,
  hospitalId = 1,
  overrideActor = null,
}) {
  if (!deviceUserId) {
    throw new Error('Device user ID (PIN) is required for biometric processing');
  }

  const punchDateObj = punchTime instanceof Date ? punchTime : new Date(punchTime);
  if (isNaN(punchDateObj.getTime())) {
    throw new Error('Invalid punch timestamp provided');
  }

  const punchDateStr = typeof punchTime === 'string' && /^\d{4}-\d{2}-\d{2}/.test(punchTime)
    ? punchTime.substring(0, 10)
    : punchDateObj.toISOString().split('T')[0];
  const clockTimeString = formatClockTimeString(punchTime || punchDateObj);

  return await withTransaction(async (client) => {
    // ── 1. Device Verification & Heartbeat ─────────────────────────────────────
    let verifiedDeviceId = deviceId || null;
    let verifiedDeviceName = 'Biometric Terminal';
    let verifiedLocation = 'Hospital Entrance';

    if (deviceSn || deviceId) {
      const devRes = await client.query(
        `SELECT id, device_name, location, serial_number FROM biometric_devices 
         WHERE serial_number = $1 OR id = $2 OR device_name = $2 LIMIT 1`,
        [deviceSn || '', deviceId || '']
      );

      if (devRes.rows.length > 0) {
        const d = devRes.rows[0];
        verifiedDeviceId = d.id;
        verifiedDeviceName = d.device_name;
        verifiedLocation = d.location;

        // Update real heartbeat and log count
        await client.query(
          `UPDATE biometric_devices 
           SET last_heartbeat = CURRENT_TIMESTAMP, status = 'online', total_logs_count = total_logs_count + 1, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $1`,
          [d.id]
        );
      }
    }

    // ── 2. Idempotency & De-duplication Check ─────────────────────────────────
    // Prevent duplicate processing if machine retried sending the same punch
    const existingPunchRes = await client.query(
      `SELECT id, status, employee_id, attendance_id FROM biometric_punches 
       WHERE device_sn = $1 AND device_user_id = $2 AND punch_time = $3`,
      [deviceSn || 'UNKNOWN-SN', String(deviceUserId), punchDateObj]
    );

    if (existingPunchRes.rows.length > 0) {
      return {
        status: 'DUPLICATE',
        message: 'Punch event already processed and recorded',
        punchId: existingPunchRes.rows[0].id,
        attendanceId: existingPunchRes.rows[0].attendance_id,
        isDuplicate: true,
      };
    }

    // ── 3. Employee Lookup & Mapping ──────────────────────────────────────────
    // Match by biometric_pin, exact ID, or EMP-xxx numeric mapping
    const cleanPin = String(deviceUserId).trim();
    const cleanId = cleanPin.startsWith('EMP-') ? cleanPin : `EMP-${cleanPin}`;

    const empRes = await client.query(
      `SELECT id, name, department, designation, default_shift, status, is_active, duty_status 
       FROM employees 
       WHERE (biometric_pin = $1 OR id = $1 OR id = $2 OR (biometric_pin IS NULL AND id LIKE '%' || $1)) 
         AND hospital_id = $3
       LIMIT 1`,
      [cleanPin, cleanId, hospitalId]
    );

    // If Employee is not mapped: Store raw punch as UNMAPPED for audit
    if (empRes.rows.length === 0) {
      const unmappedPunchRes = await client.query(
        `INSERT INTO biometric_punches (
          hospital_id, device_sn, device_id, device_user_id, employee_id, employee_name,
          punch_time, punch_date, direction, verify_mode, raw_payload, status, error_reason
        ) VALUES ($1, $2, $3, $4, NULL, NULL, $5, $6, $7, $8, $9, 'UNMAPPED_EMPLOYEE', $10)
        RETURNING *;`,
        [
          hospitalId,
          deviceSn || 'UNKNOWN-SN',
          verifiedDeviceId,
          cleanPin,
          punchDateObj,
          punchDateStr,
          direction,
          verifyMode,
          typeof rawPayload === 'object' ? JSON.stringify(rawPayload) : (rawPayload || ''),
          `Device user PIN '${cleanPin}' not mapped to any hospital employee record`,
        ]
      );

      // Broadcast warning to HR Dashboard
      broadcastEvent('BIOMETRIC_UNMAPPED', {
        deviceUserId: cleanPin,
        deviceSn: deviceSn || 'UNKNOWN-SN',
        punchTime: punchDateObj.toISOString(),
        direction,
      });

      return {
        status: 'UNMAPPED_EMPLOYEE',
        message: `Device PIN '${cleanPin}' not mapped to any active employee`,
        punchId: unmappedPunchRes.rows[0].id,
      };
    }

    const emp = empRes.rows[0];

    // Check employment status
    if (!emp.is_active || ['Inactive', 'Resigned', 'Terminated'].includes(emp.status)) {
      const inactivePunchRes = await client.query(
        `INSERT INTO biometric_punches (
          hospital_id, device_sn, device_id, device_user_id, employee_id, employee_name,
          punch_time, punch_date, direction, verify_mode, raw_payload, status, error_reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ERROR', $12)
        RETURNING *;`,
        [
          hospitalId,
          deviceSn || 'UNKNOWN-SN',
          verifiedDeviceId,
          cleanPin,
          emp.id,
          emp.name,
          punchDateObj,
          punchDateStr,
          direction,
          verifyMode,
          typeof rawPayload === 'object' ? JSON.stringify(rawPayload) : (rawPayload || ''),
          `Employee ${emp.name} is ${emp.status || 'Inactive'}`,
        ]
      );

      return {
        status: 'REJECTED',
        message: `Employee ${emp.name} is ${emp.status || 'Inactive'}`,
        punchId: inactivePunchRes.rows[0].id,
      };
    }

    // ── 4. Rapid Scan De-bounce (2 Minutes Window) ────────────────────────────
    // If the employee tapped twice within 2 minutes (e.g. accidental double tap), log it but don't toggle attendance
    const recentPunchRes = await client.query(
      `SELECT punch_time FROM biometric_punches 
       WHERE employee_id = $1 AND punch_time >= ($2::timestamptz - INTERVAL '2 minutes') AND status = 'PROCESSED'
       ORDER BY punch_time DESC LIMIT 1`,
      [emp.id, punchDateObj]
    );

    if (recentPunchRes.rows.length > 0) {
      const rapidRes = await client.query(
        `INSERT INTO biometric_punches (
          hospital_id, device_sn, device_id, device_user_id, employee_id, employee_name,
          punch_time, punch_date, direction, verify_mode, raw_payload, status, error_reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'RAPID_REPEAT', 'Repeated swipe within cooldown window')
        RETURNING *;`,
        [
          hospitalId,
          deviceSn || 'UNKNOWN-SN',
          verifiedDeviceId,
          cleanPin,
          emp.id,
          emp.name,
          punchDateObj,
          punchDateStr,
          direction,
          verifyMode,
          typeof rawPayload === 'object' ? JSON.stringify(rawPayload) : (rawPayload || ''),
        ]
      );

      return {
        status: 'RAPID_REPEAT',
        message: `Repeat punch within cooldown period ignored for ${emp.name}`,
        punchId: rapidRes.rows[0].id,
      };
    }

    // ── 5. Shift Assignment & Compliance Engine ────────────────────────────────
    // Look up date-based duty roster assignment, or fallback to default shift
    const rosterRes = await client.query(
      `SELECT shift_name FROM shift_assignments WHERE employee_id = $1 AND shift_date = $2 LIMIT 1`,
      [emp.id, punchDateStr]
    );

    const activeShift = rosterRes.rows[0]?.shift_name || emp.default_shift || 'Morning (07:00 - 15:00)';
    const shiftTimes = extractShiftTimes(activeShift);

    // Look up today's attendance record for this employee
    const attRes = await client.query(
      `SELECT * FROM attendance WHERE employee_id = $1 AND attendance_date = $2 FOR UPDATE`,
      [emp.id, punchDateStr]
    );

    let attendanceRecord = null;
    const attId = `ATT-${emp.id}-${punchDateStr}`;

    if (attRes.rows.length === 0) {
      // ── Initial Clock-In of the day ──────────────────────────────────────────
      const metrics = calculateAttendanceMetrics({
        shiftStartStr: shiftTimes.start,
        shiftEndStr: shiftTimes.end,
        clockInStr: clockTimeString,
        gracePeriodMinutes: 15,
      });

      const insertAttSql = `
        INSERT INTO attendance (
          id, hospital_id, employee_id, employee_name, department, attendance_date,
          assigned_shift, shift_start_time, shift_end_time, clock_in,
          late_minutes, attendance_status, work_hours, overtime_hours, early_exit_minutes, attendance_source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, 0, 0, 'Biometric')
        RETURNING *;
      `;

      const newAtt = await client.query(insertAttSql, [
        attId,
        hospitalId,
        emp.id,
        emp.name,
        emp.department,
        punchDateStr,
        activeShift,
        shiftTimes.start,
        shiftTimes.end,
        clockTimeString,
        metrics.lateMinutes,
        metrics.status, // 'Present' or 'Late'
      ]);

      attendanceRecord = newAtt.rows[0];

      // Update employee duty_status to 'On Duty'
      await client.query(`UPDATE employees SET duty_status = 'On Duty', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [emp.id]);
    } else {
      // ── Clock-Out or Subsequent Punch ────────────────────────────────────────
      const existingAtt = attRes.rows[0];
      const initialClockIn = existingAtt.clock_in || clockTimeString;

      const metrics = calculateAttendanceMetrics({
        shiftStartStr: existingAtt.shift_start_time || shiftTimes.start,
        shiftEndStr: existingAtt.shift_end_time || shiftTimes.end,
        clockInStr: initialClockIn,
        clockOutStr: clockTimeString,
        gracePeriodMinutes: 15,
        halfDayHours: 4.0,
      });

      // ── Overtime Compliance Rule ───────────────────────────────────────────
      // Per hospital policy: payable overtime is NOT merely raw difference between
      // shift end and scan; it must be approved in overtime_records.
      const otApprovalRes = await client.query(
        `SELECT COALESCE(SUM(extra_hours), 0) as approved_ot 
         FROM overtime_records 
         WHERE employee_id = $1 AND overtime_date = $2 AND status = 'Approved'`,
        [emp.id, punchDateStr]
      );
      const approvedOtHours = parseFloat(otApprovalRes.rows[0]?.approved_ot || 0);

      // Status logic: if total work hours < 4, flag as Half-Day
      const finalStatus = metrics.workHours < 4.0 
        ? 'Half-Day' 
        : (existingAtt.late_minutes > 15 ? 'Late' : 'Present');

      const updateAttSql = `
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

      const updatedAtt = await client.query(updateAttSql, [
        clockTimeString,
        metrics.workHours,
        metrics.earlyExitMinutes,
        approvedOtHours, // Strictly approved overtime
        finalStatus,
        existingAtt.id,
      ]);

      attendanceRecord = updatedAtt.rows[0];

      // Update duty_status to 'Off Duty' if scanning out
      if (direction === 'OUT') {
        await client.query(`UPDATE employees SET duty_status = 'Off Duty', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [emp.id]);
      }
    }

    // ── 6. Save Raw Punch to biometric_punches Table ──────────────────────────
    const punchInsertRes = await client.query(
      `INSERT INTO biometric_punches (
        hospital_id, device_sn, device_id, device_user_id, employee_id, employee_name,
        punch_time, punch_date, direction, verify_mode, raw_payload, status, attendance_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PROCESSED', $12)
      RETURNING *;`,
      [
        hospitalId,
        deviceSn || 'BIO-GATEWAY',
        verifiedDeviceId,
        cleanPin,
        emp.id,
        emp.name,
        punchDateObj,
        punchDateStr,
        direction,
        verifyMode,
        typeof rawPayload === 'object' ? JSON.stringify(rawPayload) : (rawPayload || ''),
        attendanceRecord.id,
      ]
    );

    const savedPunch = punchInsertRes.rows[0];

    // ── 7. Audit Trail ────────────────────────────────────────────────────────
    await logAudit({
      client,
      hospitalId,
      userId: overrideActor?.userId || 'SYSTEM-BIOMETRIC',
      actorUsername: overrideActor?.username || 'Biometric Service',
      employeeId: emp.id,
      employeeName: emp.name,
      action: direction === 'IN' ? 'BIOMETRIC_CLOCK_IN' : 'BIOMETRIC_CLOCK_OUT',
      entityType: 'ATTENDANCE',
      entityId: attendanceRecord.id,
      newValue: {
        deviceSn,
        deviceId: verifiedDeviceId,
        punchTime: clockTimeString,
        status: attendanceRecord.attendance_status,
        workHours: attendanceRecord.work_hours,
        direction,
        verifyMode,
      },
    });

    // ── 8. Real-Time Broadcast via Server-Sent Events (SSE) ────────────────────
    broadcastEvent('BIOMETRIC_PUNCH', {
      id: `PUNCH-${savedPunch.id}`,
      staffId: emp.id,
      staffName: emp.name,
      department: emp.department,
      deviceId: verifiedDeviceId || 'BIO-01',
      deviceName: verifiedDeviceName,
      location: verifiedLocation,
      punchTime: punchDateObj.toISOString().replace('T', ' ').substring(0, 19),
      direction,
      verifyMode,
      statusCode: 'Valid',
    });

    broadcastEvent('ATTENDANCE_UPDATE', {
      employeeId: emp.id,
      employeeName: emp.name,
      date: punchDateStr,
      clockIn: attendanceRecord.clock_in,
      clockOut: attendanceRecord.clock_out,
      status: attendanceRecord.attendance_status,
      workHours: attendanceRecord.work_hours,
      dutyStatus: direction === 'IN' ? 'On Duty' : 'Off Duty',
    });

    return {
      status: 'PROCESSED',
      message: `Biometric punch processed for ${emp.name} (${direction})`,
      punch: savedPunch,
      attendance: attendanceRecord,
      employee: {
        id: emp.id,
        name: emp.name,
        department: emp.department,
        dutyStatus: direction === 'IN' ? 'On Duty' : 'Off Duty',
      },
    };
  });
}
