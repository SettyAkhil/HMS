import { query } from '../db/index.mjs';

/**
 * Log immutable audit event
 */
export async function logAudit({
  client,
  hospitalId = 1,
  userId = 'USR-ADMIN',
  actorUsername = 'admin',
  employeeId = null,
  employeeName = null,
  module = 'HRMS',
  action,
  entityType = 'HRMS',
  entityId = null,
  oldValue = null,
  newValue = null,
  reason = null,
  ipAddress = '127.0.0.1',
}) {
  const sql = `
    INSERT INTO audit_logs (
      hospital_id, user_id, actor_username, employee_id, employee_name,
      module, action, entity_type, entity_id, old_value, new_value, reason, ip_address
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING id;
  `;

  const params = [
    hospitalId,
    userId,
    actorUsername,
    employeeId,
    employeeName,
    module,
    action,
    entityType,
    entityId ? String(entityId) : null,
    oldValue ? (typeof oldValue === 'string' ? oldValue : JSON.stringify(oldValue)) : null,
    newValue ? (typeof newValue === 'string' ? newValue : JSON.stringify(newValue)) : null,
    reason,
    ipAddress,
  ];

  if (client) {
    return client.query(sql, params);
  }
  return query(sql, params);
}
