import { Pill } from "lucide-react"

interface Breadcrumb {
  label: string
  page?: string
}

interface PageHeaderProps {
  breadcrumbs?: Breadcrumb[]
  title: React.ReactNode
  description?: string
  actions?: React.ReactNode
  onNavigate?: (page: string) => void
}

export default function PageHeader({
  title,
  description,
  actions,
}: PageHeaderProps) {
  // Strip emoji prefixes if passed as text string
  const cleanTitle = typeof title === "string" ? title.replace(/^[💊💉🧪]\s*/, "") : title

  return (
    <div className="bg-white border-b border-[#DDE2EC] px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 -mx-6 -mt-6 mb-6 shadow-2xs">
      <div>
        <div className="flex items-center gap-2">
          <Pill className="w-5 h-5 text-[#1B4FD8]" />
          <h1 className="text-lg font-semibold text-gray-900 tracking-tight">
            {cleanTitle}
          </h1>
        </div>
        {description && (
          <p className="text-[12px] text-[#64748B] mt-0.5 font-normal">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap">{actions}</div>
      )}
    </div>
  )
}
