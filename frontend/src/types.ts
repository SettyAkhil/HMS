export interface Notice {
  type: "success" | "error" | "warning"
  message: string
}

export type TriageCategory = {
  id: number
  category_code: string
  category_label: string
  description: string | null
  color: string
  sort_order: number
}

export interface Patient {
  id?: number
  patient_id: string
  name: string
  middle_name?: string
  last_name?: string
  dob?: string
  age?: number | string | null
  weight?: number | string | null
  height?: number | string | null
  gender?: string
  pregnant?: boolean | number
  allergies?: string
  symptoms?: string
  phone?: string
  email?: string
  address?: string
  blood_group?: string
  emergency_contact?: string
  guardian_name?: string
  aadhar_number?: string
  created_at?: string
  status?: string
}
