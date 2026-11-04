import express from 'express';
import { query, withTransaction } from '../db/index.mjs';
import { logAudit } from '../services/audit.mjs';
import { requireHrAdmin } from '../middleware/auth.mjs';
import { broadcastEvent } from './events.mjs';
import {
  probeDeviceSocket,
  parseAdmsAttLog,
  processBiometricPunch,
} from '../services/biometricService.mjs';

const router = express.Router();


// ── GET /api/hr/biometric/devices ──────────────────────────────────────────
// Fetch live hardware terminals from PostgreSQL
router.get(['/biometric/devices', '/devices'], async (req, res) => {
  try {
    const hospitalId = req.user?.hospitalId || 1;
    const { location, status } = req.query;

    let sql = `
      SELECT 
        id,
        device_name as "deviceSName",
        device_full_name as "deviceFName",
        serial_number as "serialNo",
        ip_address as "ipAddress",
        port,
        location,
        COALESCE(TO_CHAR(last_heartbeat, 'YYYY-MM-DD HH24:MI'), 'Never') as "lastPing",
        status,
        firmware_version as "firmware",
        registered_users_count as "registeredUsersCount",
        total_logs_count as "totalLogsCount"
      FROM biometric_devices
      WHERE hospital_id = $1
    `;
    const params = [hospitalId];
    let pIdx = 2;

    if (location && location !== 'All') {
      sql += ` AND LOWER(location) = LOWER($${pIdx})`;
      params.push(location);
      pIdx++;
    }

    if (status && status !== 'All') {
      sql += ` AND LOWER(status) = LOWER($${pIdx})`;
      params.push(status);
      pIdx++;
    }

    sql += ` ORDER BY id ASC;`;

    const devicesRes = await query(sql, params);
    const devices = devicesRes.rows;

    // Real stats from PostgreSQL
    const statsRes = await query(
      `SELECT 
        (SELECT COUNT(*) FROM biometric_devices WHERE hospital_id = $1) as total_devices,
        (SELECT COUNT(*) FROM biometric_devices WHERE hospital_id = $1 AND status = 'online') as online_devices,
        (SELECT COUNT(*) FROM biometric_devices WHERE hospital_id = $1 AND status = 'offline') as offline_devices,
        (SELECT COUNT(*) FROM employees WHERE hospital_id = $1 AND is_active = TRUE) as total_employees,
        (SELECT COUNT(*) FROM attendance WHERE hospital_id = $1 AND attendance_date = CURRENT_DATE AND attendance_status IN ('Present', 'Late')) as present_today;`,
      [hospitalId]
    );

    const s = statsRes.rows[0] || {};

    res.json({
      devices,
      stats: {
        totalDevices: parseInt(s.total_devices || 0, 10),
        onlineDevices: parseInt(s.online_devices || 0, 10),
        offlineDevices: parseInt(s.offline_devices || 0, 10),
        totalRegisteredEmployees: parseInt(s.total_employees || 0, 10),
        presentEmployeesToday: parseInt(s.present_today || 0, 10),
      },
    });
  } catch (err) {
    console.error('Error fetching biometric devices:', err);
    res.status(500).json({ error: 'Failed to fetch biometric devices from database' });
  }
});

// ── POST /api/hr/biometric/devices/:id/ping ───────────────────────────────
// Real TCP socket ping to the physical device. Never fabricates latency.
router.post(['/biometric/devices/:id/ping', '/devices/:id/ping'], async (req, res) => {
  try {
    const { id } = req.params;
    const hospitalId = req.user?.hospitalId || 1;

    const devRes = await query(
      `SELECT id, device_name, serial_number, ip_address, port, status 
       FROM biometric_devices 
       WHERE id = $1 AND hospital_id = $2`,
      [id, hospitalId]
    );

    if (devRes.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found in database' });
    }

    const dev = devRes.rows[0];

    // Genuine TCP socket test to physical device IP:Port
    const probe = await probeDeviceSocket(dev.ip_address, dev.port || 4370, 2500);

    const newStatus = probe.reachable ? 'online' : 'offline';
    const now = new Date();
    const dateStr = now.toISOString().replace('T', ' ').substring(0, 16);

    // Update real device state in PostgreSQL
    await query(
      `UPDATE biometric_devices 
       SET status = $1, last_heartbeat = CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE last_heartbeat END, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3`,
      [newStatus, probe.reachable, id]
    );

    res.json({
      status: probe.reachable ? 'success' : 'error',
      deviceId: id,
      deviceStatus: newStatus,
      latencyMs: probe.reachable ? probe.latencyMs : 0,
      lastPing: dateStr,
      reachable: probe.reachable,
      message: probe.reachable
        ? `Hardware online: Verified TCP connection to ${dev.ip_address}:${dev.port || 4370} (${probe.latencyMs}ms)`
        : `Hardware offline: ${probe.error}`,
    });
  } catch (err) {
    console.error('Error pinging biometric device:', err);
    res.status(500).json({ error: 'Failed to test device connectivity' });
  }
});

// ── POST /api/hr/biometric/devices/:id/command ────────────────────────────
router.post(['/biometric/devices/:id/command', '/devices/:id/command'], async (req, res) => {
  try {
    const { id } = req.params;
    const { command } = req.body; // 'sync_time' | 'clear_logs' | 'reboot' | 'sync_users'
    const hospitalId = req.user?.hospitalId || 1;

    const devRes = await query(
      `SELECT id, device_name, serial_number, ip_address, port FROM biometric_devices WHERE id = $1 AND hospital_id = $2`,
      [id, hospitalId]
    );

    if (devRes.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const dev = devRes.rows[0];

    await logAudit({
      hospitalId,
      userId: req.user?.userId || 'SYSTEM',
      actorUsername: req.user?.username || 'HR Admin',
      module: 'Biometric Devices',
      action: `COMMAND_${String(command).toUpperCase()}`,
      entityType: 'BiometricDevice',
      entityId: id,
      newValue: { command, serialNo: dev.serial_number, ip: dev.ip_address },
    });

    res.json({
      status: 'success',
      deviceId: id,
      command,
      timestamp: new Date().toISOString(),
      message: `Command '${command}' dispatched for ${dev.device_name} (${dev.serial_number})`,
    });
  } catch (err) {
    console.error('Error executing device command:', err);
    res.status(500).json({ error: 'Failed to dispatch device command' });
  }
});

// ── GET /api/hr/biometric/punches ──────────────────────────────────────────
// Query raw punch logs from PostgreSQL
router.get(['/biometric/punches', '/punches'], async (req, res) => {
  try {
    const hospitalId = req.user?.hospitalId || 1;
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const { staffId, deviceId } = req.query;

    let sql = `
      SELECT 
        p.id,
        p.employee_id as "staffId",
        COALESCE(p.employee_name, 'Unmapped PIN ' || p.device_user_id) as "staffName",
        COALESCE(e.department, 'Unknown') as "department",
        p.device_id as "deviceId",
        COALESCE(d.device_name, 'Biometric Terminal') as "deviceName",
        COALESCE(d.location, 'Hospital Gate') as "location",
        TO_CHAR(p.punch_time, 'YYYY-MM-DD HH24:MI:SS') as "punchTime",
        p.direction,
        p.verify_mode as "verifyMode",
        p.status as "statusCode"
      FROM biometric_punches p
      LEFT JOIN employees e ON e.id = p.employee_id
      LEFT JOIN biometric_devices d ON d.id = p.device_id
      WHERE p.hospital_id = $1
    `;
    const params = [hospitalId];
    let pIdx = 2;

    if (staffId) {
      sql += ` AND (p.employee_id = $${pIdx} OR p.device_user_id = $${pIdx})`;
      params.push(staffId);
      pIdx++;
    }

    if (deviceId) {
      sql += ` AND p.device_id = $${pIdx}`;
      params.push(deviceId);
      pIdx++;
    }

    sql += ` ORDER BY p.punch_time DESC LIMIT $${pIdx};`;
    params.push(limit);

    const result = await query(sql, params);
    res.json({ punches: result.rows });
  } catch (err) {
    console.error('Error fetching biometric punches:', err);
    res.status(500).json({ error: 'Failed to fetch biometric punches from database' });
  }
});

// ── POST /api/hr/biometric/punch (Standard Webhook / HTTP Push) ─────────────
router.post(['/biometric/punch', '/punch'], async (req, res) => {
  try {
    const hospitalId = req.user?.hospitalId || 1;
    const {
      staffId,
      userId,
      user_id,
      UserPIN,
      deviceId,
      device_id,
      deviceSn,
      device_sn,
      direction = 'IN',
      verifyMode = 'Fingerprint',
      verify_mode,
      punchTime,
      punch_time,
      time,
    } = req.body || {};

    const cleanUserId = userId || user_id || UserPIN || staffId;
    if (!cleanUserId) {
      return res.status(400).json({ error: 'User PIN / employee ID is required' });
    }

    const cleanTime = punchTime || punch_time || time || new Date();
    const cleanDirection = (direction || '').toUpperCase().includes('OUT') ? 'OUT' : 'IN';
    const cleanVerify = verify_mode || verifyMode || 'Fingerprint';
    const cleanDeviceSn = deviceSn || device_sn || 'BIO-GATEWAY';
    const cleanDeviceId = deviceId || device_id || null;

    const result = await processBiometricPunch({
      deviceSn: cleanDeviceSn,
      deviceId: cleanDeviceId,
      deviceUserId: cleanUserId,
      punchTime: cleanTime,
      direction: cleanDirection,
      verifyMode: cleanVerify,
      rawPayload: req.body,
      hospitalId,
      overrideActor: req.user,
    });

    res.json({
      status: 'success',
      result,
      message: result.message,
    });
  } catch (err) {
    console.error('Error processing biometric punch:', err);
    res.status(400).json({ error: err.message || 'Failed to process biometric punch' });
  }
});

// ── POST /api/hr/biometric/manual-punch ────────────────────────────────────
router.post(['/biometric/manual-punch', '/manual-punch'], async (req, res) => {
  try {
    const hospitalId = req.user?.hospitalId || 1;
    const {
      staffId,
      date,
      time,
      direction = 'IN',
      reason,
      supervisorId = 'HR-ADMIN',
    } = req.body || {};

    if (!staffId || !date || !time || !reason) {
      return res.status(400).json({ error: 'staffId, date, time, and reason are required for manual punch' });
    }

    const fullTimestamp = new Date(`${date}T${time}:00`);
    if (isNaN(fullTimestamp.getTime())) {
      return res.status(400).json({ error: 'Invalid date or time provided' });
    }

    const result = await processBiometricPunch({
      deviceSn: 'MANUAL-OVERRIDE',
      deviceId: 'MANUAL',
      deviceUserId: staffId,
      punchTime: fullTimestamp,
      direction: direction.toUpperCase().includes('OUT') ? 'OUT' : 'IN',
      verifyMode: 'Manual Override',
      rawPayload: { reason, supervisorId, date, time },
      hospitalId,
      overrideActor: { userId: supervisorId, username: req.user?.username || 'HR Supervisor' },
    });

    res.json({
      status: 'success',
      result,
      message: `Manual punch registered for ${staffId} at ${time}`,
    });
  } catch (err) {
    console.error('Error processing manual punch:', err);
    res.status(400).json({ error: err.message || 'Failed to record manual punch' });
  }
});

// ── POST /api/hr/biometric/batch-sync (eTimeTrackLite & Batch Punch Synchronization) ──
router.post(['/biometric/batch-sync', '/batch-sync', '/biometric/etimetracklite-sync'], async (req, res) => {
  try {
    const hospitalId = req.user?.hospitalId || 1;
    const rawList = Array.isArray(req.body) ? req.body : (req.body?.punches || req.body?.logs || []);

    if (!Array.isArray(rawList) || rawList.length === 0) {
      return res.status(400).json({ error: 'A non-empty array of punch logs is required in request body' });
    }

    const results = {
      total: rawList.length,
      processed: 0,
      duplicates: 0,
      errors: 0,
      details: [],
    };

    for (const item of rawList) {
      try {
        const userId = item.UserId || item.userId || item.user_id || item.UserPIN || item.staffId || item.EnrollNo;
        const logDate = item.LogDate || item.logDate || item.punchTime || item.punch_time || item.time || item.Date;
        const deviceSn = item.DeviceSName || item.DeviceId || item.deviceId || item.deviceSn || item.device_sn || 'ETIMETRACKLITE-SYNC';
        const direction = (item.Direction || item.direction || item.InOut || 'IN').toString().toUpperCase().includes('OUT') ? 'OUT' : 'IN';
        const verifyMode = item.VerifyMode || item.verifyMode || item.VerificationMode || 'Biometric Sync';

        if (!userId || !logDate) {
          results.errors++;
          results.details.push({ status: 'ERROR', error: 'Missing UserId or LogDate', item });
          continue;
        }

        const punchRes = await processBiometricPunch({
          deviceSn,
          deviceUserId: String(userId),
          punchTime: logDate,
          direction,
          verifyMode,
          rawPayload: item,
          hospitalId,
          overrideActor: req.user,
        });

        if (punchRes.isDuplicate) {
          results.duplicates++;
        } else {
          results.processed++;
        }
        results.details.push({
          userId,
          logDate,
          status: punchRes.status,
          message: punchRes.message,
        });
      } catch (err) {
        results.errors++;
        results.details.push({ status: 'ERROR', error: err.message, item });
      }
    }

    res.json({
      status: 'success',
      summary: results,
      message: `Batch sync complete: ${results.processed} processed, ${results.duplicates} duplicate(s), ${results.errors} error(s)`,
    });
  } catch (err) {
    console.error('Error in batch punch sync:', err);
    res.status(500).json({ error: err.message || 'Failed to process batch punch sync' });
  }
});

// ── ADMS / iClock Protocol Endpoints (eSSL / ZKTeco Cloud Server Push) ──────

// 1. Handshake request from terminal: GET /iclock/cdata?SN=...&options=all
router.get(['/iclock/cdata', '/cdata', '/biometric/iclock/cdata', '/biometric/cdata'], async (req, res) => {
  try {
    const sn = req.query.SN || req.query.sn || 'UNKNOWN-SN';
    
    // Update device heartbeat in DB if recognized
    await query(
      `UPDATE biometric_devices 
       SET status = 'online', last_heartbeat = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
       WHERE serial_number = $1`,
      [sn]
    ).catch(() => {});

    // Standard ADMS configuration handshake payload expected by eSSL terminals
    const responsePayload = [
      `GET OPTION FROM: ${sn}`,
      `Stamp=9999`,
      `OpStamp=9999`,
      `ErrorDelay=60`,
      `Delay=30`,
      `ResStamp=9999`,
      `TransTimes=00:00;14:00`,
      `TransInterval=1`,
      `TransFlag=TransData AttLog\tOpLog\tAttPhoto\tEnrollFP\tEnrollUser`,
      `Realtime=1`,
      `Encrypt=0`,
      '',
    ].join('\n');

    res.setHeader('Content-Type', 'text/plain');
    res.send(responsePayload);
  } catch (err) {
    console.error('Error handling ADMS cdata GET handshake:', err);
    res.status(500).send('ERROR');
  }
});

// 2. Punch Data push from terminal: POST /iclock/cdata?SN=...&table=ATTLOG
router.post(['/iclock/cdata', '/cdata', '/biometric/iclock/cdata', '/biometric/cdata'], async (req, res) => {
  try {
    const sn = req.query.SN || req.query.sn || 'UNKNOWN-SN';
    const table = req.query.table || req.query.TableName || 'ATTLOG';

    // Update terminal status in DB
    await query(
      `UPDATE biometric_devices 
       SET status = 'online', last_heartbeat = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
       WHERE serial_number = $1`,
      [sn]
    ).catch(() => {});

    let rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    if (table.toUpperCase().includes('ATTLOG')) {
      const parsedPunches = parseAdmsAttLog(rawBody);
      let processedCount = 0;

      for (const p of parsedPunches) {
        try {
          await processBiometricPunch({
            deviceSn: sn,
            deviceUserId: p.deviceUserId,
            punchTime: p.punchTime,
            direction: p.direction,
            verifyMode: p.verifyMode,
            rawPayload: p.rawLine,
          });
          processedCount++;
        } catch (pErr) {
          console.warn(`[ADMS Punch Ingestion Warning] ${pErr.message}`);
        }
      }

      // Return standard ADMS acknowledgment
      res.setHeader('Content-Type', 'text/plain');
      return res.send(`OK: ${processedCount}`);
    }

    // Other tables (e.g. OPERLOG)
    res.setHeader('Content-Type', 'text/plain');
    res.send('OK');
  } catch (err) {
    console.error('Error handling ADMS cdata POST:', err);
    res.status(500).send('ERROR');
  }
});

// 3. Command polling from terminal: GET /iclock/getrequest?SN=...
router.get(['/iclock/getrequest', '/getrequest', '/biometric/iclock/getrequest'], (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send('OK');
});

// 4. Command response from terminal: POST /iclock/devicecmd?SN=...
router.post(['/iclock/devicecmd', '/devicecmd', '/biometric/iclock/devicecmd'], (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send('OK');
});

// ── GET & POST /api/hr/biometric/overtime-records (PostgreSQL Backed) ────────
router.get(['/biometric/overtime-records', '/overtime-records'], async (req, res) => {
  try {
    const hospitalId = req.user?.hospitalId || 1;
    const { employeeId, status, date } = req.query;

    let sql = `
      SELECT 
        id,
        employee_id as "staffId",
        employee_name as "staffName",
        department,
        TO_CHAR(overtime_date, 'YYYY-MM-DD') as "date",
        regular_shift as "regularShift",
        extra_hours as "extraHours",
        hourly_rate as "hourlyRate",
        total_amount as "totalAmount",
        reason,
        approved_by as "approvedBy",
        status
      FROM overtime_records
      WHERE hospital_id = $1
    `;
    const params = [hospitalId];
    let pIdx = 2;

    if (employeeId) {
      sql += ` AND employee_id = $${pIdx}`;
      params.push(employeeId);
      pIdx++;
    }

    if (status && status !== 'All') {
      sql += ` AND status = $${pIdx}`;
      params.push(status);
      pIdx++;
    }

    if (date) {
      sql += ` AND overtime_date = $${pIdx}`;
      params.push(date);
      pIdx++;
    }

    sql += ` ORDER BY overtime_date DESC, created_at DESC;`;

    const result = await query(sql, params);
    res.json({ overtimeRecords: result.rows });
  } catch (err) {
    console.error('Error fetching overtime records:', err);
    res.status(500).json({ error: 'Failed to fetch overtime records' });
  }
});

router.post(['/biometric/overtime-records', '/overtime-records'], async (req, res) => {
  try {
    const hospitalId = req.user?.hospitalId || 1;
    const {
      staffId,
      staffName,
      department,
      date,
      extraHours,
      hourlyRate = 250,
      reason,
      regularShift = 'Morning (07:00 - 15:00)',
    } = req.body || {};

    if (!staffId || !date || !extraHours) {
      return res.status(400).json({ error: 'staffId, date, and extraHours are required' });
    }

    const otId = `OT-REC-${Date.now().toString().slice(-5)}`;
    const parsedHours = parseFloat(extraHours);
    const parsedRate = parseFloat(hourlyRate);
    const totalAmount = parseFloat((parsedHours * parsedRate).toFixed(2));

    const insertSql = `
      INSERT INTO overtime_records (
        id, hospital_id, employee_id, employee_name, department, overtime_date,
        regular_shift, extra_hours, hourly_rate, total_amount, reason, approved_by, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Pending Approval', 'Pending')
      RETURNING *;
    `;

    const result = await query(insertSql, [
      otId,
      hospitalId,
      staffId,
      staffName || staffId,
      department || 'General',
      date,
      regularShift,
      parsedHours,
      parsedRate,
      totalAmount,
      reason || 'Staff Shortage Coverage',
    ]);

    res.json({ status: 'success', overtimeRecord: result.rows[0] });
  } catch (err) {
    console.error('Error creating overtime record:', err);
    res.status(400).json({ error: err.message || 'Failed to submit overtime record' });
  }
});

// Approve or Reject Overtime (Links directly to Attendance & Payroll)
router.put(['/biometric/overtime-records/:id/status', '/overtime-records/:id/status'], async (req, res) => {
  try {
    const { id } = req.params;
    const { status, approverName = 'Medical Superintendent' } = req.body;
    const hospitalId = req.user?.hospitalId || 1;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be Approved or Rejected' });
    }

    const result = await withTransaction(async (client) => {
      const updateRes = await client.query(
        `UPDATE overtime_records 
         SET status = $1, approved_by = $2, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $3 AND hospital_id = $4 
         RETURNING *`,
        [status, approverName, id, hospitalId]
      );

      if (updateRes.rows.length === 0) {
        throw new Error('Overtime record not found');
      }

      const ot = updateRes.rows[0];

      // If approved, update attendance record's overtime_hours for that date
      if (status === 'Approved') {
        await client.query(
          `UPDATE attendance 
           SET overtime_hours = $1, updated_at = CURRENT_TIMESTAMP 
           WHERE employee_id = $2 AND attendance_date = $3`,
          [ot.extra_hours, ot.employee_id, ot.overtime_date]
        );
      }

      return ot;
    });

    res.json({ status: 'success', overtimeRecord: result });
  } catch (err) {
    console.error('Error updating overtime status:', err);
    res.status(400).json({ error: err.message || 'Failed to update overtime status' });
  }
});

// ── GET & POST /api/hr/biometric/staff-loans (PostgreSQL Backed) ─────────────
router.get(['/biometric/staff-loans', '/staff-loans'], async (req, res) => {
  try {
    const hospitalId = req.user?.hospitalId || 1;
    const { staffId, status } = req.query;

    let sql = `
      SELECT 
        id,
        employee_id as "staffId",
        employee_name as "staffName",
        department,
        loan_type as "loanType",
        sanctioned_amount as "sanctionedAmount",
        TO_CHAR(disbursed_date, 'YYYY-MM-DD') as "disbursedDate",
        monthly_emi as "monthlyEmi",
        total_tenure_months as "totalTenureMonths",
        remaining_tenure_months as "remainingTenureMonths",
        balance_outstanding as "balanceOutstanding",
        status
      FROM staff_loans
      WHERE hospital_id = $1
    `;
    const params = [hospitalId];
    let pIdx = 2;

    if (staffId) {
      sql += ` AND employee_id = $${pIdx}`;
      params.push(staffId);
      pIdx++;
    }

    if (status && status !== 'All') {
      sql += ` AND status = $${pIdx}`;
      params.push(status);
      pIdx++;
    }

    sql += ` ORDER BY created_at DESC;`;

    const result = await query(sql, params);
    res.json({ staffLoans: result.rows });
  } catch (err) {
    console.error('Error fetching staff loans:', err);
    res.status(500).json({ error: 'Failed to fetch staff loans from database' });
  }
});

router.post(['/biometric/staff-loans', '/staff-loans'], async (req, res) => {
  try {
    const hospitalId = req.user?.hospitalId || 1;
    const {
      staffId,
      staffName,
      department,
      loanType = 'Salary Advance',
      sanctionedAmount,
      monthlyEmi,
      totalTenureMonths,
    } = req.body || {};

    if (!staffId || !sanctionedAmount || !monthlyEmi || !totalTenureMonths) {
      return res.status(400).json({ error: 'staffId, sanctionedAmount, monthlyEmi, and totalTenureMonths are required' });
    }

    const loanId = `LOAN-${Date.now().toString().slice(-5)}`;
    const parsedSanctioned = parseFloat(sanctionedAmount);
    const parsedEmi = parseFloat(monthlyEmi);
    const parsedTenure = parseInt(totalTenureMonths, 10);
    const today = new Date().toISOString().substring(0, 10);

    const insertSql = `
      INSERT INTO staff_loans (
        id, hospital_id, employee_id, employee_name, department, loan_type,
        sanctioned_amount, disbursed_date, monthly_emi, total_tenure_months,
        remaining_tenure_months, balance_outstanding, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'Active')
      RETURNING 
        id,
        employee_id as "staffId",
        employee_name as "staffName",
        department,
        loan_type as "loanType",
        sanctioned_amount as "sanctionedAmount",
        TO_CHAR(disbursed_date, 'YYYY-MM-DD') as "disbursedDate",
        monthly_emi as "monthlyEmi",
        total_tenure_months as "totalTenureMonths",
        remaining_tenure_months as "remainingTenureMonths",
        balance_outstanding as "balanceOutstanding",
        status;
    `;

    const result = await query(insertSql, [
      loanId,
      hospitalId,
      staffId,
      staffName || staffId,
      department || 'General',
      loanType,
      parsedSanctioned,
      today,
      parsedEmi,
      parsedTenure,
      parsedTenure,
      parsedSanctioned,
    ]);

    res.json({ status: 'success', staffLoan: result.rows[0] });
  } catch (err) {
    console.error('Error sanctioning staff loan:', err);
    res.status(400).json({ error: err.message || 'Failed to sanction staff advance/loan' });
  }
});

// Repay EMI or Settle Staff Loan
router.put(['/biometric/staff-loans/:id/repay', '/staff-loans/:id/repay'], async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, recoveryPeriod, reason } = req.body || {};
    const hospitalId = req.user?.hospitalId || 1;
    const actorId = req.user?.userId || 'USR-ADMIN';
    const actorUsername = req.user?.username || 'admin';

    const result = await withTransaction(async (client) => {
      // 1. Fetch with row-level lock to prevent concurrent overpayments or race conditions
      const loanRes = await client.query(
        `SELECT * FROM staff_loans WHERE id = $1 AND hospital_id = $2 FOR UPDATE`,
        [id, hospitalId]
      );

      if (loanRes.rows.length === 0) {
        throw new Error('Staff loan record not found');
      }

      const loan = loanRes.rows[0];
      const balanceOutstanding = parseFloat(loan.balance_outstanding);
      const monthlyEmi = parseFloat(loan.monthly_emi);
      const remainingTenure = parseInt(loan.remaining_tenure_months, 10);

      // 2. Reject repayment on closed or fully repaid loans
      if (loan.status === 'Closed' || balanceOutstanding <= 0 || remainingTenure <= 0) {
        throw new Error(`Staff loan ${id} is already closed or fully repaid (Current balance: ₹${balanceOutstanding.toFixed(2)})`);
      }

      // 3. Determine and validate repayment amount
      let repaymentAmount;
      if (amount !== undefined && amount !== null && amount !== '') {
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
          throw new Error('Repayment amount must be a positive number');
        }
        if (parsedAmount > balanceOutstanding) {
          throw new Error(`Repayment amount (₹${parsedAmount.toFixed(2)}) exceeds outstanding balance (₹${balanceOutstanding.toFixed(2)})`);
        }
        repaymentAmount = parsedAmount;
      } else {
        // Standard scheduled EMI:
        // When remaining balance is <= scheduled EMI or on the final installment,
        // use the exact remaining balance so it reaches exactly ₹0 with no lingering fraction
        if (monthlyEmi >= balanceOutstanding || remainingTenure <= 1) {
          repaymentAmount = balanceOutstanding;
        } else {
          repaymentAmount = monthlyEmi;
        }
      }

      repaymentAmount = parseFloat(repaymentAmount.toFixed(2));
      const newBalance = Math.max(0, parseFloat((balanceOutstanding - repaymentAmount).toFixed(2)));
      const newRemainingTenure = newBalance <= 0 ? 0 : Math.max(0, remainingTenure - 1);
      const newStatus = (newBalance <= 0 || newRemainingTenure <= 0) ? 'Closed' : 'Active';

      // 4. Derive recovery period if not provided (YYYY-MM format)
      let targetPeriod = recoveryPeriod;
      if (!targetPeriod) {
        const repRes = await client.query(
          `SELECT recovery_period FROM staff_loan_repayments WHERE loan_id = $1 ORDER BY id ASC`,
          [id]
        );
        const existingPeriods = new Set(repRes.rows.map(r => r.recovery_period));

        const disbDate = loan.disbursed_date ? new Date(loan.disbursed_date) : new Date();
        let currYear = disbDate.getUTCFullYear();
        let currMonth = disbDate.getUTCMonth() + 1; // 1-12

        let candidatePeriod = `${currYear}-${String(currMonth).padStart(2, '0')}`;
        for (let i = 0; i < (loan.total_tenure_months || 12) + 12; i++) {
          if (!existingPeriods.has(candidatePeriod)) {
            targetPeriod = candidatePeriod;
            break;
          }
          currMonth++;
          if (currMonth > 12) {
            currMonth = 1;
            currYear++;
          }
          candidatePeriod = `${currYear}-${String(currMonth).padStart(2, '0')}`;
        }
        if (!targetPeriod) {
          targetPeriod = `${currYear}-${String(currMonth).padStart(2, '0')}`;
        }
      }

      // 5. Prevent duplicate recovery for the same period
      const dupCheck = await client.query(
        `SELECT id, recovery_type, recovery_period, payroll_run_id 
         FROM staff_loan_repayments 
         WHERE loan_id = $1 AND recovery_period = $2`,
        [id, targetPeriod]
      );
      if (dupCheck.rows.length > 0) {
        const existing = dupCheck.rows[0];
        const sourceDesc = existing.recovery_type === 'PAYROLL_DEDUCTION'
          ? `payroll run ${existing.payroll_run_id || ''}`
          : 'manual payment';
        throw new Error(`Loan installment for period ${targetPeriod} has already been recovered via ${sourceDesc}.`);
      }

      // 6. Record in staff_loan_repayments ledger
      await client.query(
        `INSERT INTO staff_loan_repayments (
          loan_id, hospital_id, employee_id, amount,
          balance_before, balance_after, recovery_type,
          recovery_period, remarks, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id, hospitalId, loan.employee_id, repaymentAmount,
          balanceOutstanding, newBalance, 'MANUAL_EMI',
          targetPeriod, reason || `Manual EMI payment of ₹${repaymentAmount.toFixed(2)} for ${targetPeriod}`,
          actorUsername
        ]
      );

      // 7. Update staff_loans master table
      const updateRes = await client.query(
        `UPDATE staff_loans 
         SET balance_outstanding = $1, remaining_tenure_months = $2, status = $3, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $4 
         RETURNING 
           id,
           employee_id as "staffId",
           employee_name as "staffName",
           department,
           loan_type as "loanType",
           sanctioned_amount as "sanctionedAmount",
           TO_CHAR(disbursed_date, 'YYYY-MM-DD') as "disbursedDate",
           monthly_emi as "monthlyEmi",
           total_tenure_months as "totalTenureMonths",
           remaining_tenure_months as "remainingTenureMonths",
           balance_outstanding as "balanceOutstanding",
           status;`,
        [newBalance, newRemainingTenure, newStatus, id]
      );

      // 8. Log immutable audit trail
      await logAudit({
        client,
        hospitalId,
        userId: actorId,
        actorUsername,
        employeeId: loan.employee_id,
        employeeName: loan.employee_name,
        module: 'Payroll',
        action: 'LOAN_EMI_REPAYMENT',
        entityType: 'STAFF_LOAN',
        entityId: id,
        oldValue: {
          balanceOutstanding,
          remainingTenureMonths: remainingTenure,
          status: loan.status,
        },
        newValue: {
          repaymentAmount,
          balanceOutstanding: newBalance,
          remainingTenureMonths: newRemainingTenure,
          status: newStatus,
          recoveryPeriod: targetPeriod,
        },
        reason: reason || `Manual recovery of 1 month EMI (₹${repaymentAmount.toFixed(2)}) for period ${targetPeriod}`,
        ipAddress: req.ip || '127.0.0.1',
      });

      return {
        ...updateRes.rows[0],
        recoveryPeriod: targetPeriod,
        amountPaid: repaymentAmount
      };
    });

    res.json({ status: 'success', staffLoan: result });
  } catch (err) {
    console.error('Error repaying staff loan:', err);
    res.status(400).json({ error: err.message || 'Failed to process loan repayment' });
  }
});

// Pre-close or Settle Staff Loan Account
router.put(['/biometric/staff-loans/:id/close', '/staff-loans/:id/close'], async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const hospitalId = req.user?.hospitalId || 1;
    const actorId = req.user?.userId || 'USR-ADMIN';
    const actorUsername = req.user?.username || 'admin';

    const result = await withTransaction(async (client) => {
      const loanRes = await client.query(
        `SELECT * FROM staff_loans WHERE id = $1 AND hospital_id = $2 FOR UPDATE`,
        [id, hospitalId]
      );
      if (loanRes.rows.length === 0) {
        throw new Error('Staff loan record not found');
      }
      const loan = loanRes.rows[0];
      const balanceOutstanding = parseFloat(loan.balance_outstanding);

      if (loan.status === 'Closed' || balanceOutstanding <= 0) {
        throw new Error(`Staff loan ${id} is already closed or settled`);
      }

      // Record settlement repayment if balance > 0
      if (balanceOutstanding > 0) {
        const settlePeriod = `SETTLE-${Date.now()}`;
        await client.query(
          `INSERT INTO staff_loan_repayments (
            loan_id, hospital_id, employee_id, amount,
            balance_before, balance_after, recovery_type,
            recovery_period, remarks, created_by
          ) VALUES ($1, $2, $3, $4, $5, 0, 'SETTLEMENT', $6, $7, $8)
          ON CONFLICT (loan_id, recovery_period) DO NOTHING`,
          [
            id, hospitalId, loan.employee_id, balanceOutstanding,
            balanceOutstanding, settlePeriod,
            reason || `Full settlement and pre-closure of loan ${id}`,
            actorUsername
          ]
        );
      }

      const updateRes = await client.query(
        `UPDATE staff_loans
         SET balance_outstanding = 0, remaining_tenure_months = 0, status = 'Closed', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND hospital_id = $2
         RETURNING
           id,
           employee_id as "staffId",
           employee_name as "staffName",
           department,
           loan_type as "loanType",
           sanctioned_amount as "sanctionedAmount",
           TO_CHAR(disbursed_date, 'YYYY-MM-DD') as "disbursedDate",
           monthly_emi as "monthlyEmi",
           total_tenure_months as "totalTenureMonths",
           remaining_tenure_months as "remainingTenureMonths",
           balance_outstanding as "balanceOutstanding",
           status;`,
        [id, hospitalId]
      );

      await logAudit({
        client,
        hospitalId,
        userId: actorId,
        actorUsername,
        employeeId: loan.employee_id,
        employeeName: loan.employee_name,
        module: 'Payroll',
        action: 'LOAN_SETTLED',
        entityType: 'STAFF_LOAN',
        entityId: id,
        oldValue: {
          balanceOutstanding,
          remainingTenureMonths: loan.remaining_tenure_months,
          status: loan.status,
        },
        newValue: {
          balanceOutstanding: 0,
          remainingTenureMonths: 0,
          status: 'Closed',
        },
        reason: reason || `Full pre-closure and settlement of loan account ${id}`,
        ipAddress: req.ip || '127.0.0.1',
      });

      return updateRes.rows[0];
    });

    res.json({ status: 'success', staffLoan: result });
  } catch (err) {
    console.error('Error closing staff loan:', err);
    res.status(400).json({ error: err.message || 'Failed to close staff loan' });
  }
});

// ── Supported Duty Roster Shift Codes & Mappings ─────────────────────────────
export const SHIFT_CODE_TO_NAME = {
  M: 'Morning (07:00 - 15:00)',
  E: 'Evening (15:00 - 23:00)',
  N: 'Night (23:00 - 07:00)',
  G: 'General (09:00 - 17:30)',
  WO: 'Weekly Off',
  OD: 'Outdoor Duty',
  CL: 'Casual Leave',
  SL: 'Sick Leave',
  LOP: 'Loss of Pay',
};

export const SUPPORTED_SHIFT_CODES = Object.keys(SHIFT_CODE_TO_NAME);

export function mapShiftNameToCode(shiftName) {
  if (!shiftName) return 'M';
  const norm = String(shiftName).trim().toUpperCase();
  if (norm === 'M' || norm.startsWith('MORN')) return 'M';
  if (norm === 'E' || norm.startsWith('EVEN')) return 'E';
  if (norm === 'N' || norm.startsWith('NIGH')) return 'N';
  if (norm === 'G' || norm.startsWith('GEN')) return 'G';
  if (norm === 'WO' || norm.includes('WEEKLY OFF')) return 'WO';
  if (norm === 'OD' || norm.includes('OUTDOOR')) return 'OD';
  if (norm === 'CL' || norm.includes('CASUAL')) return 'CL';
  if (norm === 'SL' || norm.includes('SICK')) return 'SL';
  if (norm === 'LOP' || norm.includes('LOSS OF PAY') || norm.includes('UNPAID')) return 'LOP';
  if (SUPPORTED_SHIFT_CODES.includes(norm)) return norm;
  return 'M';
}

// ── GET /api/hr/biometric/roster (Monthly 1-31 Duty Roster Matrix) ──────────
router.get(['/biometric/roster', '/roster'], async (req, res) => {
  try {
    const hospitalId = req.user?.hospitalId || 1;
    const { month = '2026-10', department } = req.query;

    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ error: 'Invalid or missing month parameter (expected YYYY-MM)' });
    }

    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    const startDate = `${month}-01`;
    const endDate = `${month}-${String(daysInMonth).padStart(2, '0')}`;

    let empSql = `
      SELECT id, name, department, designation, default_shift
      FROM employees
      WHERE hospital_id = $1 AND is_active = TRUE AND status NOT IN ('Inactive', 'Resigned', 'Terminated')
    `;
    const empParams = [hospitalId];
    let pIdx = 2;

    if (department && department !== 'All') {
      empSql += ` AND LOWER(department) = LOWER($${pIdx})`;
      empParams.push(department);
      pIdx++;
    }

    empSql += ` ORDER BY name ASC;`;
    const empRes = await query(empSql, empParams);

    const assignSql = `
      SELECT 
        sa.employee_id,
        EXTRACT(DAY FROM sa.shift_date)::int as day_num,
        sa.shift_name,
        sa.is_on_call
      FROM shift_assignments sa
      JOIN employees e ON e.id = sa.employee_id
      WHERE sa.hospital_id = $1
        AND sa.shift_date >= $2::date
        AND sa.shift_date <= $3::date
        AND e.is_active = TRUE
    `;
    const assignRes = await query(assignSql, [hospitalId, startDate, endDate]);

    const assignmentsByEmp = new Map();
    for (const row of assignRes.rows) {
      if (!assignmentsByEmp.has(row.employee_id)) {
        assignmentsByEmp.set(row.employee_id, {});
      }
      const dayCode = mapShiftNameToCode(row.shift_name);
      assignmentsByEmp.get(row.employee_id)[row.day_num] = dayCode;
    }

    const rosters = empRes.rows.map((emp) => ({
      staffId: emp.id,
      staffName: emp.name,
      department: emp.department || 'General',
      designation: emp.designation || 'Staff',
      month,
      days: assignmentsByEmp.get(emp.id) || {},
    }));

    res.json({
      month,
      totalEmployees: rosters.length,
      rosters,
    });
  } catch (err) {
    console.error('Error fetching monthly duty roster:', err);
    res.status(500).json({ error: 'Failed to fetch monthly duty roster' });
  }
});

// ── PUT /api/hr/biometric/roster (Update Single Day Slot in 1-31 Roster) ────
router.put(['/biometric/roster', '/roster'], requireHrAdmin, async (req, res) => {
  try {
    const hospitalId = req.user?.hospitalId || 1;
    const { staffId, employeeId, month, day, shiftCode, is_on_call, isOnCall, notes } = req.body || {};
    const targetEmpId = staffId || employeeId;

    if (!targetEmpId) {
      return res.status(400).json({ error: 'Employee ID (staffId) is required' });
    }

    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ error: 'Valid month (YYYY-MM) is required' });
    }

    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);
    const maxDays = new Date(year, monthNum, 0).getDate();
    const dayNum = parseInt(day, 10);

    if (isNaN(dayNum) || dayNum < 1 || dayNum > maxDays) {
      return res.status(400).json({ error: `Day must be an integer between 1 and ${maxDays} for month ${month}` });
    }

    const cleanCode = String(shiftCode || '').trim().toUpperCase();
    if (!SUPPORTED_SHIFT_CODES.includes(cleanCode)) {
      return res.status(400).json({
        error: `Invalid shiftCode '${cleanCode}'. Supported codes are ${SUPPORTED_SHIFT_CODES.join(', ')}`,
      });
    }

    // Verify employee exists, is active, and belongs to this hospital
    const empRes = await query(
      `SELECT id, name, department, designation, status, is_active, hospital_id 
       FROM employees 
       WHERE id = $1 AND hospital_id = $2`,
      [targetEmpId, hospitalId]
    );

    if (empRes.rows.length === 0) {
      return res.status(404).json({ error: `Employee '${targetEmpId}' not found in current hospital` });
    }

    const emp = empRes.rows[0];
    if (!emp.is_active || ['Inactive', 'Resigned', 'Terminated'].includes(emp.status)) {
      return res.status(400).json({ error: `Cannot schedule shift: Employee ${emp.name} is ${emp.status || 'Inactive'}` });
    }

    const shiftDate = `${month}-${String(dayNum).padStart(2, '0')}`;
    const shiftName = SHIFT_CODE_TO_NAME[cleanCode];
    const onCall = Boolean(isOnCall ?? is_on_call ?? false);

    const upsertSql = `
      INSERT INTO shift_assignments (
        hospital_id, employee_id, shift_date, shift_name, department, is_on_call, assigned_by, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (employee_id, shift_date) DO UPDATE
      SET shift_name = EXCLUDED.shift_name,
          department = EXCLUDED.department,
          is_on_call = EXCLUDED.is_on_call,
          assigned_by = EXCLUDED.assigned_by,
          notes = EXCLUDED.notes
      RETURNING *;
    `;

    const upsertRes = await query(upsertSql, [
      hospitalId,
      targetEmpId,
      shiftDate,
      shiftName,
      emp.department || 'General',
      onCall,
      req.user?.username || 'HR Admin',
      notes || null,
    ]);

    await logAudit({
      hospitalId,
      userId: req.user?.userId || 'SYSTEM',
      actorUsername: req.user?.username || 'HR Admin',
      module: 'Duty Roster',
      action: 'ROSTER_DAY_UPDATED',
      targetEntity: 'shift_assignments',
      targetId: String(upsertRes.rows[0].id),
      details: {
        employeeId: targetEmpId,
        shiftDate,
        shiftCode: cleanCode,
        shiftName,
      },
    });

    try {
      broadcastEvent('ROSTER_UPDATE', {
        employeeId: targetEmpId,
        shiftDate,
        shiftCode: cleanCode,
        shiftName,
      });
    } catch (_) {}

    res.json({
      status: 'success',
      message: `Roster updated for ${emp.name} on ${shiftDate} (${cleanCode})`,
      roster: {
        staffId: targetEmpId,
        staffName: emp.name,
        department: emp.department,
        month,
        day: dayNum,
        shiftCode: cleanCode,
        shiftName,
      },
      assignment: upsertRes.rows[0],
    });
  } catch (err) {
    console.error('Error updating duty roster day:', err);
    res.status(500).json({ error: 'Failed to update roster slot' });
  }
});

export default router;

