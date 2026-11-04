/**
 * In-Memory Database and Query Fallback for HospAI Enterprise HRMS
 * Seamlessly services all HRMS relational operations when PostgreSQL is offline.
 */

const DEPARTMENTS = [
  { id: 1, name: 'Cardiology', code: 'CARD', is_clinical: true },
  { id: 2, name: 'Orthopedics', code: 'ORTHO', is_clinical: true },
  { id: 3, name: 'Emergency', code: 'ER', is_clinical: true },
  { id: 4, name: 'Nursing', code: 'NURS', is_clinical: true },
  { id: 5, name: 'ICU', code: 'ICU', is_clinical: true },
  { id: 6, name: 'Surgery', code: 'SURG', is_clinical: true },
  { id: 7, name: 'Pediatrics', code: 'PED', is_clinical: true },
  { id: 8, name: 'Radiology', code: 'RAD', is_clinical: true },
  { id: 9, name: 'Laboratory', code: 'LAB', is_clinical: true },
  { id: 10, name: 'Pharmacy', code: 'PHARM', is_clinical: false },
  { id: 11, name: 'Gastroenterology', code: 'GASTRO', is_clinical: true },
  { id: 12, name: 'Administration', code: 'ADMIN', is_clinical: false },
  { id: 13, name: 'Support Staff', code: 'SUPP', is_clinical: false },
];

const SHIFTS = [
  { id: 1, hospital_id: 1, name: 'Morning Shift', code: 'SHIFT_MORN', start_time: '07:00:00', end_time: '15:00:00', duration_hours: 8, is_active: true },
  { id: 2, hospital_id: 1, name: 'Evening Shift', code: 'SHIFT_EVE', start_time: '15:00:00', end_time: '23:00:00', duration_hours: 8, is_active: true },
  { id: 3, hospital_id: 1, name: 'Night Shift', code: 'SHIFT_NIGHT', start_time: '23:00:00', end_time: '07:00:00', duration_hours: 8, is_active: true },
  { id: 4, hospital_id: 1, name: 'General Shift', code: 'SHIFT_GEN', start_time: '09:00:00', end_time: '17:30:00', duration_hours: 8.5, is_active: true },
  { id: 5, hospital_id: 1, name: 'On-Call Shift', code: 'SHIFT_ONCALL', start_time: '00:00:00', end_time: '23:59:59', duration_hours: 24, is_active: true },
];

const LEAVE_TYPES = [
  { id: 1, hospital_id: 1, code: 'CL', name: 'Casual Leave', default_quota_days: 12, is_paid: true },
  { id: 2, hospital_id: 1, code: 'SL', name: 'Sick Leave', default_quota_days: 10, is_paid: true },
  { id: 3, hospital_id: 1, code: 'EL', name: 'Earned Leave', default_quota_days: 15, is_paid: true },
  { id: 4, hospital_id: 1, code: 'ML', name: 'Maternity Leave', default_quota_days: 90, is_paid: true },
];

// Seed master employees
let EMPLOYEES = [
  {
    id: 'EMP-101',
    hospital_id: 1,
    name: 'Dr. Rajesh Sharma',
    gender: 'Male',
    dob: new Date('1980-05-14'),
    blood_group: 'B+',
    email: 'rajesh.sharma@hospai.internal',
    phone: '+91 98765 43210',
    avatar_initials: 'RS',
    department: 'Cardiology',
    designation: 'Senior Consultant Cardiologist',
    category: 'Doctor',
    employment_type: 'Full-Time',
    status: 'Active',
    duty_status: 'On Duty',
    default_shift: 'Morning (07:00 - 15:00)',
    joining_date: new Date('2021-03-01'),
    qualification: 'MBBS, MD (Medicine), DM (Cardiology)',
    license_number: 'MCI-44012',
    license_expiry: new Date('2028-12-31'),
    address: 'Banjara Hills, Hyderabad',
    is_active: true,
    casual: 12, casual_used: 2,
    sick: 10, sick_used: 1,
    earned: 15, earned_used: 3,
    basic: 120000, hra: 48000, allowances: 32000, pf: 14400, tax: 15000, net_pay: 170600,
    account_number: '50100234567890', ifsc_code: 'HDFC0001824', bank_name: 'HDFC Bank', pan_number: 'ABCPR1234D',
    emergency_contact_name: 'Sunita Sharma', emergency_contact_relation: 'Spouse', emergency_contact_phone: '+91 98765 43211',
  },
  {
    id: 'EMP-102',
    hospital_id: 1,
    name: 'Dr. Priya Patel',
    gender: 'Female',
    dob: new Date('1985-08-22'),
    blood_group: 'O+',
    email: 'priya.patel@hospai.internal',
    phone: '+91 98765 43212',
    avatar_initials: 'PP',
    department: 'Emergency',
    designation: 'Chief ER Physician',
    category: 'Doctor',
    employment_type: 'Full-Time',
    status: 'Active',
    duty_status: 'On Duty',
    default_shift: 'Morning (07:00 - 15:00)',
    joining_date: new Date('2022-01-15'),
    qualification: 'MBBS, MD (Emergency Medicine)',
    license_number: 'SMB-99214',
    license_expiry: new Date('2027-06-30'),
    address: 'Jubilee Hills, Hyderabad',
    is_active: true,
    casual: 12, casual_used: 1,
    sick: 10, sick_used: 0,
    earned: 15, earned_used: 2,
    basic: 110000, hra: 44000, allowances: 26000, pf: 13200, tax: 12000, net_pay: 154800,
    account_number: '60100456789123', ifsc_code: 'ICIC0000104', bank_name: 'ICICI Bank', pan_number: 'BCDPP5678E',
    emergency_contact_name: 'Rohan Patel', emergency_contact_relation: 'Brother', emergency_contact_phone: '+91 98765 43213',
  },
  {
    id: 'EMP-103',
    hospital_id: 1,
    name: 'Dr. Vikram Reddy',
    gender: 'Male',
    dob: new Date('1978-11-03'),
    blood_group: 'A+',
    email: 'vikram.reddy@hospai.internal',
    phone: '+91 98765 43214',
    avatar_initials: 'VR',
    department: 'Radiology',
    designation: 'Head of Radiology & Imaging',
    category: 'Doctor',
    employment_type: 'Full-Time',
    status: 'Active',
    duty_status: 'On Duty',
    default_shift: 'General (09:00 - 17:30)',
    joining_date: new Date('2019-07-01'),
    qualification: 'MBBS, MD (Radiodiagnosis), FRCR',
    license_number: 'RAD-10442',
    license_expiry: new Date('2029-03-31'),
    address: 'Madhapur, Hyderabad',
    is_active: true,
    casual: 12, casual_used: 3,
    sick: 10, sick_used: 2,
    earned: 15, earned_used: 4,
    basic: 130000, hra: 52000, allowances: 38000, pf: 15600, tax: 18000, net_pay: 186400,
    account_number: '40100789123456', ifsc_code: 'SBIN0004561', bank_name: 'State Bank of India', pan_number: 'CDEVR9012F',
    emergency_contact_name: 'Kavita Reddy', emergency_contact_relation: 'Spouse', emergency_contact_phone: '+91 98765 43215',
  },
  {
    id: 'EMP-104',
    hospital_id: 1,
    name: 'Dr. Ananya Iyer',
    gender: 'Female',
    dob: new Date('1988-02-19'),
    blood_group: 'B+',
    email: 'ananya.iyer@hospai.internal',
    phone: '+91 98765 43216',
    avatar_initials: 'AI',
    department: 'Pediatrics',
    designation: 'Consultant Pediatrician',
    category: 'Doctor',
    employment_type: 'Full-Time',
    status: 'Active',
    duty_status: 'Off Duty',
    default_shift: 'Evening (15:00 - 23:00)',
    joining_date: new Date('2023-04-10'),
    qualification: 'MBBS, DNB (Pediatrics)',
    license_number: 'MCI-88123',
    license_expiry: new Date('2028-09-15'),
    address: 'Kondapur, Hyderabad',
    is_active: true,
    casual: 12, casual_used: 4,
    sick: 10, sick_used: 1,
    earned: 15, earned_used: 1,
    basic: 95000, hra: 38000, allowances: 22000, pf: 11400, tax: 9500, net_pay: 134100,
    account_number: '50100987654321', ifsc_code: 'HDFC0001824', bank_name: 'HDFC Bank', pan_number: 'DEFIA3456G',
    emergency_contact_name: 'Siddharth Iyer', emergency_contact_relation: 'Spouse', emergency_contact_phone: '+91 98765 43217',
  },
  {
    id: 'EMP-105',
    hospital_id: 1,
    name: 'Nurse Sunita Devi',
    gender: 'Female',
    dob: new Date('1992-06-11'),
    blood_group: 'O+',
    email: 'sunita.devi@hospai.internal',
    phone: '+91 98765 43218',
    avatar_initials: 'SD',
    department: 'ICU',
    designation: 'Head Nurse - Intensive Care',
    category: 'Nursing',
    employment_type: 'Full-Time',
    status: 'Active',
    duty_status: 'On Duty',
    default_shift: 'Morning (07:00 - 15:00)',
    joining_date: new Date('2020-08-15'),
    qualification: 'B.Sc. Nursing, Critical Care Cert.',
    license_number: 'INC-88201',
    license_expiry: new Date('2026-11-30'),
    address: 'Kukatpally, Hyderabad',
    is_active: true,
    casual: 12, casual_used: 2,
    sick: 10, sick_used: 0,
    earned: 15, earned_used: 5,
    basic: 45000, hra: 18000, allowances: 12000, pf: 5400, tax: 2500, net_pay: 67100,
    account_number: '30100123456789', ifsc_code: 'SBIN0004561', bank_name: 'State Bank of India', pan_number: 'EFGSD7890H',
    emergency_contact_name: 'Ramesh Devi', emergency_contact_relation: 'Spouse', emergency_contact_phone: '+91 98765 43219',
  },
  {
    id: 'EMP-106',
    hospital_id: 1,
    name: 'Nurse Rahul Verma',
    gender: 'Male',
    dob: new Date('1994-09-25'),
    blood_group: 'AB+',
    email: 'rahul.verma@hospai.internal',
    phone: '+91 98765 43220',
    avatar_initials: 'RV',
    department: 'Emergency',
    designation: 'Senior Triage Nurse',
    category: 'Nursing',
    employment_type: 'Full-Time',
    status: 'Active',
    duty_status: 'On Duty',
    default_shift: 'Morning (07:00 - 15:00)',
    joining_date: new Date('2022-05-20'),
    qualification: 'G.N.M., Emergency Triage Certified',
    license_number: 'INC-99412',
    license_expiry: new Date('2027-04-15'),
    address: 'Gachibowli, Hyderabad',
    is_active: true,
    casual: 12, casual_used: 3,
    sick: 10, sick_used: 2,
    earned: 15, earned_used: 1,
    basic: 38000, hra: 15200, allowances: 9800, pf: 4560, tax: 1800, net_pay: 56640,
    account_number: '70100234567812', ifsc_code: 'AXIS0000456', bank_name: 'Axis Bank', pan_number: 'FGHRV1234I',
    emergency_contact_name: 'Pooja Verma', emergency_contact_relation: 'Sister', emergency_contact_phone: '+91 98765 43221',
  },
  {
    id: 'EMP-107',
    hospital_id: 1,
    name: 'Nurse Kavita Nair',
    gender: 'Female',
    dob: new Date('1995-12-04'),
    blood_group: 'A-',
    email: 'kavita.nair@hospai.internal',
    phone: '+91 98765 43222',
    avatar_initials: 'KN',
    department: 'Nursing',
    designation: 'Inpatient Ward Staff Nurse',
    category: 'Nursing',
    employment_type: 'Full-Time',
    status: 'Active',
    duty_status: 'Off Duty',
    default_shift: 'Evening (15:00 - 23:00)',
    joining_date: new Date('2023-01-10'),
    qualification: 'B.Sc. Nursing',
    license_number: 'INC-10293',
    license_expiry: new Date('2028-02-28'),
    address: 'Miyapur, Hyderabad',
    is_active: true,
    casual: 12, casual_used: 1,
    sick: 10, sick_used: 1,
    earned: 15, earned_used: 0,
    basic: 35000, hra: 14000, allowances: 8000, pf: 4200, tax: 1500, net_pay: 51300,
    account_number: '80100345678923', ifsc_code: 'HDFC0001824', bank_name: 'HDFC Bank', pan_number: 'GHIJK5678J',
    emergency_contact_name: 'Mohan Nair', emergency_contact_relation: 'Father', emergency_contact_phone: '+91 98765 43223',
  },
  {
    id: 'EMP-108',
    hospital_id: 1,
    name: 'Suresh Babu',
    gender: 'Male',
    dob: new Date('1987-04-18'),
    blood_group: 'O-',
    email: 'suresh.babu@hospai.internal',
    phone: '+91 98765 43224',
    avatar_initials: 'SB',
    department: 'Laboratory',
    designation: 'Senior Medical Lab Technologist',
    category: 'Allied Health',
    employment_type: 'Full-Time',
    status: 'Active',
    duty_status: 'On Duty',
    default_shift: 'General (09:00 - 17:30)',
    joining_date: new Date('2019-11-01'),
    qualification: 'M.Sc. Medical Lab Technology',
    license_number: 'MLT-4401',
    license_expiry: new Date('2027-10-31'),
    address: 'Ameerpet, Hyderabad',
    is_active: true,
    casual: 12, casual_used: 2,
    sick: 10, sick_used: 0,
    earned: 15, earned_used: 3,
    basic: 42000, hra: 16800, allowances: 10200, pf: 5040, tax: 2200, net_pay: 61760,
    account_number: '90100456789034', ifsc_code: 'ICIC0000104', bank_name: 'ICICI Bank', pan_number: 'HIJSB9012K',
    emergency_contact_name: 'Lakshmi Babu', emergency_contact_relation: 'Spouse', emergency_contact_phone: '+91 98765 43225',
  },
  {
    id: 'EMP-109',
    hospital_id: 1,
    name: 'Sneha Kulkarni',
    gender: 'Female',
    dob: new Date('1990-10-30'),
    blood_group: 'B-',
    email: 'sneha.kulkarni@hospai.internal',
    phone: '+91 98765 43226',
    avatar_initials: 'SK',
    department: 'Pharmacy',
    designation: 'Chief Pharmacist',
    category: 'Allied Health',
    employment_type: 'Full-Time',
    status: 'Active',
    duty_status: 'On Duty',
    default_shift: 'Morning (07:00 - 15:00)',
    joining_date: new Date('2021-06-15'),
    qualification: 'M.Pharm (Hospital Pharmacy)',
    license_number: 'PCI-55912',
    license_expiry: new Date('2026-10-25'),
    address: 'Begumpet, Hyderabad',
    is_active: true,
    casual: 12, casual_used: 3,
    sick: 10, sick_used: 1,
    earned: 15, earned_used: 2,
    basic: 48000, hra: 19200, allowances: 11800, pf: 5760, tax: 2800, net_pay: 70440,
    account_number: '10100567890145', ifsc_code: 'SBIN0004561', bank_name: 'State Bank of India', pan_number: 'IJKSC3456L',
    emergency_contact_name: 'Nitin Kulkarni', emergency_contact_relation: 'Spouse', emergency_contact_phone: '+91 98765 43227',
  },
  {
    id: 'EMP-110',
    hospital_id: 1,
    name: 'Amit Gupta',
    gender: 'Male',
    dob: new Date('1983-03-12'),
    blood_group: 'A+',
    email: 'amit.gupta@hospai.internal',
    phone: '+91 98765 43228',
    avatar_initials: 'AG',
    department: 'Administration',
    designation: 'General Operations Manager',
    category: 'Administrative',
    employment_type: 'Full-Time',
    status: 'Active',
    duty_status: 'On Duty',
    default_shift: 'General (09:00 - 17:30)',
    joining_date: new Date('2018-09-01'),
    qualification: 'MBA (Healthcare & Hospital Mgmt)',
    license_number: 'ADMIN-001',
    license_expiry: new Date('2030-12-31'),
    address: 'Somajiguda, Hyderabad',
    is_active: true,
    casual: 12, casual_used: 4,
    sick: 10, sick_used: 0,
    earned: 15, earned_used: 6,
    basic: 75000, hra: 30000, allowances: 20000, pf: 9000, tax: 6500, net_pay: 109500,
    account_number: '20100678901256', ifsc_code: 'HDFC0001824', bank_name: 'HDFC Bank', pan_number: 'JKLAG7890M',
    emergency_contact_name: 'Meera Gupta', emergency_contact_relation: 'Spouse', emergency_contact_phone: '+91 98765 43229',
  },
  {
    id: 'EMP-111',
    hospital_id: 1,
    name: 'Deepa Joshi',
    gender: 'Female',
    dob: new Date('1989-07-08'),
    blood_group: 'O+',
    email: 'deepa.joshi@hospai.internal',
    phone: '+91 98765 43230',
    avatar_initials: 'DJ',
    department: 'Administration',
    designation: 'Human Resources Lead',
    category: 'Administrative',
    employment_type: 'Full-Time',
    status: 'Active',
    duty_status: 'On Duty',
    default_shift: 'General (09:00 - 17:30)',
    joining_date: new Date('2020-02-17'),
    qualification: 'MBA (Human Resource Management)',
    license_number: 'SHRM-CP-2020',
    license_expiry: new Date('2029-05-31'),
    address: 'Hitech City, Hyderabad',
    is_active: true,
    casual: 12, casual_used: 2,
    sick: 10, sick_used: 1,
    earned: 15, earned_used: 2,
    basic: 65000, hra: 26000, allowances: 16000, pf: 7800, tax: 5200, net_pay: 94000,
    account_number: '30100789012367', ifsc_code: 'AXIS0000456', bank_name: 'Axis Bank', pan_number: 'KLMDJ1234N',
    emergency_contact_name: 'Arjun Joshi', emergency_contact_relation: 'Spouse', emergency_contact_phone: '+91 98765 43231',
  },
];

const TODAY_STR = new Date().toISOString().split('T')[0];

let ATTENDANCE = EMPLOYEES.map((emp, index) => ({
  id: index + 1,
  hospital_id: 1,
  staffId: emp.id,
  employee_id: emp.id,
  staffName: emp.name,
  employee_name: emp.name,
  department: emp.department,
  date: TODAY_STR,
  attendance_date: TODAY_STR,
  shift: emp.default_shift,
  assigned_shift: emp.default_shift,
  shiftStartTime: emp.default_shift.includes('09:00') ? '09:00' : (emp.default_shift.includes('15:00') ? '15:00' : '07:00'),
  shift_start_time: emp.default_shift.includes('09:00') ? '09:00' : (emp.default_shift.includes('15:00') ? '15:00' : '07:00'),
  shiftEndTime: emp.default_shift.includes('17:30') ? '17:30' : (emp.default_shift.includes('23:00') ? '23:00' : '15:00'),
  shift_end_time: emp.default_shift.includes('17:30') ? '17:30' : (emp.default_shift.includes('23:00') ? '23:00' : '15:00'),
  checkIn: emp.duty_status === 'On Duty' ? '07:08 AM' : null,
  clock_in: emp.duty_status === 'On Duty' ? '07:08 AM' : null,
  checkOut: null,
  clock_out: null,
  status: emp.duty_status === 'On Duty' ? 'Present' : 'On Leave',
  attendance_status: emp.duty_status === 'On Duty' ? 'Present' : 'On Leave',
  workHours: emp.duty_status === 'On Duty' ? 5.5 : 0,
  work_hours: emp.duty_status === 'On Duty' ? 5.5 : 0,
  lateMinutes: 8,
  late_minutes: 8,
  earlyExitMinutes: 0,
  early_exit_minutes: 0,
  overtimeHours: 0,
  overtime_hours: 0,
  remarks: 'Biometric verified at Gate A',
  source: 'Biometric System',
  attendance_source: 'Biometric System',
  currentDutyStatus: emp.duty_status,
  category: emp.category,
  designation: emp.designation,
  isActive: true,
}));

let LEAVES = [
  {
    id: 1,
    hospital_id: 1,
    staffId: 'EMP-104',
    employee_id: 'EMP-104',
    staffName: 'Dr. Ananya Iyer',
    department: 'Pediatrics',
    leaveType: 'Casual Leave',
    leave_type: 'Casual Leave',
    startDate: TODAY_STR,
    start_date: TODAY_STR,
    endDate: TODAY_STR,
    end_date: TODAY_STR,
    days: 1,
    reason: 'Family function in Bengaluru',
    handoverNote: 'Dr. Rajesh covering OP consults',
    handover_note: 'Dr. Rajesh covering OP consults',
    replacementStaffId: 'EMP-101',
    replacement_staff_id: 'EMP-101',
    status: 'Pending',
    appliedOn: TODAY_STR,
    applied_on: TODAY_STR,
    reviewedBy: null,
    reviewed_by: null,
    reviewedAt: null,
    reviewed_at: null,
    remarks: 'Awaiting HoD approval',
    created_at: new Date(),
  },
  {
    id: 2,
    hospital_id: 1,
    staffId: 'EMP-107',
    employee_id: 'EMP-107',
    staffName: 'Nurse Kavita Nair',
    department: 'Nursing',
    leaveType: 'Sick Leave',
    leave_type: 'Sick Leave',
    startDate: TODAY_STR,
    start_date: TODAY_STR,
    endDate: TODAY_STR,
    end_date: TODAY_STR,
    days: 1,
    reason: 'Viral fever',
    handoverNote: 'Nurse Rahul taking evening ward round',
    handover_note: 'Nurse Rahul taking evening ward round',
    replacementStaffId: 'EMP-106',
    replacement_staff_id: 'EMP-106',
    status: 'Approved',
    appliedOn: TODAY_STR,
    applied_on: TODAY_STR,
    reviewedBy: 'Deepa Joshi (HR)',
    reviewed_by: 'Deepa Joshi (HR)',
    reviewedAt: TODAY_STR,
    reviewed_at: TODAY_STR,
    remarks: 'Medical certificate attached',
    created_at: new Date(),
  },
];

let CREDENTIALS = [
  {
    id: 1,
    employee_id: 'EMP-101',
    staffId: 'EMP-101',
    staff_name: 'Dr. Rajesh Sharma',
    staffName: 'Dr. Rajesh Sharma',
    department: 'Cardiology',
    title: 'Medical Council of India Registration',
    credential_type: 'Medical License',
    credentialType: 'Medical License',
    authority: 'Medical Council of India',
    license_no: 'MCI-44012',
    licenseNo: 'MCI-44012',
    valid_from: new Date('2021-01-01'),
    validFrom: new Date('2021-01-01'),
    valid_until: new Date('2028-12-31'),
    validUntil: new Date('2028-12-31'),
    verified_status: 'VERIFIED',
    verifiedStatus: 'VERIFIED',
    verified_by: 'HR Admin',
    verifiedBy: 'HR Admin',
    verified_on: new Date('2021-03-01'),
    verifiedOn: new Date('2021-03-01'),
    remarks: 'Valid and authenticated',
  },
  {
    id: 2,
    employee_id: 'EMP-102',
    staffId: 'EMP-102',
    staff_name: 'Dr. Priya Patel',
    staffName: 'Dr. Priya Patel',
    department: 'Emergency',
    title: 'State Medical Council Registration',
    credential_type: 'Medical License',
    credentialType: 'Medical License',
    authority: 'Telangana State Medical Council',
    license_no: 'SMB-99214',
    licenseNo: 'SMB-99214',
    valid_from: new Date('2022-01-01'),
    validFrom: new Date('2022-01-01'),
    valid_until: new Date('2027-06-30'),
    validUntil: new Date('2027-06-30'),
    verified_status: 'VERIFIED',
    verifiedStatus: 'VERIFIED',
    verified_by: 'HR Admin',
    verifiedBy: 'HR Admin',
    verified_on: new Date('2022-01-15'),
    verifiedOn: new Date('2022-01-15'),
    remarks: 'Valid state board registration',
  },
  {
    id: 3,
    employee_id: 'EMP-105',
    staffId: 'EMP-105',
    staff_name: 'Nurse Sunita Devi',
    staffName: 'Nurse Sunita Devi',
    department: 'ICU',
    title: 'Indian Nursing Council Practicing Certificate',
    credential_type: 'Nursing License',
    credentialType: 'Nursing License',
    authority: 'Indian Nursing Council',
    license_no: 'INC-88201',
    licenseNo: 'INC-88201',
    valid_from: new Date('2020-01-01'),
    validFrom: new Date('2020-01-01'),
    valid_until: new Date(Date.now() + 20 * 86400000), // Expiring in 20 days
    validUntil: new Date(Date.now() + 20 * 86400000),
    verified_status: 'VERIFIED',
    verifiedStatus: 'VERIFIED',
    verified_by: 'HR Admin',
    verifiedBy: 'HR Admin',
    verified_on: new Date('2020-08-15'),
    verifiedOn: new Date('2020-08-15'),
    remarks: 'Renewal submission pending',
  },
  {
    id: 4,
    employee_id: 'EMP-109',
    staffId: 'EMP-109',
    staff_name: 'Sneha Kulkarni',
    staffName: 'Sneha Kulkarni',
    department: 'Pharmacy',
    title: 'Registered Pharmacist License',
    credential_type: 'Pharmacy License',
    credentialType: 'Pharmacy License',
    authority: 'Pharmacy Council of India',
    license_no: 'PCI-55912',
    licenseNo: 'PCI-55912',
    valid_from: new Date('2021-01-01'),
    validFrom: new Date('2021-01-01'),
    valid_until: new Date(Date.now() + 14 * 86400000), // Expiring in 14 days
    validUntil: new Date(Date.now() + 14 * 86400000),
    verified_status: 'VERIFIED',
    verifiedStatus: 'VERIFIED',
    verified_by: 'HR Admin',
    verifiedBy: 'HR Admin',
    verified_on: new Date('2021-06-15'),
    verifiedOn: new Date('2021-06-15'),
    remarks: 'Renewal notice sent',
  },
];

let PAYROLL_RUNS = [
  {
    id: 'PR-2026-09',
    hospital_id: 1,
    month: 'September',
    year: 2026,
    status: 'Approved',
    run_status: 'Approved',
    total_employees: EMPLOYEES.length,
    total_gross: EMPLOYEES.reduce((acc, e) => acc + (e.basic + e.hra + e.allowances), 0),
    total_deductions: EMPLOYEES.reduce((acc, e) => acc + (e.pf + e.tax), 0),
    total_net: EMPLOYEES.reduce((acc, e) => acc + e.net_pay, 0),
    created_at: new Date('2026-09-30'),
    approved_by: 'Deepa Joshi (HR)',
  },
];

let PAYROLL_ITEMS = EMPLOYEES.map((emp, index) => {
  const gross = emp.basic + emp.hra + emp.allowances;
  const totalDeductions = emp.pf + emp.tax;
  return {
    id: index + 1,
    payroll_run_id: 'PR-2026-09',
    payrollRunId: 'PR-2026-09',
    employee_id: emp.id,
    staffId: emp.id,
    staff_name: emp.name,
    staffName: emp.name,
    department: emp.department,
    designation: emp.designation,
    basic: emp.basic,
    hra: emp.hra,
    allowances: emp.allowances,
    gross,
    pf: emp.pf,
    tax: emp.tax,
    other_deductions: 0,
    otherDeductions: 0,
    total_deductions: totalDeductions,
    totalDeductions,
    net_pay: emp.net_pay,
    netPay: emp.net_pay,
    paid_leave_days: 1,
    paidLeaveDays: 1,
    unpaid_leave_days: 0,
    unpaidLeaveDays: 0,
    absent_days: 0,
    absentDays: 0,
    overtime_hours: 0,
    overtimeHours: 0,
    overtime_amount: 0,
    overtimeAmount: 0,
    leave_deductions: 0,
    leaveDeductions: 0,
    status: 'Approved',
    run_status: 'Approved',
    runStatus: 'Approved',
    bank_account_masked: `••••••••${emp.account_number.slice(-4)}`,
    bankAccountMasked: `••••••••${emp.account_number.slice(-4)}`,
    pan_masked: `•••••${emp.pan_number.slice(-4)}`,
    panMasked: `•••••${emp.pan_number.slice(-4)}`,
    bank_name: emp.bank_name,
    bankName: emp.bank_name,
    ifsc_code: emp.ifsc_code,
    ifscCode: emp.ifsc_code,
  };
});

/**
 * Executes a simulated SQL query against the in-memory dataset
 */
export async function executeMemoryQuery(text, params = []) {
  const queryStr = text.trim();
  const lower = queryStr.toLowerCase();

  // 1. Health check or version check
  if (lower.includes('current_database()')) {
    return {
      rows: [{
        current_database: 'hospai_enterprise (in-memory mode)',
        current_user: 'postgres',
        version: 'PostgreSQL 16.0 (Enterprise In-Memory Engine)',
      }],
      rowCount: 1,
    };
  }

  // 2. HR Overview KPIs
  if (lower.includes('count(*) filter') && lower.includes('from employees')) {
    const total_staff = EMPLOYEES.filter((e) => e.is_active).length;
    const on_duty = EMPLOYEES.filter((e) => e.is_active && e.duty_status === 'On Duty').length;
    const doctors = EMPLOYEES.filter((e) => e.is_active && e.category === 'Doctor').length;
    const nurses = EMPLOYEES.filter((e) => e.is_active && e.category === 'Nursing').length;
    return {
      rows: [{ total_staff, on_duty, doctors, nurses }],
      rowCount: 1,
    };
  }

  if (lower.includes('from leave_requests') && lower.includes('status = \'pending\'')) {
    const pending_leaves = LEAVES.filter((l) => l.status === 'Pending').length;
    return { rows: [{ pending_leaves }], rowCount: 1 };
  }

  if (lower.includes('from employee_credentials') && lower.includes('valid_until')) {
    const expiring_licenses = CREDENTIALS.filter((c) => {
      const diff = (new Date(c.valid_until).getTime() - Date.now()) / (1000 * 86400 * 30);
      return diff <= 1 && diff >= 0;
    }).length;
    return { rows: [{ expiring_licenses }], rowCount: 1 };
  }

  if (lower.includes('from salary_structures') || (lower.includes('sum(s.net_pay)') || lower.includes('monthly_payroll'))) {
    const monthly_payroll = EMPLOYEES.reduce((acc, e) => acc + (e.net_pay || 0), 0);
    return { rows: [{ monthly_payroll }], rowCount: 1 };
  }

  // 3. Employees queries
  if (lower.includes('from employees')) {
    if (lower.startsWith('select')) {
      let filtered = [...EMPLOYEES];
      // Check for employee by ID (e.g. $1 or EMP-xxx)
      if (params.length > 0) {
        const idParam = params.find((p) => typeof p === 'string' && p.startsWith('EMP-'));
        if (idParam) {
          filtered = filtered.filter((e) => e.id === idParam);
        }
      }
      return { rows: filtered, rowCount: filtered.length };
    }
  }

  // 4. Attendance queries
  if (lower.includes('from attendance')) {
    if (lower.startsWith('select')) {
      let filtered = [...ATTENDANCE];
      if (params.length > 0) {
        const empId = params.find((p) => typeof p === 'string' && p.startsWith('EMP-'));
        if (empId) filtered = filtered.filter((a) => a.staffId === empId);
      }
      return { rows: filtered, rowCount: filtered.length };
    }
  }

  // 5. Leave requests queries
  if (lower.includes('from leave_requests')) {
    if (lower.startsWith('select')) {
      let filtered = [...LEAVES];
      if (params.length > 0) {
        const empId = params.find((p) => typeof p === 'string' && p.startsWith('EMP-'));
        if (empId) filtered = filtered.filter((l) => l.staffId === empId);
      }
      return { rows: filtered, rowCount: filtered.length };
    }
  }

  // 6. Credentials queries
  if (lower.includes('from employee_credentials')) {
    if (lower.startsWith('select')) {
      let filtered = [...CREDENTIALS];
      if (params.length > 0) {
        const empId = params.find((p) => typeof p === 'string' && p.startsWith('EMP-'));
        if (empId) filtered = filtered.filter((c) => c.staffId === empId);
      }
      return { rows: filtered, rowCount: filtered.length };
    }
  }

  // 7. Payroll queries
  if (lower.includes('from payroll_runs')) {
    return { rows: PAYROLL_RUNS, rowCount: PAYROLL_RUNS.length };
  }

  if (lower.includes('from payroll_items')) {
    return { rows: PAYROLL_ITEMS, rowCount: PAYROLL_ITEMS.length };
  }

  // 8. Shifts
  if (lower.includes('from shifts')) {
    return { rows: SHIFTS, rowCount: SHIFTS.length };
  }

  // 9. Leave types
  if (lower.includes('from leave_types')) {
    return { rows: LEAVE_TYPES, rowCount: LEAVE_TYPES.length };
  }

  // 10. Departments
  if (lower.includes('from departments')) {
    return { rows: DEPARTMENTS, rowCount: DEPARTMENTS.length };
  }

  // Generic fallback for INSERT / UPDATE / SELECT
  return { rows: [], rowCount: 1 };
}

export default {
  executeMemoryQuery,
  EMPLOYEES,
  ATTENDANCE,
  LEAVES,
  CREDENTIALS,
  PAYROLL_RUNS,
  PAYROLL_ITEMS,
  SHIFTS,
  DEPARTMENTS,
};
