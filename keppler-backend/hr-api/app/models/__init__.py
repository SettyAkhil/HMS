from app.models.base import RLS_TABLES, Base
from app.models.platform import AuditLog, CodeSequence, OutboxEvent, Tenant
from app.models.organization import Branch, Department, Designation, Hospital, OrganizationUnit
from app.models.employee import (
    Employee,
    EmployeeContact,
    EmployeeCredential,
    EmployeeDepartment,
    EmployeeHistory,
    EmployeeProfile,
    EmploymentRecord,
)
from app.models.attendance import (
    AttendanceIntegration,
    AttendanceSyncLog,
    BiometricDevice,
    BiometricMapping,
    RawPunchLog,
)
from app.models import strategy as _strategy  # noqa: F401  (registers Phase 7 tables)
from app.models import engagement as _engagement  # noqa: F401  (registers Phase 5 tables)
from app.models import talent as _talent  # noqa: F401  (registers Phase 4 tables)
from app.models import payroll as _payroll  # noqa: F401  (registers Phase 3 tables)
from app.models import workforce as _workforce  # noqa: F401  (registers Phase 2 tables)

__all__ = [name for name in dir() if not name.startswith("_")]
