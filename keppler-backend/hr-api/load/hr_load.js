// k6 load test for hr-api: 100 concurrent users on a realistic HR mix.
//
//   docker run --rm --network keppler-backend_default -v "$PWD/hr-api/load:/load" \
//     -e AUTH_URL=http://gateway:8010 -e HR_URL=http://hr-api:8020 \
//     -e HR_USER=admin -e HR_PASSWORD=... grafana/k6:0.54.0 run /load/hr_load.js
//
// HR_URL points at hr-api directly: from one load generator every request
// shares an IP, and the gateway's per-client limit (100 r/s) would turn the
// test into a test of the limiter. Run once more against the gateway to see it.
import http from "k6/http"
import { check, group, sleep } from "k6"

const AUTH = __ENV.AUTH_URL || "http://gateway:8010"
const HR = __ENV.HR_URL || "http://hr-api:8020"
const SEED = Number(__ENV.SEED || 200)

export const options = {
  scenarios: {
    staff: { executor: "ramping-vus", startVUs: 0, stages: [{ duration: "30s", target: 100 }, { duration: "2m", target: 100 }, { duration: "15s", target: 0 }] },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{kind:read}": ["p(95)<800"],
    "http_req_duration{kind:write}": ["p(95)<1500"],
  },
}

function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ")
}

export function setup() {
  // One login for the whole run: auth-service rate-limits logins per client.
  const res = http.post(`${AUTH}/api/auth/login`, JSON.stringify({ username: __ENV.HR_USER, password: __ENV.HR_PASSWORD }), { headers: { "Content-Type": "application/json" } })
  check(res, { "logged in": (r) => r.status === 200 })
  const jar = { hospai_session: res.cookies.hospai_session[0].value, csrf_token: "loadtest-csrf" }
  const headers = { Cookie: cookieHeader(jar), "X-CSRF-Token": jar.csrf_token, "Content-Type": "application/json" }
  const dept = http.post(`${HR}/api/v1/hr/departments`, JSON.stringify({ code: `LD${Date.now() % 100000}`, name: "Load test ward" }), { headers }).json()
  const ids = []
  for (let i = 0; i < SEED; i++) {
    const r = http.post(`${HR}/api/v1/hr/employees`, JSON.stringify({
      first_name: `Load${i}`, last_name: "Tester", employee_category: i % 3 ? "nurse" : "support",
      joining_date: "2026-01-05", departments: [{ department_id: dept.id, is_primary: true }], activate: true,
    }), { headers })
    if (r.status === 201) ids.push(r.json().id)
  }
  return { headers, ids, dept: dept.id }
}

export default function (data) {
  const read = { headers: data.headers, tags: { kind: "read" } }
  const write = { headers: data.headers, tags: { kind: "write" } }
  const id = data.ids[Math.floor(Math.random() * data.ids.length)]
  const roll = Math.random()
  group("browse", () => {
    if (roll < 0.25) check(http.get(`${HR}/api/v1/hr/employees?page_size=25&search=load${Math.floor(Math.random() * 20)}`, read), { list: (r) => r.status === 200 })
    else if (roll < 0.40) check(http.get(`${HR}/api/v1/hr/employees/${id}`, read), { detail: (r) => r.status === 200 })
    else if (roll < 0.55) check(http.get(`${HR}/api/v1/attendance/live`, read), { live: (r) => r.status === 200 })
    else if (roll < 0.65) check(http.get(`${HR}/api/v1/hr/dashboard`, read), { dashboard: (r) => r.status === 200 })
    else if (roll < 0.75) check(http.get(`${HR}/api/v1/attendance/daily?page_size=50`, read), { daily: (r) => r.status === 200 })
    else if (roll < 0.83) check(http.get(`${HR}/api/v1/hr/leave/requests`, read), { leave: (r) => r.status === 200 })
    else if (roll < 0.90) check(http.get(`${HR}/api/v1/workforce/on-duty`, read), { onduty: (r) => r.status === 200 })
    else if (roll < 0.95) check(http.get(`${HR}/api/v1/hr/approvals`, read), { approvals: (r) => r.status === 200 })
    else check(http.patch(`${HR}/api/v1/hr/employees/${id}`, JSON.stringify({ phone: `+91 9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}` }), write), { update: (r) => r.status === 200 })
  })
  sleep(0.5 + Math.random())
}
