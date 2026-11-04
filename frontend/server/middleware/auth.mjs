// Role-Based Access Control and User Context Middleware

export function extractUserContext(req, res, next) {
  // Read authenticated user info from request headers or query
  const userId = req.headers['x-user-id'] || 'USR-ADMIN';
  const username = req.headers['x-user-username'] || req.headers['x-actor-name'] || 'admin';
  const rawRole = (req.headers['x-user-role'] || 'ROLE_ADMIN').toUpperCase();
  const normalizedRole = rawRole.startsWith('ROLE_') ? rawRole : `ROLE_${rawRole}`;
  const role = normalizedRole;
  const employeeId = req.headers['x-employee-id'] || null;
  const hospitalCode = req.headers['x-hospital-code'] || 'HOSP-IMPERIAL';
  const hospitalId = parseInt(req.headers['x-hospital-id'] || '1', 10);

  const isAdmin = ['ROLE_SUPERADMIN', 'ROLE_ADMIN', 'ROLE_HR', 'ROLE_HR_ADMIN'].includes(role);
  const isDoctor = role === 'ROLE_DOCTOR';
  const isNurse = role === 'ROLE_NURSE';
  const isStaff = !isAdmin;

  req.user = {
    userId,
    username,
    role,
    employeeId,
    hospitalCode,
    hospitalId,
    isAdmin,
    isDoctor,
    isNurse,
    isStaff,
  };

  next();
}

export function requireHrAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({
      error: 'Forbidden: HR Administrator privileges required.',
      requiredRole: ['ROLE_SUPERADMIN', 'ROLE_ADMIN', 'ROLE_HR'],
    });
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user || !req.user.userId) {
    return res.status(401).json({
      error: 'Unauthorized: Authentication credentials required.',
    });
  }
  next();
}
