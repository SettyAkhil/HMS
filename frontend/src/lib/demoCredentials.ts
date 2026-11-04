/**
 * The demo accounts each login role signs in with.
 *
 * Two separate things have to agree here and previously did not:
 *
 *  - The **local RBAC store** (`RoleDatabase`), which decides which modules the
 *    signed-in user can navigate to. Every account in it uses `password123`.
 *  - The **backend** (`create_default_users` in `backend/backend/core/auth.py`),
 *    which issues the session cookie that authenticated APIs require -- the AI
 *    prescription splitter and Smart OCR among them. It seeds four accounts,
 *    each with its own password, and none of them is `password123`.
 *
 * The login screen used to auto-fill `password123` for every role, so the
 * backend call always returned 401 and `apiFetch` quietly fell through to the
 * local mock. The user was logged in and nothing looked wrong -- until an
 * authenticated endpoint was needed, at which point uploading a prescription
 * failed with a 401 nobody could see. Hence one table, used for both.
 *
 * Roles with no backend account of their own share the seeded `staff` account:
 * it is only there to obtain a session for the AI endpoints, and every clinical
 * permission still comes from the local RBAC store below.
 */

export interface DemoCredential {
  /** Username in the local RBAC store -- also the role key on the login screen. */
  username: string
  /** Password in the local RBAC store. */
  localPassword: string
  /** The seeded backend account to open a session with. */
  backendUsername: string
  backendPassword: string
}

const LOCAL_PASSWORD = "password123"

export const DEMO_CREDENTIALS: Record<string, DemoCredential> = {
  admin: {
    username: "admin",
    localPassword: LOCAL_PASSWORD,
    backendUsername: "admin",
    backendPassword: "Admin@123",
  },
  doctor: {
    username: "doctor",
    localPassword: LOCAL_PASSWORD,
    backendUsername: "admin",
    backendPassword: "Admin@123",
  },
  superadmin: {
    username: "superadmin",
    localPassword: LOCAL_PASSWORD,
    backendUsername: "admin",
    backendPassword: "Admin@123",
  },
  nurse: {
    username: "nurse",
    localPassword: LOCAL_PASSWORD,
    backendUsername: "staff",
    backendPassword: "staff123",
  },
  pharmacy: {
    username: "pharmacy",
    localPassword: LOCAL_PASSWORD,
    backendUsername: "staff",
    backendPassword: "staff123",
  },
  lab: {
    username: "lab",
    localPassword: LOCAL_PASSWORD,
    backendUsername: "staff",
    backendPassword: "staff123",
  },
  reception: {
    username: "reception",
    localPassword: LOCAL_PASSWORD,
    backendUsername: "staff",
    backendPassword: "staff123",
  },
  insurance: {
    username: "insurance",
    localPassword: LOCAL_PASSWORD,
    backendUsername: "staff",
    backendPassword: "staff123",
  },
  finance: {
    username: "finance",
    localPassword: LOCAL_PASSWORD,
    backendUsername: "staff",
    backendPassword: "staff123",
  },
  billing: {
    username: "billing",
    localPassword: LOCAL_PASSWORD,
    backendUsername: "staff",
    backendPassword: "staff123",
  },
  hr: {
    username: "hr",
    localPassword: LOCAL_PASSWORD,
    backendUsername: "admin",
    backendPassword: "Admin@123",
  },
  staff: {
    username: "staff",
    localPassword: LOCAL_PASSWORD,
    backendUsername: "staff",
    backendPassword: "staff123",
  },
}

export function credentialsForRole(role: string): DemoCredential {
  const key = (role || "").trim().toLowerCase()
  if (DEMO_CREDENTIALS[key]) return DEMO_CREDENTIALS[key]
  if (key.startsWith("dr") || key.includes("doctor")) return DEMO_CREDENTIALS.doctor
  return DEMO_CREDENTIALS.doctor
}
