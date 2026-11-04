interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="pharmacy-module flex h-full flex-col overflow-hidden bg-[#F8FAFC]">
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  )
}
