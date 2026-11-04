# hr-api endpoint inventory

Generated from the live route table by `docs/gen_api_inventory.py`. *Requires* is what the route demands beyond a valid HMS session; handlers narrow further where noted (self-only, case visibility, record ownership). Full request/response schemas: OpenAPI at `/api/v1/hr-openapi.json` on hr-api (not exposed through the gateway).

## announcements

| Method | Path | Requires | Notes |
|---|---|---|---|
| GET | `/api/v1/hr/announcements` | hr.read or employees.read |  |
| POST | `/api/v1/hr/announcements` | employees.profile.write |  |

## approvals

| Method | Path | Requires | Notes |
|---|---|---|---|
| GET | `/api/v1/hr/approvals` | any signed-in user (handler scopes to self/ownership) | Pending: what *you* can act on. mine=true: what you raised. |
| GET | `/api/v1/hr/approvals/{instance_id}` | any signed-in user (handler scopes to self/ownership) |  |
| POST | `/api/v1/hr/approvals/{instance_id}/act` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/hr/workflows` | hr.read or employees.read |  |
| PUT | `/api/v1/hr/workflows/{code}` | any signed-in user (handler scopes to self/ownership) |  |

## attendance

| Method | Path | Requires | Notes |
|---|---|---|---|
| GET | `/api/v1/attendance/devices` | hr.read or employees.read |  |
| POST | `/api/v1/attendance/devices` | hr.attendance.write |  |
| DELETE | `/api/v1/attendance/devices/{device_id}` | hr.attendance.write |  |
| PATCH | `/api/v1/attendance/devices/{device_id}` | hr.attendance.write |  |
| GET | `/api/v1/attendance/integrations` | hr.attendance.write |  |
| POST | `/api/v1/attendance/integrations` | hr.attendance.write |  |
| DELETE | `/api/v1/attendance/integrations/{integration_id}` | hr.attendance.write |  |
| PATCH | `/api/v1/attendance/integrations/{integration_id}` | hr.attendance.write |  |
| POST | `/api/v1/attendance/integrations/{integration_id}/discover-devices` | hr.attendance.write |  |
| POST | `/api/v1/attendance/integrations/{integration_id}/sync` | hr.attendance.write |  |
| POST | `/api/v1/attendance/integrations/{integration_id}/test` | hr.attendance.write |  |
| GET | `/api/v1/attendance/live` | hr.read or employees.read |  |
| GET | `/api/v1/attendance/live/stream` | hr.read or employees.read | Server-sent events: one message per committed sync/device change for |
| GET | `/api/v1/attendance/mappings` | hr.read or employees.read |  |
| POST | `/api/v1/attendance/mappings` | hr.attendance.write |  |
| POST | `/api/v1/attendance/mappings/{mapping_id}/end` | hr.attendance.write |  |
| GET | `/api/v1/attendance/punches` | hr.read or employees.read |  |
| GET | `/api/v1/attendance/sync-logs` | hr.attendance.write |  |
| GET | `/api/v1/attendance/unmapped` | hr.attendance.write |  |

## attendance-engine

| Method | Path | Requires | Notes |
|---|---|---|---|
| GET | `/api/v1/attendance/corrections` | hr.read or employees.read |  |
| POST | `/api/v1/attendance/corrections` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/attendance/daily` | hr.read or employees.read |  |
| GET | `/api/v1/attendance/exceptions` | hr.read or employees.read |  |
| POST | `/api/v1/attendance/exceptions/{exc_id}/dismiss` | hr.attendance.write |  |
| GET | `/api/v1/attendance/monthly/{employee_id}` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/attendance/overtime` | hr.read or employees.read |  |
| POST | `/api/v1/attendance/overtime/{ot_id}/submit` | any signed-in user (handler scopes to self/ownership) |  |
| POST | `/api/v1/attendance/recalculate` | hr.attendance.write |  |
| GET | `/api/v1/attendance/records/{record_id}` | hr.read or employees.read |  |

## command-center

| Method | Path | Requires | Notes |
|---|---|---|---|
| GET | `/api/v1/hr/command-center` | hr.read or employees.read |  |

## compliance

| Method | Path | Requires | Notes |
|---|---|---|---|
| GET | `/api/v1/compliance/alerts` | hr.read or employees.read |  |
| POST | `/api/v1/compliance/alerts/{alert_id}/acknowledge` | employees.profile.write |  |
| POST | `/api/v1/compliance/credentials/{credential_id}/verify` | employees.profile.write |  |
| GET | `/api/v1/compliance/records` | hr.read or employees.read |  |
| POST | `/api/v1/compliance/scan` | employees.profile.write |  |

## dashboard

| Method | Path | Requires | Notes |
|---|---|---|---|
| GET | `/api/v1/hr/dashboard` | hr.read or employees.read |  |
| GET | `/api/v1/hr/dashboard/badges` | hr.read or employees.read | Small counts for the HR navigation. |

## documents

| Method | Path | Requires | Notes |
|---|---|---|---|
| GET | `/api/v1/hr/documents` | any signed-in user (handler scopes to self/ownership) |  |
| POST | `/api/v1/hr/documents` | any signed-in user (handler scopes to self/ownership) |  |
| DELETE | `/api/v1/hr/documents/{doc_id}` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/hr/documents/{doc_id}/download` | any signed-in user (handler scopes to self/ownership) |  |
| POST | `/api/v1/hr/documents/{doc_id}/{verdict}` | any signed-in user (handler scopes to self/ownership) |  |

## employees

| Method | Path | Requires | Notes |
|---|---|---|---|
| GET | `/api/v1/hr/employees` | hr.read or employees.read |  |
| POST | `/api/v1/hr/employees` | employees.profile.write |  |
| GET | `/api/v1/hr/employees/export.csv` | hr.read or employees.read |  |
| GET | `/api/v1/hr/employees/facets` | hr.read or employees.read |  |
| POST | `/api/v1/hr/employees/import` | employees.profile.write |  |
| GET | `/api/v1/hr/employees/{employee_id}` | any signed-in user (handler scopes to self/ownership) |  |
| PATCH | `/api/v1/hr/employees/{employee_id}` | employees.profile.write |  |
| GET | `/api/v1/hr/employees/{employee_id}/audit` | employees.profile.write |  |
| PUT | `/api/v1/hr/employees/{employee_id}/contacts` | employees.profile.write |  |
| POST | `/api/v1/hr/employees/{employee_id}/credentials` | employees.profile.write |  |
| POST | `/api/v1/hr/employees/{employee_id}/credentials/{credential_id}/{verdict}` | employees.profile.write |  |
| GET | `/api/v1/hr/employees/{employee_id}/employment` | hr.read or employees.read |  |
| GET | `/api/v1/hr/employees/{employee_id}/history` | hr.read or employees.read |  |
| GET | `/api/v1/hr/employees/{employee_id}/summary` | hr.read or employees.read |  |
| POST | `/api/v1/hr/employees/{employee_id}/transfer` | employees.profile.write |  |
| POST | `/api/v1/hr/employees/{employee_id}/{action}` | employees.profile.write |  |

## grievances

| Method | Path | Requires | Notes |
|---|---|---|---|
| GET | `/api/v1/hr/grievances` | any signed-in user (handler scopes to self/ownership) |  |
| POST | `/api/v1/hr/grievances` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/hr/grievances/actions` | hr.grievances.manage |  |
| POST | `/api/v1/hr/grievances/actions` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/hr/grievances/{case_id}` | any signed-in user (handler scopes to self/ownership) |  |
| POST | `/api/v1/hr/grievances/{case_id}/assign` | any signed-in user (handler scopes to self/ownership) |  |
| POST | `/api/v1/hr/grievances/{case_id}/comments` | any signed-in user (handler scopes to self/ownership) |  |
| POST | `/api/v1/hr/grievances/{case_id}/investigation` | any signed-in user (handler scopes to self/ownership) |  |
| POST | `/api/v1/hr/grievances/{case_id}/resolve` | any signed-in user (handler scopes to self/ownership) |  |

## health

| Method | Path | Requires | Notes |
|---|---|---|---|
| GET | `/api/v1/hr/health` | public |  |

## hms-integration

| Method | Path | Requires | Notes |
|---|---|---|---|
| GET | `/api/v1/workforce/availability` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/workforce/coverage/live` | hr.read or employees.read |  |
| GET | `/api/v1/workforce/on-duty` | any signed-in user (handler scopes to self/ownership) | Names, roles and shift times only -- what a ward or OT needs to see. |

## leave

| Method | Path | Requires | Notes |
|---|---|---|---|
| POST | `/api/v1/hr/leave/accrual` | hr.leaves.write |  |
| POST | `/api/v1/hr/leave/balances/adjust` | hr.leaves.write |  |
| GET | `/api/v1/hr/leave/balances/{employee_id}` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/hr/leave/calendar` | hr.read or employees.read |  |
| GET | `/api/v1/hr/leave/policies` | hr.read or employees.read |  |
| POST | `/api/v1/hr/leave/policies` | hr.leaves.write |  |
| GET | `/api/v1/hr/leave/requests` | any signed-in user (handler scopes to self/ownership) |  |
| POST | `/api/v1/hr/leave/requests` | any signed-in user (handler scopes to self/ownership) |  |
| POST | `/api/v1/hr/leave/requests/{request_id}/cancel` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/hr/leave/types` | any signed-in user (handler scopes to self/ownership) |  |
| POST | `/api/v1/hr/leave/types` | hr.leaves.write |  |
| PATCH | `/api/v1/hr/leave/types/{type_id}` | hr.leaves.write |  |

## onboarding

| Method | Path | Requires | Notes |
|---|---|---|---|
| PATCH | `/api/v1/onboarding/tasks/{task_id}` | hr.recruitment.write |  |
| POST | `/api/v1/onboarding/{app_id}/activate` | hr.recruitment.write |  |
| GET | `/api/v1/onboarding/{app_id}/tasks` | hr.recruitment.write |  |
| POST | `/api/v1/onboarding/{app_id}/tasks` | hr.recruitment.write |  |

## organization

| Method | Path | Requires | Notes |
|---|---|---|---|
| GET | `/api/v1/hr/branches` | hr.read or employees.read |  |
| POST | `/api/v1/hr/branches` | hr.departments.write |  |
| PATCH | `/api/v1/hr/branches/{branch_id}` | hr.departments.write |  |
| GET | `/api/v1/hr/departments` | hr.read or employees.read |  |
| POST | `/api/v1/hr/departments` | hr.departments.write |  |
| DELETE | `/api/v1/hr/departments/{dept_id}` | hr.departments.write |  |
| PATCH | `/api/v1/hr/departments/{dept_id}` | hr.departments.write |  |
| GET | `/api/v1/hr/designations` | hr.read or employees.read |  |
| POST | `/api/v1/hr/designations` | hr.departments.write |  |
| PATCH | `/api/v1/hr/designations/{des_id}` | hr.departments.write |  |
| GET | `/api/v1/hr/hospitals` | hr.read or employees.read |  |
| POST | `/api/v1/hr/hospitals` | hr.departments.write |  |
| GET | `/api/v1/hr/organization/tree` | hr.read or employees.read |  |
| GET | `/api/v1/hr/units` | hr.read or employees.read |  |
| POST | `/api/v1/hr/units` | hr.departments.write |  |

## payroll

| Method | Path | Requires | Notes |
|---|---|---|---|
| GET | `/api/v1/payroll/adjustments` | hr.payroll.write |  |
| POST | `/api/v1/payroll/adjustments` | hr.payroll.write |  |
| GET | `/api/v1/payroll/compensation/{employee_id}` | hr.payroll.write |  |
| POST | `/api/v1/payroll/compensation/{employee_id}` | hr.payroll.write |  |
| GET | `/api/v1/payroll/components` | hr.payroll.write |  |
| POST | `/api/v1/payroll/components` | hr.payroll.write |  |
| GET | `/api/v1/payroll/loans` | hr.payroll.write |  |
| POST | `/api/v1/payroll/loans` | hr.payroll.write |  |
| GET | `/api/v1/payroll/payslips` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/payroll/payslips/{payslip_id}` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/payroll/runs` | hr.payroll.write |  |
| POST | `/api/v1/payroll/runs` | hr.payroll.write |  |
| GET | `/api/v1/payroll/runs/{run_id}` | hr.payroll.write |  |
| POST | `/api/v1/payroll/runs/{run_id}/calculate` | hr.payroll.write |  |
| POST | `/api/v1/payroll/runs/{run_id}/finalize` | hr.payroll.write |  |
| POST | `/api/v1/payroll/runs/{run_id}/retry-posting` | hr.payroll.write |  |
| POST | `/api/v1/payroll/runs/{run_id}/reverse` | hr.payroll.write |  |
| POST | `/api/v1/payroll/runs/{run_id}/submit` | hr.payroll.write |  |
| GET | `/api/v1/payroll/statutory` | hr.payroll.write |  |
| PUT | `/api/v1/payroll/statutory/{kind}` | hr.payroll.write |  |
| GET | `/api/v1/payroll/structures` | hr.payroll.write |  |
| POST | `/api/v1/payroll/structures` | hr.payroll.write |  |
| POST | `/api/v1/payroll/structures/{structure_id}/preview` | hr.payroll.write |  |

## performance

| Method | Path | Requires | Notes |
|---|---|---|---|
| GET | `/api/v1/performance/cycles` | any signed-in user (handler scopes to self/ownership) |  |
| POST | `/api/v1/performance/cycles` | hr.performance.write |  |
| POST | `/api/v1/performance/cycles/{cycle_id}/launch` | hr.performance.write |  |
| GET | `/api/v1/performance/goals` | any signed-in user (handler scopes to self/ownership) |  |
| POST | `/api/v1/performance/goals` | hr.performance.write |  |
| PATCH | `/api/v1/performance/goals/{goal_id}` | hr.performance.write |  |
| GET | `/api/v1/performance/reviews` | any signed-in user (handler scopes to self/ownership) |  |
| POST | `/api/v1/performance/reviews/{review_id}/submit` | any signed-in user (handler scopes to self/ownership) |  |

## recruitment

| Method | Path | Requires | Notes |
|---|---|---|---|
| GET | `/api/v1/recruitment/applications` | hr.recruitment.write |  |
| POST | `/api/v1/recruitment/applications` | hr.recruitment.write |  |
| POST | `/api/v1/recruitment/applications/{app_id}/stage` | hr.recruitment.write |  |
| POST | `/api/v1/recruitment/candidates` | hr.recruitment.write |  |
| POST | `/api/v1/recruitment/interviews` | hr.recruitment.write |  |
| POST | `/api/v1/recruitment/interviews/{interview_id}/feedback` | any signed-in user (handler scopes to self/ownership) |  |
| POST | `/api/v1/recruitment/offers` | hr.recruitment.write |  |
| POST | `/api/v1/recruitment/offers/{offer_id}/respond` | hr.recruitment.write |  |
| GET | `/api/v1/recruitment/requisitions` | hr.read or employees.read |  |
| POST | `/api/v1/recruitment/requisitions` | hr.read or employees.read | Any HR reader (department heads included) may raise one; approval decides. |
| GET | `/api/v1/recruitment/vacancies` | hr.read or employees.read |  |
| POST | `/api/v1/recruitment/vacancies` | hr.recruitment.write |  |
| POST | `/api/v1/recruitment/vacancies/{vacancy_id}/{status}` | hr.recruitment.write |  |

## reports

| Method | Path | Requires | Notes |
|---|---|---|---|
| GET | `/api/v1/reports/hr` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/reports/hr/runs` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/reports/hr/runs/{run_id}/download` | any signed-in user (handler scopes to self/ownership) |  |
| POST | `/api/v1/reports/hr/schedules` | hr.reports.read |  |
| GET | `/api/v1/reports/hr/{key}` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/reports/hr/{key}/export.csv` | any signed-in user (handler scopes to self/ownership) |  |

## self-service

| Method | Path | Requires | Notes |
|---|---|---|---|
| GET | `/api/v1/me` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/me/announcements` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/me/attendance` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/me/colleagues` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/me/corrections` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/me/leave` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/me/notifications` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/me/payslips` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/me/punches` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/me/shifts` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/me/training` | any signed-in user (handler scopes to self/ownership) |  |

## training

| Method | Path | Requires | Notes |
|---|---|---|---|
| GET | `/api/v1/training/certifications` | any signed-in user (handler scopes to self/ownership) |  |
| POST | `/api/v1/training/certifications` | hr.training.write |  |
| POST | `/api/v1/training/enrollments/{enrollment_id}/result` | hr.training.write |  |
| GET | `/api/v1/training/matrix` | hr.read or employees.read |  |
| GET | `/api/v1/training/programs` | any signed-in user (handler scopes to self/ownership) |  |
| POST | `/api/v1/training/programs` | hr.training.write |  |
| GET | `/api/v1/training/sessions` | any signed-in user (handler scopes to self/ownership) |  |
| POST | `/api/v1/training/sessions` | hr.training.write |  |
| POST | `/api/v1/training/sessions/{session_id}/enroll` | hr.training.write |  |
| GET | `/api/v1/training/sessions/{session_id}/enrollments` | hr.read or employees.read |  |

## workforce

| Method | Path | Requires | Notes |
|---|---|---|---|
| GET | `/api/v1/workforce/allocations` | hr.read or employees.read |  |
| POST | `/api/v1/workforce/allocations` | hr.shifts.write |  |
| DELETE | `/api/v1/workforce/allocations/{alloc_id}` | hr.shifts.write |  |
| GET | `/api/v1/workforce/assignments` | hr.read or employees.read |  |
| GET | `/api/v1/workforce/coverage` | hr.read or employees.read |  |
| GET | `/api/v1/workforce/handovers` | hr.read or employees.read |  |
| POST | `/api/v1/workforce/handovers` | any signed-in user (handler scopes to self/ownership) |  |
| POST | `/api/v1/workforce/handovers/{handover_id}/acknowledge` | any signed-in user (handler scopes to self/ownership) |  |
| GET | `/api/v1/workforce/holidays` | any signed-in user (handler scopes to self/ownership) |  |
| POST | `/api/v1/workforce/holidays` | hr.shifts.write |  |
| DELETE | `/api/v1/workforce/holidays/{holiday_id}` | hr.shifts.write |  |
| GET | `/api/v1/workforce/requirements` | hr.read or employees.read |  |
| POST | `/api/v1/workforce/requirements` | hr.shifts.write |  |
| DELETE | `/api/v1/workforce/requirements/{req_id}` | hr.shifts.write |  |
| GET | `/api/v1/workforce/rosters` | hr.read or employees.read |  |
| POST | `/api/v1/workforce/rosters` | hr.shifts.write |  |
| PUT | `/api/v1/workforce/rosters/{roster_id}/assignments` | hr.shifts.write |  |
| POST | `/api/v1/workforce/rosters/{roster_id}/publish` | hr.shifts.write |  |
| POST | `/api/v1/workforce/rosters/{roster_id}/rotation` | hr.shifts.write |  |
| GET | `/api/v1/workforce/rosters/{roster_id}/validate` | hr.read or employees.read |  |
| GET | `/api/v1/workforce/shifts` | hr.read or employees.read |  |
| POST | `/api/v1/workforce/shifts` | hr.shifts.write |  |
| DELETE | `/api/v1/workforce/shifts/{shift_id}` | hr.shifts.write |  |
| PATCH | `/api/v1/workforce/shifts/{shift_id}` | hr.shifts.write |  |
| GET | `/api/v1/workforce/swaps` | hr.read or employees.read |  |
| POST | `/api/v1/workforce/swaps` | any signed-in user (handler scopes to self/ownership) |  |

_206 operations._
