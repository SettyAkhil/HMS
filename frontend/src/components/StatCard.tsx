import type { ReactNode } from "react"

type Props = {
  label: string
  value: string | number
  icon?: ReactNode
}

export default function StatCard({ label, value, icon }: Props) {
  return (
    <div className="stat-card">
      {icon && <span className="stat-card-icon">{icon}</span>}
      <div>
        <p>{label}</p>
        <h3>{value}</h3>
      </div>
    </div>
  )
}
