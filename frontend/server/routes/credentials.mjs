import express from 'express';
import { query, withTransaction } from '../db/index.mjs';
import { requireHrAdmin } from '../middleware/auth.mjs';
import { logAudit } from '../services/audit.mjs';

const router = express.Router();

function deriveStatus(validUntilStr) {
  if (!validUntilStr) return 'Valid';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(validUntilStr);
  expiry.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'Expired';
  if (diffDays <= 30) return 'Expiring Soon';
  return 'Valid';
}

// ── GET /api/hr/credentials ──────────────────────────────────────────────────
router.get('/credentials', async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId || 1;
    const employeeId = req.query.employeeId || null;

    let sql = `
      SELECT 
        c.id,
        c.employee_id as "staffId",
        c.staff_name as "staffName",
        c.department,
        c.title,
        c.credential_type as "credentialType",
        c.authority,
        c.license_no as "licenseNo",
        c.valid_from as "validFrom",
        c.valid_until as "validUntil",
        c.verified_status as "verifiedStatus",
        c.verified_by as "verifiedBy",
        c.verified_on as "verifiedOn",
        c.remarks
      FROM employee_credentials c
      JOIN employees e ON e.id = c.employee_id
      WHERE e.hospital_id = $1 AND e.is_active = TRUE
    `;
    const params = [hospitalId];

    if (employeeId) {
      sql += ' AND c.employee_id = $2';
      params.push(employeeId);
    }

    sql += ' ORDER BY c.valid_until ASC;';

    const result = await query(sql, params);
    const credentials = result.rows.map((row) => ({
      ...row,
      validFrom: row.validFrom ? row.validFrom.toISOString().split('T')[0] : '',
      validUntil: row.validUntil ? row.validUntil.toISOString().split('T')[0] : '',
      status: deriveStatus(row.validUntil),
    }));

    return res.json({ credentials });
  } catch (err) {
    console.error('Error fetching credentials:', err);
    return res.status(500).json({ error: 'Failed to fetch credentials' });
  }
});

// ── POST /api/hr/credentials ─────────────────────────────────────────────────
router.post('/credentials', requireHrAdmin, async (req, res) => {
  try {
    const { employeeId, title, credentialType, authority, licenseNo, validFrom, validUntil, remarks } = req.body;
    const hospitalId = req.user.hospitalId || 1;

    const empRes = await query('SELECT * FROM employees WHERE id = $1 AND hospital_id = $2', [employeeId, hospitalId]);
    if (empRes.rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
    const emp = empRes.rows[0];

    const countRes = await query('SELECT COUNT(*) FROM employee_credentials');
    const id = `CRD-${parseInt(countRes.rows[0].count, 10) + 101}`;

    const sql = `
      INSERT INTO employee_credentials (
        id, employee_id, staff_name, department, title, credential_type,
        authority, license_no, valid_from, valid_until, remarks, verified_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Verified')
      RETURNING *;
    `;

    const result = await query(sql, [
      id, employeeId, emp.name, emp.department, title || 'Clinical License',
      credentialType || 'State Medical Council License', authority || 'State Medical Council',
      licenseNo, validFrom || new Date().toISOString().split('T')[0], validUntil, remarks || null
    ]);

    await logAudit({
      hospitalId,
      userId: req.user.userId,
      actorUsername: req.user.username,
      employeeId,
      action: 'CREDENTIAL_REGISTERED',
      entityType: 'CREDENTIAL',
      entityId: id,
      newValue: result.rows[0],
    });

    return res.status(201).json({ credential: result.rows[0] });
  } catch (err) {
    console.error('Error adding credential:', err);
    return res.status(500).json({ error: err.message || 'Failed to add credential' });
  }
});

// ── PUT /api/hr/credentials/:id/renew ────────────────────────────────────────
router.put('/credentials/:id/renew', requireHrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { newExpiry, reason } = req.body;
    const hospitalId = req.user.hospitalId || 1;

    if (!newExpiry) return res.status(400).json({ error: 'newExpiry is required' });
    const today = new Date().toISOString().split('T')[0];
    if (newExpiry <= today) {
      return res.status(400).json({ error: 'Renewal expiry date must be in the future' });
    }

    const result = await withTransaction(async (client) => {
      const oldRes = await client.query(`
        SELECT c.* FROM employee_credentials c
        JOIN employees e ON e.id = c.employee_id
        WHERE c.id = $1 AND e.hospital_id = $2;
      `, [id, hospitalId]);

      if (oldRes.rows.length === 0) throw new Error('Credential not found');
      const old = oldRes.rows[0];

      const updateRes = await client.query(`
        UPDATE employee_credentials SET
          valid_until = $1,
          verified_on = CURRENT_DATE,
          verified_by = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *;
      `, [newExpiry, req.user.username, id]);

      // Update license_expiry on employees table atomically as well
      await client.query(`
        UPDATE employees SET license_expiry = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;
      `, [newExpiry, old.employee_id]);

      await logAudit({
        client,
        hospitalId,
        userId: req.user.userId,
        actorUsername: req.user.username,
        employeeId: old.employee_id,
        action: 'CREDENTIAL_RENEWED',
        entityType: 'CREDENTIAL',
        entityId: id,
        oldValue: old,
        newValue: updateRes.rows[0],
        reason: reason || `License renewed until ${newExpiry} by ${req.user.username}`,
      });

      return updateRes.rows[0];
    });

    return res.json({
      message: 'Credential renewed successfully',
      credential: {
        ...result,
        status: deriveStatus(newExpiry),
      },
    });
  } catch (err) {
    console.error('Error renewing credential:', err);
    return res.status(500).json({ error: err.message || 'Failed to renew credential' });
  }
});

export default router;
