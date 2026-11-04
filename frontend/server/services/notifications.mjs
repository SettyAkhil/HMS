import { query } from '../db/index.mjs';

/**
 * Dispatch system notification
 */
export async function createNotification({
  client,
  hospitalId = 1,
  recipientEmployeeId = null,
  recipientRole = null,
  title,
  message,
  type = 'INFO',
  actionUrl = null,
}) {
  const sql = `
    INSERT INTO notifications (
      hospital_id, recipient_employee_id, recipient_role, title, message, type, action_url
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id;
  `;

  const params = [
    hospitalId,
    recipientEmployeeId,
    recipientRole,
    title,
    message,
    type,
    actionUrl,
  ];

  if (client) {
    return client.query(sql, params);
  }
  return query(sql, params);
}
