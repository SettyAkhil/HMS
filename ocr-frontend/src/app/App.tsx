import React, { useState, useRef, useEffect } from "react"
import {
  ThemeProvider,
  useTheme,
  SidebarNavigation,
  SidebarButton,
  Avatar as AstraAvatar,
} from "@figma/astraui"
import {
  FileText,
  Brain,
  Search,
  Shield,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  Upload,
  Clock,
  Star,
  MessageSquare,
  Pill,
  Activity,
  Folder,
  Bell,
  LogOut,
  Plus,
  Filter,
  Download,
  Eye,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Send,
  Mic,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  Home,
  Database,
  Lock,
  Key,
  Server,
  Cpu,
  HardDrive,
  Zap,
  FileSearch,
  Layers,
  ArrowRight,
  BarChart2,
  Stethoscope,
  PanelLeft,
  Command,
  Hash,
  Tag,
  Bookmark,
  RefreshCw,
  Grid,
  List,
  Copy,
  Trash2,
  Edit2,
  ExternalLink,
  Info,
  UserCheck,
  AlertCircle,
  TrendingUp,
  Package,
  Calendar,
  MapPin,
  Phone,
  Mail,
  Globe,
  Building2,
  Sparkles,
  X,
  Check,
  ChevronRight as CR,
  Menu,
  PanelRight,
  SplitSquareHorizontal,
  Maximize2,
  SquareTerminal,
  FilePlus,
  ClipboardList,
  Beaker,
  HeartPulse,
  Microscope,
  Ambulance,
  Syringe,
  Inbox,
  Paperclip,
  Sun,
  Moon,
  ArrowLeft,
} from "lucide-react"
import kepplerLogo from "../imports/ChatGPT_Image_Jul_1__2026__11_20_03_AM.png"
import { ImageWithFallback } from "./components/figma/ImageWithFallback"
import { AuthProvider, useAuth } from "./lib/auth-context"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./components/ui/dropdown-menu"
import {
  ApiError,
  assistantApi,
  dashboardApi,
  ocrApi,
  summarizerApi,
  vaultApi,
  type ActiveJob,
  type ChatMessage,
  type DashboardSummary,
  type JobStatus,
  type OCRJobResult,
  type SummarizerJobResult,
  type VaultDoc,
} from "./lib/api"

// ─── Types ───────────────────────────────────────────────────────────────────
type Screen = "auth-login" | "auth-forgot" | "auth-2fa" | "auth-welcome" | "home" | "ocr-workspace" | "ocr-processing" | "ocr-result" | "pdf-summarizer" | "ai-assistant" | "document-vault" | "admin" | "settings"

interface NavItem {
  id: Screen
  label: string
  icon: React.ReactNode
  badge?: string
  section?: string
}

// ─── Shared primitives ────────────────────────────────────────────────────────
const Badge = ({
  children,
  color = "blue",
}: {
  children: React.ReactNode
  color?: "blue" | "green" | "yellow" | "red" | "teal" | "gray" | "sky"
}) => {
  const map: Record<string, string> = {
    blue: "bg-secondary text-primary border border-primary/20",
    green:
      "bg-[var(--med-success)]/10 text-[var(--med-success)] border border-[var(--med-success)]/20",
    yellow:
      "bg-[var(--med-warning)]/10 text-[var(--med-warning)] border border-[var(--med-warning)]/20",
    red: "bg-destructive/10 text-destructive border border-destructive/20",
    teal: "bg-[var(--med-teal)]/10 text-[var(--med-teal)] border border-[var(--med-teal)]/20",
    gray: "bg-muted text-muted-foreground border border-border",
    sky: "bg-[var(--med-sky)]/10 text-[var(--med-sky)] border border-[var(--med-sky)]/20",
  }
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${map[color]}`}
    >
      {children}
    </span>
  )
}

const Chip = ({
  label,
  color = "gray",
}: {
  label: string
  color?: "blue" | "green" | "yellow" | "red" | "teal" | "gray" | "sky"
}) => <Badge color={color}>{label}</Badge>

const Avatar = ({
  name,
  size = "sm",
}: {
  name: string
  size?: "sm" | "md" | "lg"
}) => {
  const sz =
    size === "lg"
      ? "w-10 h-10 text-sm"
      : size === "md"
        ? "w-8 h-8 text-xs"
        : "w-6 h-6 text-[10px]"
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
  return (
    <div
      className={`${sz} rounded-full bg-secondary text-primary flex items-center justify-center font-semibold flex-shrink-0`}
    >
      {initials}
    </div>
  )
}

const ProgressBar = ({
  value,
  color = "#2563EB",
  label,
}: {
  value: number
  color?: string
  label?: string
}) => (
  <div className="w-full">
    {label && (
      <div className="flex justify-between text-xs text-[var(--med-text-secondary)] mb-1">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
    )}
    <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${value}%`, backgroundColor: color }}
      />
    </div>
  </div>
)

const StatusDot = ({
  status,
}: {
  status: "online" | "processing" | "error" | "idle"
}) => {
  const map = {
    online: "bg-med-success",
    processing: "bg-med-warning animate-pulse",
    error: "bg-destructive",
    idle: "bg-[#94A3B8]",
  }
  return <span className={`inline-block w-2 h-2 rounded-full ${map[status]}`} />
}

const Skeleton = ({ className }: { className?: string }) => (
  <div className={`animate-pulse bg-muted rounded ${className ?? ""}`} />
)

const BasicMarkdown = ({
  text,
  className,
}: {
  text: string
  className?: string
}) => (
  <div className={className}>
    {text.split("\n").map((line, i) => {
      let cleanLine = line.replace(/^#+\s*/, "")
      const parts = cleanLine.split(/(\*\*.*?\*\*)/g)
      return (
        <div key={i} className="min-h-[1.2em]">
          {parts.map((part, j) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return (
                <strong key={j} className="font-semibold text-foreground">
                  {part.slice(2, -2)}
                </strong>
              )
            }
            const varParts = part.split(/(\[.*?\s→\s.*?\])/g)
            if (varParts.length > 1) {
              return varParts.map((vp, k) => {
                if (
                  vp.startsWith("[") &&
                  vp.includes("→") &&
                  vp.endsWith("]")
                ) {
                  return (
                    <span
                      key={k}
                      className="px-1 py-0.5 mx-1 bg-primary/10 text-primary font-medium rounded border border-primary/20"
                    >
                      {vp}
                    </span>
                  )
                }
                return <span key={k}>{vp}</span>
              })
            }
            return <span key={j}>{part}</span>
          })}
        </div>
      )
    })}
  </div>
)

const AuthThemeToggle = () => {
  const { theme, toggleTheme } = useTheme()
  return (
    <button
      onClick={toggleTheme}
      className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center rounded-full bg-card border border-border text-foreground hover:bg-muted transition-colors shadow-sm z-50"
    >
      {theme === "dark" ? (
        <Sun className="w-5 h-5" />
      ) : (
        <Moon className="w-5 h-5" />
      )}
    </button>
  )
}

// ─── Auth Screens ─────────────────────────────────────────────────────────────
const AuthLogin = ({ onNavigate }: { onNavigate: (s: Screen) => void }) => {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<"login" | "register">("login")
  const [email, setEmail] = useState("")
  const [pass, setPass] = useState("")
  const [confirmPass, setConfirmPass] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setError(null)
    setInfo(null)
    if (!email.trim() || !pass) {
      setError("Please enter your username and password.")
      return
    }
    setLoading(true)
    try {
      if (mode === "login") {
        await login(email.trim(), pass)
        onNavigate("auth-welcome")
      } else {
        if (pass !== confirmPass) {
          setError("Passwords do not match.")
          return
        }
        await register(email.trim(), pass)
        setInfo("Account created — you can sign in now.")
        setMode("login")
        setPass("")
        setConfirmPass("")
      }
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Something went wrong. Please try again.",
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex relative"
      style={{
        background:
          "linear-gradient(135deg, var(--background) 0%, var(--secondary) 100%)",
      }}
    >
      <AuthThemeToggle />
      {/* Left panel */}
      <div className="hidden lg:flex flex-col w-[480px] bg-primary p-12 justify-between relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 80%, var(--accent) 0%, transparent 50%), radial-gradient(circle at 80% 20%, var(--med-teal) 0%, transparent 50%)",
          }}
        />
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-16">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center overflow-hidden shadow-lg border-2 border-white">
              <ImageWithFallback
                src={kepplerLogo}
                alt="Keppler Logo"
                className="w-full h-full object-cover scale-110"
              />
            </div>
            <span className="text-white font-bold text-2xl tracking-tight">
              Keppler AI
            </span>
          </div>
          <h2 className="text-white text-3xl font-semibold leading-snug mb-4">
            Medical Document Intelligence
          </h2>
          <p className="text-white/70 text-sm leading-relaxed">
            Transforming how healthcare teams process, understand, and act on
            medical records.
          </p>
        </div>
        <div className="relative z-10 space-y-4">
          {[
            {
              icon: <FileSearch className="w-4 h-4" />,
              label: "AI-powered OCR & document extraction",
            },
            {
              icon: <Sparkles className="w-4 h-4" />,
              label: "Clinical summarization & RAG search",
            },
            {
              icon: <Shield className="w-4 h-4" />,
              label: "HIPAA compliant, SOC 2 certified",
            },
          ].map((f) => (
            <div
              key={f.label}
              className="flex items-center gap-3 text-white/80 text-sm"
            >
              <div className="w-7 h-7 bg-card/10 rounded flex items-center justify-center flex-shrink-0">
                {f.icon}
              </div>
              {f.label}
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center overflow-hidden shadow-sm border border-border">
              <ImageWithFallback
                src={kepplerLogo}
                alt="Keppler Logo"
                className="w-full h-full object-cover scale-110"
              />
            </div>
            <span className="font-bold text-xl text-foreground tracking-tight">
              Keppler AI
            </span>
          </div>
          <div className="mb-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-secondary text-secondary-foreground rounded text-xs font-medium border border-primary/20">
            <Building2 className="w-3 h-3" />
            St. Mary Medical Center
          </div>
          <h1 className="text-2xl font-semibold text-foreground mb-1">
            {mode === "login"
              ? "Sign in to your workspace"
              : "Create your workspace account"}
          </h1>
          <p className="text-sm text-muted-foreground mb-8">
            Use your Keppler username to continue.
          </p>

          {error && (
            <div className="mb-4 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {info && (
            <div className="mb-4 text-xs text-med-success bg-[var(--med-success)]/10 border border-[var(--med-success)]/20 rounded-lg px-3 py-2">
              {info}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="dr.chen"
                className="w-full px-3.5 py-2.5 rounded-lg border border-border text-foreground text-sm bg-card focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-med-text-tertiary transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="••••••••"
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="w-full px-3.5 py-2.5 rounded-lg border border-border text-foreground text-sm bg-card focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-med-text-tertiary transition-all"
              />
            </div>
            {mode === "register" && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Confirm password
                </label>
                <input
                  type="password"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  placeholder="••••••••"
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-border text-foreground text-sm bg-card focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-med-text-tertiary transition-all"
                />
              </div>
            )}
            <button
              onClick={submit}
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setMode(mode === "login" ? "register" : "login")
                setError(null)
                setInfo(null)
              }}
              className="text-xs text-primary hover:underline"
            >
              {mode === "login"
                ? "New here? Create an account"
                : "Already have an account? Sign in"}
            </button>
          </div>

          <p className="mt-8 text-xs text-center text-med-text-tertiary">
            Protected by 256-bit TLS · HIPAA Compliant · SOC 2 Type II
          </p>
        </div>
      </div>
    </div>
  )
}

const Auth2FA = ({ onNavigate }: { onNavigate: (s: Screen) => void }) => {
  const [code, setCode] = useState(["", "", "", "", "", ""])
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const handleKey = (i: number, val: string) => {
    const next = [...code]
    next[i] = val.slice(-1)
    setCode(next)
    if (val && i < 5) inputs.current[i + 1]?.focus()
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative">
      <button
        onClick={() => onNavigate("auth-login")}
        className="absolute top-6 left-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back to login
      </button>
      <AuthThemeToggle />
      <div className="w-full max-w-sm text-center">
        <div className="w-14 h-14 bg-secondary rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Lock className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">
          Two-factor authentication
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          Enter the 6-digit code sent to{" "}
          <span className="text-foreground font-medium">+1 (555) ···-··89</span>
        </p>
        <div className="flex gap-2 justify-center mb-8">
          {code.map((v, i) => (
            <input
              key={i}
              ref={(el) => {
                inputs.current[i] = el
              }}
              value={v}
              onChange={(e) => handleKey(i, e.target.value)}
              maxLength={1}
              className="w-11 h-12 text-center text-lg font-semibold border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-foreground"
            />
          ))}
        </div>
        <button
          onClick={() => onNavigate("auth-welcome")}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2.5 rounded-lg text-sm transition-colors"
        >
          Verify and sign in
        </button>
        <button className="mt-3 text-xs text-primary hover:underline">
          Resend code
        </button>
      </div>
    </div>
  )
}

const AuthWelcome = ({ onNavigate }: { onNavigate: (s: Screen) => void }) => {
  const { user } = useAuth()
  const [summary, setSummary] = useState<{
    vault_document_count: number
    active_jobs: ActiveJob[]
  } | null>(null)

  useEffect(() => {
    dashboardApi
      .summary()
      .then(setSummary)
      .catch(() => setSummary(null))
  }, [])

  const stats = [
    {
      label: "Documents",
      value: String(summary?.vault_document_count ?? "—"),
      icon: <FileText className="w-4 h-4 text-primary" />,
    },
    {
      label: "Active Jobs",
      value: String(summary?.active_jobs?.length ?? "—"),
      icon: <Clock className="w-4 h-4 text-med-warning" />,
    },
  ]

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative">
      <AuthThemeToggle />
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-[var(--med-success)]/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-8 h-8 text-med-success" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">
          Welcome back, {user?.username ?? "there"}
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          Keppler AI Medical Document Intelligence
        </p>
        <div className="grid grid-cols-2 gap-3 mb-8 text-left">
          {stats.map((s) => (
            <div
              key={s.label}
              className="bg-card border border-border rounded-xl p-4"
            >
              {s.icon}
              <div className="text-xl font-semibold text-foreground mt-2">
                {s.value}
              </div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
        <button
          onClick={() => onNavigate("home")}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
        >
          Enter workspace <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const HoverTooltip = ({
  children,
  text,
}: {
  children: React.ReactNode
  text: string
}) => (
  <div className="group relative flex">
    {children}
    <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1 bg-gray-800 text-white dark:bg-gray-200 dark:text-black text-[11px] font-medium rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-[100] pointer-events-none shadow-lg">
      {text}
    </div>
  </div>
)

const CustomSidebarButton = ({
  icon,
  onClick,
  active,
  title,
  className = "",
}: {
  icon: React.ReactNode
  onClick: () => void
  active?: boolean
  title: string
  className?: string
}) => (
  <HoverTooltip text={title}>
    <button
      onClick={onClick}
      className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      } ${className}`}
    >
      <div className="w-5 h-5 flex items-center justify-center">{icon}</div>
    </button>
  </HoverTooltip>
)

const Sidebar = ({
  current,
  onNavigate,
  collapsed,
  setCollapsed,
}: {
  current: Screen
  onNavigate: (s: Screen) => void
  collapsed: boolean
  setCollapsed: (v: boolean) => void
}) => {
  const { user } = useAuth()
  const initials = (user?.username || "?").slice(0, 2).toUpperCase()

  const navItem = (screen: Screen) => {
    onNavigate(screen)
    setCollapsed(false)
  }

  return (
    <div className="flex h-full">
      <div className="relative h-full z-20 flex flex-col bg-card border-r border-border w-[70px] py-4 items-center">
        {/* Custom logo */}
        <div className="w-10 h-10 mb-8 bg-white rounded-full flex items-center justify-center overflow-hidden shadow-sm border border-border flex-shrink-0">
          <ImageWithFallback
            src={kepplerLogo}
            alt="Keppler AI"
            className="w-full h-full object-cover scale-[1.15]"
          />
        </div>

        <div className="flex-1 flex flex-col gap-3 w-full px-2 items-center">
          <CustomSidebarButton
            icon={<Home strokeWidth={1.5} />}
            onClick={() => navItem("home")}
            active={current === "home"}
            title="Workspace"
          />
          <CustomSidebarButton
            icon={<FileSearch strokeWidth={1.5} />}
            onClick={() => navItem("ocr-workspace")}
            active={
              current === "ocr-workspace" ||
              current === "ocr-processing" ||
              current === "ocr-result"
            }
            title="OCR Workspace"
          />
          <CustomSidebarButton
            icon={<Database strokeWidth={1.5} />}
            onClick={() => navItem("document-vault")}
            active={current === "document-vault"}
            title="Document Vault"
          />
          <CustomSidebarButton
            icon={<Layers strokeWidth={1.5} />}
            onClick={() => navItem("pdf-summarizer")}
            active={current === "pdf-summarizer"}
            title="PDF Summarizer"
          />
          <CustomSidebarButton
            icon={<Sparkles strokeWidth={1.5} />}
            onClick={() => navItem("ai-assistant")}
            active={current === "ai-assistant"}
            title="AI Assistant"
          />
        </div>

        <div className="flex flex-col gap-3 w-full px-2 items-center mt-auto">
          <CustomSidebarButton
            icon={<Shield strokeWidth={1.5} />}
            onClick={() => navItem("admin")}
            active={current === "admin"}
            title="Admin"
          />
          <CustomSidebarButton
            icon={<Settings strokeWidth={1.5} />}
            onClick={() => navItem("settings")}
            active={current === "settings"}
            title="Settings"
          />
          <div className="mt-2">
            <AstraAvatar
              type="initial"
              initials={initials}
              size="medium"
              shape="circle"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Top Bar ──────────────────────────────────────────────────────────────────
const TopBar = ({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}) => (
  <div className="h-14 border-b border-border flex items-center px-6 gap-4 flex-shrink-0 bg-card">
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline gap-2">
        <h1 className="text-sm font-semibold text-foreground truncate">
          {title}
        </h1>
        {subtitle && (
          <span className="text-xs text-muted-foreground truncate hidden sm:inline">
            {subtitle}
          </span>
        )}
      </div>
    </div>
    <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
    <button className="relative text-muted-foreground hover:text-foreground transition-colors">
      <Bell className="w-4.5 h-4.5" />
      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-destructive rounded-full text-destructive-foreground text-[9px] flex items-center justify-center font-bold">
        4
      </span>
    </button>
  </div>
)

// ─── Workspace Home ───────────────────────────────────────────────────────────
const WorkspaceHome = ({ onNavigate }: { onNavigate: (s: Screen) => void }) => {
  const { user } = useAuth()
  const quickActions = [
    {
      label: "Document Vault",
      icon: <Database className="w-4 h-4" />,
      screen: "document-vault" as Screen,
      desc: "Browse extracted documents",
    },
    {
      label: "Summarize PDF",
      icon: <Layers className="w-4 h-4" />,
      screen: "pdf-summarizer" as Screen,
      desc: "Generate clinical summaries",
    },
    {
      label: "Ask AI",
      icon: <Sparkles className="w-4 h-4" />,
      screen: "ai-assistant" as Screen,
      desc: "RAG over patient files",
    },
  ]

  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dashboardApi
      .summary()
      .then(setSummary)
      .catch(() => setSummary(null))
      .finally(() => setLoading(false))
  }, [])

  const jobLabel = (jobType: string) =>
    jobType === "summarizer" ? "PDF Summary" : "OCR Extraction"

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-[1200px] mx-auto p-8 space-y-8">
        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              Welcome to KEPPLER{user ? `, ${user.username}` : ""}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Medical Document Intelligence Platform
            </p>
          </div>
          {/* Action buttons removed as requested */}
        </div>

        {/* Hero Value Prop / Upload Area */}
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-10 text-center relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 50% 0%, var(--primary) 0%, transparent 70%)",
            }}
          />
          <div className="relative z-10 max-w-2xl mx-auto">
            <div className="w-14 h-14 bg-secondary rounded-2xl flex items-center justify-center mx-auto mb-5 border border-primary/20">
              <FileSearch className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-3">
              Intelligent Document Extraction
            </h2>
            <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
              Drop clinical notes, lab results, or radiology reports here.
              KEPPLER will automatically extract text via OCR, identify medical
              entities, and organize them into the patient's secure timeline.
            </p>
            <div
              onClick={() => onNavigate("ocr-workspace")}
              className="border-2 border-dashed border-primary/40 bg-secondary/30 rounded-xl p-8 cursor-pointer hover:border-primary hover:bg-secondary/50 transition-all flex flex-col items-center justify-center gap-3"
            >
              <Upload className="w-6 h-6 text-primary" />
              <div className="text-sm font-medium text-foreground">
                Click to upload or drag files here
              </div>
              <div className="text-xs text-muted-foreground">
                Supports PDF, JPG, PNG (Max 50MB)
              </div>
            </div>
          </div>
        </div>

        {/* Feature Navigation Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <div
              key={action.label}
              onClick={() => onNavigate(action.screen)}
              className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer group flex items-start gap-4"
            >
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-primary group-hover:scale-110 transition-transform flex-shrink-0">
                {action.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground mb-0.5">
                  {action.label}
                </div>
                <div className="text-xs text-muted-foreground leading-snug">
                  {action.desc}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Real activity, sourced from /dashboard/summary */}
        <div className="space-y-8">
          {/* Active AI Processing */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" /> Active AI
                Processing
              </h3>
              <span className="text-xs text-muted-foreground">
                {loading
                  ? "Loading…"
                  : `${summary?.active_jobs?.length ?? 0} job(s) running`}
              </span>
            </div>
            <div className="bg-card border border-border rounded-xl divide-y divide-muted">
              {summary && (summary.active_jobs?.length ?? 0) === 0 && (
                <div className="p-4 text-sm text-muted-foreground">
                  No documents currently processing.
                </div>
              )}
              {summary?.active_jobs?.map((item) => (
                <div
                  key={item.job_id}
                  className="p-4 hover:bg-muted/30 transition-colors flex flex-col gap-3"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="mt-1">
                        <StatusDot
                          status={
                            item.status === "PROCESSING" ? "processing" : "idle"
                          }
                        />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">
                          {item.filename ?? "Untitled document"}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {jobLabel(item.job_type)}
                        </div>
                      </div>
                    </div>
                    <Badge
                      color={item.status === "PROCESSING" ? "yellow" : "gray"}
                    >
                      {item.status.toLowerCase()}
                    </Badge>
                  </div>
                  <div className="ml-5">
                    <ProgressBar value={item.progress} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Vault Documents */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Database className="w-4 h-4 text-primary" /> Recently Added to
                Vault
              </h3>
              <button
                onClick={() => onNavigate("document-vault")}
                className="text-sm text-primary hover:underline font-medium"
              >
                Browse All
              </button>
            </div>
            <div className="bg-card border border-border rounded-xl divide-y divide-muted">
              {summary && (summary.recent_documents?.length ?? 0) === 0 && (
                <div className="p-4 text-sm text-muted-foreground">
                  Your vault is empty — process a document in the OCR Workspace
                  to get started.
                </div>
              )}
              {summary?.recent_documents?.map((doc) => (
                <div
                  key={doc.id}
                  className="p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors cursor-pointer group"
                  onClick={() => onNavigate("document-vault")}
                >
                  <div className="w-10 h-10 bg-secondary rounded-lg flex items-center justify-center text-primary">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {doc.filename}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {doc.extraction_date ?? ""}
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-2">
                    {doc.doc_category && (
                      <Chip label={doc.doc_category} color="sky" />
                    )}
                    <Badge color="teal">Complete</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── OCR Workspace ────────────────────────────────────────────────────────────
interface OcrJobEntry {
  jobId: string
  filename: string
  size: string
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
  progress: number
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const OCRWorkspace = ({
  onStartJob,
  onViewResult,
}: {
  onStartJob: (jobId: string, filename: string) => void
  onViewResult: (jobId: string, filename: string) => void
}) => {
  const [viewingResultId, setViewingResultId] = useState<string | null>(null)
  const [viewingResultFilename, setViewingResultFilename] =
    useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [tab, setTab] = useState<"upload" | "queue">("upload")
  const [blueprints, setBlueprints] = useState<string[]>([])
  const [selectedBlueprint, setSelectedBlueprint] = useState(
    "Universal OCR (Any Text)",
  )
  const [jobs, setJobs] = useState<OcrJobEntry[]>([])
  const [stagedFiles, setStagedFiles] = useState<File[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({})

  useEffect(() => {
    ocrApi
      .blueprints()
      .then((r) => {
        setBlueprints(r.blueprints)
        if (r.blueprints.length) setSelectedBlueprint(r.blueprints[0])
      })
      .catch(() => {})
    return () => {
      Object.values(pollTimers.current).forEach(clearInterval)
    }
  }, [])

  const pollJob = (jobId: string, filename: string) => {
    let failures = 0
    pollTimers.current[jobId] = setInterval(async () => {
      try {
        const status = await ocrApi.jobStatus(jobId)
        failures = 0
        setJobs((prev) =>
          prev.map((j) =>
            j.jobId === jobId
              ? { ...j, status: status.status, progress: status.progress }
              : j,
          ),
        )
        if (status.status === "COMPLETED" || status.status === "FAILED") {
          clearInterval(pollTimers.current[jobId])
          delete pollTimers.current[jobId]
        }
      } catch (e) {
        failures += 1
        // Only give up after 5 consecutive failures (e.g. auth expired / server down)
        if (failures >= 5) {
          clearInterval(pollTimers.current[jobId])
          delete pollTimers.current[jobId]
          setJobs((prev) =>
            prev.map((j) =>
              j.jobId === jobId ? { ...j, status: "FAILED" } : j,
            ),
          )
        }
      }
    }, 2500)
  }

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    setStagedFiles(Array.from(files))
  }

  const handleExtract = async () => {
    if (stagedFiles.length === 0) return
    setUploadError(null)
    for (const file of stagedFiles) {
      try {
        const res = await ocrApi.upload(file, selectedBlueprint)
        setJobs((prev) => [
          {
            jobId: res.job_id,
            filename: file.name,
            size: formatBytes(file.size),
            status: "PENDING",
            progress: 0,
          },
          ...prev,
        ])
        pollJob(res.job_id, file.name)
        onStartJob(res.job_id, file.name)
      } catch (e) {
        setUploadError(
          e instanceof ApiError
            ? e.message
            : "Upload failed. Please try again.",
        )
      }
    }
    setStagedFiles([])
  }

  const removeJob = (jobId: string) => {
    if (pollTimers.current[jobId]) clearInterval(pollTimers.current[jobId])
    setJobs((prev) => prev.filter((j) => j.jobId !== jobId))
  }

  const statusChip = (s: OcrJobEntry["status"]) => {
    const map: Record<OcrJobEntry["status"], [string, string]> = {
      PENDING: ["Queued", "gray"],
      PROCESSING: ["Processing", "yellow"],
      COMPLETED: ["Complete", "green"],
      FAILED: ["Error", "red"],
    }
    const [label, color] = map[s]
    return <Badge color={color as any}>{label}</Badge>
  }

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ""
        }}
      />
      <TopBar
        title="OCR Workspace"
        subtitle="Extract and structure text from medical documents"
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Main area */}
        <div className="flex-1 p-5 overflow-y-auto space-y-5">
          {/* Header row */}
          <div className="flex items-end justify-end pb-0">
            <div className="mb-2 mr-2 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Template:</span>
              <select
                value={selectedBlueprint}
                onChange={(e) => setSelectedBlueprint(e.target.value)}
                className="text-xs font-medium text-foreground bg-card border border-border rounded-md px-2 py-1 outline-none cursor-pointer hover:bg-muted/50 transition-colors"
              >
                {blueprints.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {uploadError && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              {uploadError}
            </div>
          )}

          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              handleFiles(e.dataTransfer.files)
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl flex items-center justify-between px-6 py-4 transition-all cursor-pointer ${
              dragging
                ? "border-primary bg-secondary"
                : "border-switch-background bg-card hover:border-[#93C5FD] hover:bg-background"
            }`}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center flex-shrink-0">
                <Upload className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {stagedFiles.length > 0
                    ? `${stagedFiles.length} file(s) ready for extraction`
                    : "Drop medical documents here"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  PDF, PNG, JPEG — processed with {selectedBlueprint}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  fileInputRef.current?.click()
                }}
                className="bg-secondary hover:bg-secondary/80 text-foreground text-xs font-medium px-4 py-2 rounded-lg transition-colors border border-border"
              >
                Browse files
              </button>
              {stagedFiles.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleExtract()
                  }}
                  className="bg-red-500 hover:bg-red-600 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Cpu className="w-3.5 h-3.5" /> Extract OCR
                </button>
              )}
            </div>
          </div>

          {/* Active Job Visualizer Removed */}

          <div className="bg-card border border-border rounded-xl overflow-hidden mt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Document", "Size", "Status", "Progress", "Actions"].map(
                    (h) => (
                      <th
                        key={h}
                        className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {jobs.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-6 text-xs text-muted-foreground text-center"
                    >
                      No documents uploaded yet.
                    </td>
                  </tr>
                )}
                {jobs.map((row) => (
                  <tr
                    key={row.jobId}
                    className="hover:bg-background transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <FileText className="w-4 h-4 text-med-text-tertiary flex-shrink-0" />
                        <span className="text-xs font-medium text-foreground truncate max-w-[200px]">
                          {row.filename}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">
                      {row.size}
                    </td>
                    <td className="px-5 py-3.5">{statusChip(row.status)}</td>
                    <td className="px-5 py-3.5 w-36">
                      <ProgressBar value={row.progress} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setViewingResultId(row.jobId)
                            setViewingResultFilename(row.filename)
                          }}
                          disabled={row.status !== "COMPLETED"}
                          className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title="View result"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              disabled={row.status !== "COMPLETED"}
                              className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Download"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-32">
                            {([
                              "md",
                              "pdf",
                              "docx",
                              "xlsx",
                              "json",
                            ] as const).map((fmt) => (
                              <DropdownMenuItem
                                key={fmt}
                                onClick={() =>
                                  ocrApi.downloadExport(
                                    row.jobId,
                                    fmt,
                                    `${row.filename}.${fmt}`,
                                  )
                                }
                              >
                                <span className="uppercase text-xs font-medium">
                                  {fmt} Format
                                </span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <button
                          onClick={() => removeJob(row.jobId)}
                          className="p-1.5 hover:bg-[#FEF2F2] rounded text-muted-foreground hover:text-destructive transition-colors"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Modal Result Viewer */}
          {viewingResultId && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6"
              onClick={(e) => {
                if (e.target === e.currentTarget) setViewingResultId(null)
              }}
            >
              <div className="w-full max-w-7xl h-full max-h-[90vh] flex flex-col shadow-2xl rounded-xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <OCRResult
                  jobId={viewingResultId}
                  filename={viewingResultFilename}
                  onNavigate={() => {}}
                  embedded={true}
                  onClose={() => setViewingResultId(null)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── OCR Processing Screen ────────────────────────────────────────────────────
// ─── OCR Result ───────────────────────────────────────────────────────────────
type ParsedBlock = {
  type: "key-value"
  pairs: { key: string; value: string }[]
} | { type: "table"; headers: string[]; rows: string[][] } | {
  type: "section"
  title: string
  lines: string[]
} | { type: "text"; content: string }

function parseDocumentContent(md: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = []
  let currentText: string[] = []
  let currentKv: { key: string; value: string }[] = []
  let currentTable: string[][] = []
  let currentSection: { title: string; lines: string[] } | null = null

  const flushText = () => {
    if (currentText.length > 0) {
      blocks.push({ type: "text", content: currentText.join("\n") })
      currentText = []
    }
  }

  const flushKv = () => {
    if (currentKv.length > 0) {
      blocks.push({ type: "key-value", pairs: currentKv })
      currentKv = []
    }
  }

  const flushTable = () => {
    if (currentTable.length > 1) {
      blocks.push({
        type: "table",
        headers: currentTable[0],
        rows: currentTable.slice(1),
      })
      currentTable = []
    } else if (currentTable.length === 1) {
      currentText.push(currentTable[0].join(" | "))
      currentTable = []
    }
  }

  const flushSection = () => {
    if (currentSection) {
      blocks.push({
        type: "section",
        title: currentSection.title,
        lines: currentSection.lines,
      })
      currentSection = null
    }
  }

  const flushAll = () => {
    flushText()
    flushKv()
    flushTable()
    flushSection()
  }

  for (const raw of md.split("\n")) {
    const line = raw.trim()
    if (!line) {
      flushAll()
      continue
    }

    if (line.includes("|")) {
      if (/^[|\-\s]+$/.test(line)) continue
      const cells = line
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c.length > 0)
      if (cells.length > 1) {
        flushAll()
        currentTable.push(cells)
        continue
      }
    } else {
      flushTable()
    }

    if (line.endsWith(":") && line.indexOf(":") === line.length - 1) {
      flushAll()
      currentSection = {
        title: line.substring(0, line.length - 1).trim(),
        lines: [],
      }
      continue
    }

    if (currentSection) {
      currentSection.lines.push(raw)
      continue
    }

    const colonIdx = line.indexOf(":")
    if (colonIdx > 0 && colonIdx < line.length - 1) {
      const key = line.substring(0, colonIdx).trim()
      const val = line.substring(colonIdx + 1).trim()
      if (key.length > 0 && val.length > 0) {
        flushText()
        currentKv.push({ key, value: val })
        continue
      }
    } else {
      flushKv()
    }

    currentText.push(raw)
  }
  flushAll()
  return blocks
}

const OCRResult = ({
  jobId,
  filename,
  onNavigate,
  embedded,
  onClose,
}: {
  jobId: string | null
  filename: string | null
  onNavigate: (s: Screen) => void
  embedded?: boolean
  onClose?: () => void
}) => {
  const [activePanel, setActivePanel] =
    useState<"text" | "entities" | "structured">("text")
  const [result, setResult] = useState<OCRJobResult | null>(null)
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ingesting, setIngesting] = useState(false)

  useEffect(() => {
    if (!jobId) {
      setLoading(false)
      return
    }
    setLoading(true)

    let objectUrl: string | null = null

    Promise.all([
      ocrApi.result(jobId).then(setResult),
      ocrApi
        .getOriginalFileUrl(jobId)
        .then((url) => {
          objectUrl = url
          setOriginalUrl(url)
        })
        .catch((e) => console.warn("Could not load original image:", e)),
    ])
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Could not load result."),
      )
      .finally(() => setLoading(false))

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [jobId])

  if (!jobId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background gap-4">
        <p className="text-sm text-muted-foreground">No OCR result selected.</p>
        <button
          onClick={() => onNavigate("ocr-workspace")}
          className="text-sm text-primary hover:underline"
        >
          Go to OCR Workspace
        </button>
      </div>
    )
  }
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background text-sm text-muted-foreground">
        Loading result…
      </div>
    )
  }
  if (error || !result) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background text-sm text-destructive">
        {error ?? "Result not found."}
      </div>
    )
  }

  const parsedBlocks = result
    ? parseDocumentContent(result.combined_markdown)
    : []
  const openInAI = async () => {
    setIngesting(true)
    try {
      const { job_id } = await assistantApi.ingestText([
        result.combined_markdown,
      ])
      await assistantApi.waitForIngest(job_id)
      onNavigate("ai-assistant")
    } catch {
      onNavigate("ai-assistant")
    } finally {
      setIngesting(false)
    }
  }

  return (
    <div
      className={`${
        embedded ? "h-full w-full bg-card" : "flex-1 bg-background"
      } flex flex-col overflow-hidden`}
    >
      {embedded ? (
        <div className="h-14 border-b border-border flex items-center px-6 gap-4 flex-shrink-0 bg-secondary/50">
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-foreground truncate">
              Result: {filename}
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 text-xs font-medium text-foreground bg-card border border-border px-3 py-1.5 rounded-lg hover:bg-muted transition-colors">
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32">
                {(["md", "pdf", "docx", "xlsx", "json"] as const).map((fmt) => (
                  <DropdownMenuItem
                    key={fmt}
                    onClick={() =>
                      ocrApi.downloadExport(jobId, fmt, `${filename}.${fmt}`)
                    }
                  >
                    <span className="uppercase text-xs font-medium">
                      {fmt} Format
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors ml-2"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <TopBar
          title="OCR Result"
          subtitle={`${result.filename} · ${result.pages.length} page(s) · Confidence ${result.confidence_score}%`}
          actions={
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1.5 text-xs font-medium text-foreground bg-secondary border border-border px-3 py-1.5 rounded-lg hover:bg-muted transition-colors">
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-32">
                  {(["md", "pdf", "docx", "xlsx", "json"] as const).map(
                    (fmt) => (
                      <DropdownMenuItem
                        key={fmt}
                        onClick={() =>
                          ocrApi.downloadExport(
                            jobId,
                            fmt,
                            `${result.filename}.${fmt}`,
                          )
                        }
                      >
                        <span className="uppercase text-xs font-medium">
                          {fmt} Format
                        </span>
                      </DropdownMenuItem>
                    ),
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                onClick={openInAI}
                disabled={ingesting}
                className="flex items-center gap-1.5 bg-primary hover:hover:bg-primary/90 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
              >
                <Sparkles className="w-3 h-3" />{" "}
                {ingesting ? "Loading…" : "Open in AI"}
              </button>
            </div>
          }
        />
      )}

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 overflow-hidden bg-background">
        {/* Left Panel: Original Input */}
        <div className="flex flex-col border-r border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-card flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900/30 rounded flex items-center justify-center text-blue-600 dark:text-blue-400">
              <FileText className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-semibold text-foreground">
              Original Input
            </h2>
          </div>
          <div className="flex-1 bg-[#1E293B] overflow-auto flex items-center justify-center p-4">
            {originalUrl ? (
              result.filename.toLowerCase().endsWith(".pdf") ? (
                <iframe
                  src={originalUrl}
                  className="w-full h-full rounded shadow-lg bg-white border-0"
                  title="Original PDF"
                />
              ) : (
                <img
                  src={originalUrl}
                  alt="Original Image"
                  className="max-w-full max-h-full object-contain rounded shadow-lg"
                />
              )
            ) : (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" /> Loading original
                file...
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Extracted Output */}
        <div className="flex flex-col overflow-hidden bg-background">
          <div className="px-4 py-3 border-b border-border bg-card flex flex-col xl:flex-row items-start xl:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded flex items-center justify-center text-green-600 dark:text-green-400">
                <Edit2 className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <h2 className="text-sm font-semibold text-foreground">
                  Extracted Output
                </h2>
                {result?.extraction_time && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Processed in {result.extraction_time}s
                  </div>
                )}
              </div>
            </div>

            <div className="flex bg-muted p-1 rounded-lg flex-wrap">
              {(["text", "entities", "structured"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setActivePanel(p)}
                  className={`px-4 py-1.5 text-xs font-medium capitalize rounded-md transition-colors ${
                    activePanel === p
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p === "structured" ? "Document View" : p}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {activePanel === "entities" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-medium text-foreground">
                    {result.entities.length} entities extracted
                  </div>
                </div>
                {result.entities.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    No entities detected.
                  </div>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {result.entities.map((e, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-4 bg-card border border-border rounded-xl shadow-sm hover:border-primary/50 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
                        <Tag className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <div className="text-sm font-semibold text-foreground truncate">
                            {e["Predicted Name"] ?? e["Original Text"]}
                          </div>
                          <div className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                            {e.Type ?? "Entity"}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Original: {e["Original Text"] ?? "—"}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-2">
                          Confidence:{" "}
                          <span className="font-medium text-foreground">
                            {e.Confidence ?? "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activePanel === "structured" && (
              <div className="bg-card rounded-lg shadow-sm border border-border overflow-x-auto p-4">
                <table className="w-full text-sm text-left border-none rounded-lg overflow-hidden">
                  <tbody className="divide-y divide-border">
                    {parsedBlocks.length === 0 ? (
                      <tr>
                        <td className="p-4 text-muted-foreground italic text-center">
                          No content extracted.
                        </td>
                      </tr>
                    ) : (
                      parsedBlocks.map((block, idx) => {
                        if (block.type === "key-value") {
                          return block.pairs.map((pair, pIdx) => (
                            <tr
                              key={`kv-${idx}-${pIdx}`}
                              className="hover:bg-muted/50 transition-colors"
                            >
                              <td className="px-4 py-3 font-semibold text-foreground w-1/3 border-r border-border bg-muted/10">
                                {pair.key}
                              </td>
                              <td className="px-4 py-3 text-foreground whitespace-pre-wrap">
                                {pair.value}
                              </td>
                            </tr>
                          ))
                        }
                        if (block.type === "section") {
                          return (
                            <React.Fragment key={`sec-${idx}`}>
                              <tr className="bg-muted/30">
                                <td
                                  colSpan={2}
                                  className="px-4 py-3 font-bold uppercase tracking-wide text-primary border-b border-border"
                                >
                                  {block.title}
                                </td>
                              </tr>
                              {block.lines.map((line, lIdx) => (
                                <tr
                                  key={`secline-${idx}-${lIdx}`}
                                  className="hover:bg-muted/50 transition-colors"
                                >
                                  <td
                                    colSpan={2}
                                    className="px-4 py-2 text-foreground whitespace-pre-wrap"
                                  >
                                    {line}
                                  </td>
                                </tr>
                              ))}
                            </React.Fragment>
                          )
                        }
                        if (block.type === "table") {
                          return (
                            <tr key={`tbl-${idx}`}>
                              <td colSpan={2} className="p-0">
                                <table className="w-full text-sm text-left">
                                  <thead className="bg-muted/40 border-b border-border">
                                    <tr>
                                      {block.headers.map((h, hIdx) => (
                                        <th
                                          key={hIdx}
                                          className="px-4 py-2 font-semibold text-foreground uppercase text-xs tracking-wider border-r border-border last:border-0"
                                        >
                                          {h}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border">
                                    {block.rows.map((row, rIdx) => (
                                      <tr
                                        key={rIdx}
                                        className="hover:bg-muted/20"
                                      >
                                        {row.map((cell, cIdx) => (
                                          <td
                                            key={cIdx}
                                            className="px-4 py-2 text-foreground border-r border-border last:border-0"
                                          >
                                            {cell}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )
                        }
                        if (block.type === "text") {
                          return (
                            <tr key={`txt-${idx}`}>
                              <td
                                colSpan={2}
                                className="px-4 py-3 text-foreground leading-relaxed whitespace-pre-wrap font-mono"
                              >
                                {block.content}
                              </td>
                            </tr>
                          )
                        }
                        return null
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activePanel === "text" && (
              <BasicMarkdown
                text={result.combined_markdown}
                className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap font-mono bg-card p-6 rounded-xl border border-border shadow-sm min-h-full"
              />
            )}
          </div>

          {/* Bottom actions */}
          <div className="border-t border-border p-4 bg-card flex gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex-1 flex items-center justify-center gap-2 text-sm font-medium bg-primary text-primary-foreground border border-border rounded-lg py-2.5 hover:bg-primary/90 transition-colors shadow-sm">
                  <Download className="w-4 h-4" /> Export
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32">
                {(["md", "pdf", "docx", "xlsx", "json"] as const).map((fmt) => (
                  <DropdownMenuItem
                    key={fmt}
                    onClick={() =>
                      ocrApi.downloadExport(
                        jobId,
                        fmt,
                        `${result.filename}.${fmt}`,
                      )
                    }
                  >
                    <span className="uppercase text-xs font-medium">
                      {fmt} Format
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── PDF Summarizer ───────────────────────────────────────────────────────────
function splitMarkdownSections(md: string): { title: string; body: string }[] {
  const blocks = md.split(/\n(?=##\s)/g)
  const sections: { title: string; body: string }[] = []
  for (const block of blocks) {
    const trimmed = block.trim()
    if (!trimmed) continue
    if (trimmed.startsWith("## ")) {
      const newlineIdx = trimmed.indexOf("\n")
      const title = (
        newlineIdx === -1 ? trimmed.slice(3) : trimmed.slice(3, newlineIdx)
      ).trim()
      const body = (
        newlineIdx === -1 ? "" : trimmed.slice(newlineIdx + 1)
      ).trim()
      sections.push({ title, body })
    } else {
      sections.push({ title: "Summary", body: trimmed })
    }
  }
  return sections
}

export interface SummarizerJobEntry {
  jobId: string
  filename: string
  size: string
  status: JobStatus["status"]
  progress: number
}

const PDFSummarizer = () => {
  const [file, setFile] = useState<File | null>(null)
  const [viewingResultId, setViewingResultId] = useState<string | null>(null)
  const [viewingResultFilename, setViewingResultFilename] =
    useState<string | null>(null)
  const [status, setStatus] = useState<JobStatus["status"] | null>(null)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<SummarizerJobResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  // Recent jobs state
  const [jobs, setJobs] = useState<SummarizerJobEntry[]>([])
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({})

  const pollJobForTable = (jId: string) => {
    pollTimers.current[jId] = setInterval(async () => {
      try {
        const s = await summarizerApi.jobStatus(jId)
        setJobs((prev) =>
          prev.map((j) =>
            j.jobId === jId
              ? { ...j, status: s.status, progress: s.progress }
              : j,
          ),
        )
        if (s.status === "COMPLETED" || s.status === "FAILED") {
          clearInterval(pollTimers.current[jId])
          delete pollTimers.current[jId]
        }
      } catch {
        clearInterval(pollTimers.current[jId])
        delete pollTimers.current[jId]
      }
    }, 2500)
  }

  const upload = async (f: File) => {
    setIsUploading(true)
    setError(null)
    try {
      const res = await summarizerApi.upload(f)
      setIsUploading(false)

      // Add to recent jobs
      setJobs((prev) => [
        {
          jobId: res.job_id,
          filename: f.name,
          size: formatBytes(f.size),
          status: "PENDING",
          progress: 0,
        },
        ...prev,
      ])
      pollJobForTable(res.job_id)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed.")
      setIsUploading(false)
    }
  }

  useEffect(() => {
    if (!viewingResultId || status === "COMPLETED" || status === "FAILED")
      return
    const interval = setInterval(async () => {
      try {
        const s = await summarizerApi.jobStatus(viewingResultId)
        setStatus(s.status)
        setProgress(s.progress)
        if (s.status === "COMPLETED") {
          const r = await summarizerApi.result(viewingResultId)
          setResult(r)
        } else if (s.status === "FAILED") {
          setError(s.error_message ?? "Summarization failed.")
        }
      } catch {
        /* transient network error */
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [viewingResultId, status])

  const openResultModal = async (jId: string, filename: string) => {
    setViewingResultId(jId)
    setViewingResultFilename(filename)
    setFile(new File([], filename))
    setError(null)
    setResult(null)
    setStatus("PROCESSING")
    setProgress(0)
    try {
      const s = await summarizerApi.jobStatus(jId)
      setStatus(s.status)
      setProgress(s.progress)
      if (s.status === "COMPLETED") {
        const r = await summarizerApi.result(jId)
        setResult(r)
      } else if (s.status === "FAILED") {
        setError(s.error_message ?? "Summarization failed.")
      }
    } catch (e) {
      setError("Failed to load job status.")
    }
  }

  const sections = result ? splitMarkdownSections(result.summary_md) : []
  const pageNums = result
    ? Object.keys(result.page_texts)
        .map(Number)
        .sort((a, b) => a - b)
    : []
  const exportFormats = ["pdf", "docx", "md"] as const

  const statusChip = (s: SummarizerJobEntry["status"]) => {
    const map: Record<SummarizerJobEntry["status"], [string, string]> = {
      PENDING: ["Queued", "gray"],
      PROCESSING: ["Processing", "blue"],
      COMPLETED: ["Completed", "green"],
      FAILED: ["Failed", "red"],
    }
    const [label, color] = map[s] || ["Unknown", "gray"]
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-${color}-100 dark:bg-${color}-900/30 text-${color}-800 dark:text-${color}-300`}
      >
        {label}
      </span>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden relative">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) upload(e.target.files[0])
          e.target.value = ""
        }}
      />
      <TopBar
        title="PDF Summarizer"
        subtitle="Upload a case file to generate a clinical summary"
      />

      <div className="flex-1 flex flex-col p-5 overflow-y-auto space-y-5">
        {error && !viewingResultId && (
          <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const dropped = e.dataTransfer.files[0]
            if (
              dropped &&
              (dropped.type === "application/pdf" ||
                dropped.name.toLowerCase().endsWith(".pdf"))
            ) {
              upload(dropped)
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl flex items-center justify-between px-6 py-4 transition-all cursor-pointer ${
            dragging
              ? "border-primary bg-secondary"
              : "border-switch-background bg-card hover:border-[#93C5FD] hover:bg-background"
          }`}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center flex-shrink-0">
              <Layers className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {isUploading
                  ? "Uploading file..."
                  : "Drop hospital case file PDF here"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pages are OCR'd then map-reduce summarized into a structured
                clinical report
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation()
                fileInputRef.current?.click()
              }}
              disabled={isUploading}
              className="bg-secondary hover:bg-secondary/80 text-foreground text-xs font-medium px-4 py-2 rounded-lg transition-colors border border-border disabled:opacity-50"
            >
              Browse files
            </button>
          </div>
        </div>

        {/* Jobs Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden mt-6 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/10">
                {["Document", "Size", "Status", "Progress", "Actions"].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9] dark:divide-border/50">
              {jobs.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-6 text-xs text-muted-foreground text-center"
                  >
                    No documents uploaded yet.
                  </td>
                </tr>
              )}
              {jobs.map((row) => (
                <tr
                  key={row.jobId}
                  className="hover:bg-background transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-primary/70 flex-shrink-0" />
                      <span className="text-xs font-medium text-foreground truncate max-w-[200px]">
                        {row.filename}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-muted-foreground">
                    {row.size}
                  </td>
                  <td className="px-5 py-3.5">{statusChip(row.status)}</td>
                  <td className="px-5 py-3.5 w-36">
                    <ProgressBar value={row.progress} />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openResultModal(row.jobId, row.filename)}
                        disabled={row.status === "FAILED"}
                        className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="View Summary"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            disabled={row.status !== "COMPLETED"}
                            className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Download"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-32">
                          {(["md", "pdf", "docx"] as const).map((fmt) => (
                            <DropdownMenuItem
                              key={fmt}
                              onClick={() =>
                                summarizerApi.downloadExport(
                                  row.jobId,
                                  fmt,
                                  `${row.filename}.${fmt}`,
                                )
                              }
                            >
                              <span className="uppercase text-xs font-medium">
                                {fmt} Format
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Result Viewer */}
      {viewingResultId && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setViewingResultId(null)
          }}
        >
          <div className="w-full max-w-7xl h-full max-h-[90vh] flex flex-col shadow-2xl rounded-xl overflow-hidden animate-in fade-in zoom-in duration-200 bg-background">
            <TopBar
              title="Summary Result"
              subtitle={
                viewingResultFilename
                  ? `${viewingResultFilename}${
                      pageNums.length ? ` · ${pageNums.length} pages` : ""
                    }`
                  : ""
              }
              actions={
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setViewingResultId(null)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border px-3 py-1.5 rounded-lg hover:bg-muted transition-colors mr-2"
                  >
                    <ArrowLeft className="w-3 h-3" /> Close
                  </button>
                  {result
                    ? exportFormats.map((fmt) => (
                        <button
                          key={fmt}
                          onClick={() =>
                            summarizerApi.downloadExport(
                              viewingResultId,
                              fmt,
                              `${result.filename}.${fmt}`,
                            )
                          }
                          className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border px-3 py-1.5 rounded-lg hover:bg-muted transition-colors uppercase"
                        >
                          <Download className="w-3 h-3" /> {fmt}
                        </button>
                      ))
                    : undefined}
                </div>
              }
            />

            <div className="flex-1 flex overflow-hidden">
              {/* Page list */}
              <div className="w-44 border-r border-border bg-card flex-shrink-0 overflow-y-auto p-3 space-y-2">
                {(pageNums.length ? pageNums : [1]).map((n) => (
                  <div
                    key={n}
                    className="bg-background border border-border rounded-lg p-2"
                  >
                    <div className="w-full h-24 bg-card border border-border rounded flex items-center justify-center mb-1">
                      <FileText className="w-5 h-5 text-switch-background" />
                    </div>
                    <div className="text-[10px] text-center text-med-text-tertiary">
                      Page {n}
                    </div>
                  </div>
                ))}
              </div>

              {/* Main content */}
              <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 p-5 overflow-y-auto space-y-4">
                  {error && (
                    <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                      {error}
                    </div>
                  )}

                  {!result && !error && (
                    <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-3">
                      <div className="w-2 h-2 bg-med-warning rounded-full animate-pulse flex-shrink-0" />
                      <span className="text-sm text-muted-foreground">
                        {progress < 50
                          ? "Reading pages via OCR…"
                          : "Building structured clinical summary…"}
                      </span>
                    </div>
                  )}

                  {result && (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <div className="text-xs font-semibold text-med-text-tertiary uppercase tracking-widest">
                          Case Summary{" "}
                          {result.patient_meta.name
                            ? `— ${result.patient_meta.name}`
                            : ""}
                        </div>
                      </div>

                      <div className="mb-8">
                        <h3 className="text-sm font-semibold mb-4 text-foreground border-b border-border pb-2">
                          Clinical Summary
                        </h3>
                        {sections.map((s, i) => (
                          <div
                            key={i}
                            className="bg-card border border-border rounded-xl p-4 mb-4"
                          >
                            <div className="flex items-center gap-3 mb-2">
                              <CheckCircle className="w-4 h-4 text-med-success flex-shrink-0" />
                              <span className="text-sm font-medium text-foreground">
                                {s.title}
                              </span>
                            </div>
                            <div className="text-xs text-med-text-secondary leading-relaxed ml-7 whitespace-pre-wrap">
                              {s.body}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div>
                        <h3 className="text-sm font-semibold mb-4 text-foreground border-b border-border pb-2">
                          Extracted Content
                        </h3>
                        <div className="bg-card border border-border rounded-xl p-5 overflow-y-auto max-h-full">
                          {pageNums.map((n) => (
                            <div key={n} className="mb-6 last:mb-0">
                              <h4 className="text-sm font-semibold text-foreground mb-2 border-b border-border pb-1">
                                Page {n}
                              </h4>
                              <div className="text-xs text-med-text-secondary leading-relaxed whitespace-pre-wrap font-mono bg-muted/30 p-3 rounded-lg border border-border/50">
                                {result.page_texts[n] ||
                                  "No text extracted for this page."}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Right panel — progress */}
                <div className="w-64 border-l border-border bg-card flex flex-col flex-shrink-0 p-4 space-y-5">
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                      Processing Progress
                    </div>
                    <ProgressBar
                      value={progress}
                      label={status ?? ""}
                      color="#2563EB"
                    />
                  </div>

                  {result && viewingResultId && (
                    <div className="border-t border-border pt-4">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                        Export Options
                      </div>
                      <div className="space-y-2">
                        {exportFormats.map((fmt) => (
                          <button
                            key={fmt}
                            onClick={() =>
                              summarizerApi.downloadExport(
                                viewingResultId,
                                fmt,
                                `${result.filename}.${fmt}`,
                              )
                            }
                            className="w-full text-left text-xs text-med-text-secondary px-3 py-2 rounded-lg border border-border hover:bg-background transition-colors flex items-center justify-between uppercase"
                          >
                            {fmt}
                            <Download className="w-3 h-3 text-med-text-tertiary" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── AI Medical Assistant ─────────────────────────────────────────────────────
function newSessionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `session-${Date.now()}`
}

interface ChatAttachment {
  id: string
  filename: string
  docId: number | null
  status: "uploading" | "processing" | "ingesting" | "ready" | "failed"
  error?: string
}

const AIAssistant = () => {
  const { user } = useAuth()
  const [sessionId, setSessionId] = useState(newSessionId)
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vaultDocs, setVaultDocs] = useState<VaultDoc[]>([])
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const attachInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    assistantApi
      .history(sessionId)
      .then(setMessages)
      .catch(() => setMessages([]))
  }, [sessionId])

  // Restores attachment chips from the server-side record on session
  // load/reload — the source of truth lives in Postgres (chat_session_docs),
  // not just in-memory React state, so a page refresh mid-conversation
  // doesn't silently lose which documents this chat is scoped to.
  useEffect(() => {
    assistantApi
      .getSessionAttachments(sessionId)
      .then((docs) =>
        setAttachments(
          docs.map((d) => ({
            id: `restored-${d.doc_id}`,
            filename: d.filename,
            docId: d.doc_id,
            status: "ready" as const,
          })),
        ),
      )
      .catch(() => setAttachments([]))
  }, [sessionId])

  useEffect(() => {
    vaultApi
      .list()
      .then(setVaultDocs)
      .catch(() => setVaultDocs([]))
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages, sending])

  const DEFAULT_SUGGESTED = [
    "Summarize the most recently uploaded document",
    "What medications were mentioned in the last extraction?",
    "List any lab values out of reference range",
    "What is the primary diagnosis?",
  ]
  const [suggested, setSuggested] = useState<string[]>(DEFAULT_SUGGESTED)

  // Regenerate suggestions from the attached document(s)' real content
  // whenever the set of "ready" attachments changes — falls back to the
  // generic defaults once nothing is attached (or on any request failure).
  const readyDocIds = attachments
    .filter((a) => a.status === "ready" && a.docId != null)
    .map((a) => a.docId!)
  const readyDocIdsKey = readyDocIds
    .slice()
    .sort((a, b) => a - b)
    .join(",")
  useEffect(() => {
    if (!readyDocIdsKey) {
      setSuggested(DEFAULT_SUGGESTED)
      return
    }
    assistantApi
      .suggestQuestions(readyDocIdsKey.split(",").map(Number))
      .then((r) => setSuggested(r.suggestions))
      .catch(() => setSuggested(DEFAULT_SUGGESTED))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyDocIdsKey])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput("")
    setError(null)
    setMessages((m) => [
      ...m,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ])
    setSending(true)
    // Non-empty only when at least one attached file is ready — scopes retrieval
    // to just those files for this query. Empty/undefined keeps today's
    // behavior of searching the user's whole knowledge base.
    const attachedDocIds = attachments
      .filter((a) => a.status === "ready" && a.docId != null)
      .map((a) => a.docId!)
    try {
      await assistantApi.chatStream(
        text,
        sessionId,
        {
          onCitations: (citations) => {
            setMessages((m) => {
              const next = [...m]
              next[next.length - 1] = { ...next[next.length - 1], citations }
              return next
            })
          },
          onToken: (token) => {
            setMessages((m) => {
              const next = [...m]
              const last = next[next.length - 1]
              next[next.length - 1] = { ...last, content: last.content + token }
              return next
            })
          },
          onError: (msg) => setError(msg),
        },
        "English",
        attachedDocIds.length ? attachedDocIds : undefined,
      )
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "The assistant could not answer that. Please try again.",
      )
    } finally {
      setSending(false)
    }
  }

  const attachFile = async (file: File) => {
    const id = `${file.name}-${Date.now()}`
    setAttachments((a) => [
      ...a,
      { id, filename: file.name, docId: null, status: "uploading" },
    ])
    const setStatus = (
      status: ChatAttachment["status"],
      patch: Partial<ChatAttachment> = {},
    ) =>
      setAttachments((a) =>
        a.map((x) => (x.id === id ? { ...x, status, ...patch } : x)),
      )

    try {
      const { job_id: ocrJobId } = await ocrApi.upload(
        file,
        "Universal OCR (Any Text)",
      )
      setStatus("processing")
      const ocrStatus = await ocrApi.waitForJob(ocrJobId)
      if (ocrStatus.status !== "COMPLETED" || ocrStatus.result_doc_id == null) {
        setStatus("failed", {
          error: ocrStatus.error_message ?? "Extraction failed.",
        })
        return
      }

      setStatus("ingesting")
      const { job_id: ingestJobId } = await assistantApi.ingestVaultDocs([
        ocrStatus.result_doc_id,
      ])
      const ingestStatus = await assistantApi.waitForIngest(ingestJobId)
      if (ingestStatus.status !== "COMPLETED") {
        setStatus("failed", {
          error:
            ingestStatus.error_message ?? "Failed to add to knowledge base.",
        })
        return
      }

      setStatus("ready", { docId: ocrStatus.result_doc_id })
      // Persisted server-side (not just this component's React state) so the
      // scoping survives a reload and can't silently drop between messages.
      assistantApi
        .addSessionAttachment(sessionId, ocrStatus.result_doc_id, file.name)
        .catch(() => {})
    } catch (e) {
      setStatus("failed", {
        error: e instanceof ApiError ? e.message : "Attachment failed.",
      })
    }
  }

  // Same end state as attachFile, but for a document already sitting in the
  // Vault (already OCR'd) — skips straight to ingestion, no upload/OCR step.
  const attachVaultDoc = async (doc: VaultDoc) => {
    if (attachments.some((a) => a.docId === doc.id && a.status !== "failed"))
      return // already attached/in-progress
    const id = `vault-${doc.id}-${Date.now()}`
    // Drop any earlier failed attempt for this doc so retrying doesn't leave a stale duplicate chip.
    setAttachments((a) => [
      ...a.filter((x) => !(x.docId === doc.id && x.status === "failed")),
      { id, filename: doc.filename, docId: doc.id, status: "ingesting" },
    ])
    const setStatus = (
      status: ChatAttachment["status"],
      patch: Partial<ChatAttachment> = {},
    ) =>
      setAttachments((a) =>
        a.map((x) => (x.id === id ? { ...x, status, ...patch } : x)),
      )

    try {
      const { job_id: ingestJobId } = await assistantApi.ingestVaultDocs([
        doc.id,
      ])
      const ingestStatus = await assistantApi.waitForIngest(ingestJobId)
      if (ingestStatus.status !== "COMPLETED") {
        setStatus("failed", {
          error:
            ingestStatus.error_message ?? "Failed to add to knowledge base.",
        })
        return
      }
      setStatus("ready", { docId: doc.id })
      assistantApi
        .addSessionAttachment(sessionId, doc.id, doc.filename)
        .catch(() => {})
    } catch (e) {
      setStatus("failed", {
        error: e instanceof ApiError ? e.message : "Attachment failed.",
      })
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-background">
      {/* Conversation sidebar */}
      <div className="w-56 border-r border-border bg-card flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-border">
          <button
            onClick={() => {
              setSessionId(newSessionId())
              setMessages([])
              setError(null)
              setAttachments([])
            }}
            className="w-full flex items-center gap-2 bg-primary hover:hover:bg-primary/90 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-3 h-3" /> New conversation
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 text-xs text-muted-foreground leading-relaxed">
          Chat is grounded in your Knowledge Graph — ingest documents from OCR
          Result ("Open in AI") or the Document Vault ("Load into RAG") first.
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          title="AI Medical Assistant"
          subtitle="RAG-powered · Local knowledge graph"
        />
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && (
            <div className="text-sm text-muted-foreground text-center mt-10">
              No messages yet — ask a question about your ingested documents
              below.
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 ${
                msg.role === "user" ? "flex-row-reverse" : ""
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="w-7 h-7 bg-secondary rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                </div>
              ) : (
                <Avatar name={user?.username ?? "You"} size="sm" />
              )}
              <div
                className={`max-w-2xl ${
                  msg.role === "user" ? "items-end" : "items-start"
                } flex flex-col gap-1.5`}
              >
                <div
                  className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-white rounded-tr-sm"
                      : "bg-card border border-border text-foreground rounded-tl-sm"
                  }`}
                >
                  {msg.content.split("\n").map((line, j) => (
                    <p key={j} className={line ? "mb-1" : "mb-2"}>
                      {line
                        .split(/(\*\*[^*]+\*\*)/)
                        .map((part, k) =>
                          part.startsWith("**") ? (
                            <strong key={k}>{part.slice(2, -2)}</strong>
                          ) : (
                            part
                          ),
                        )}
                    </p>
                  ))}
                </div>
                {msg.role === "assistant" &&
                  msg.citations &&
                  msg.citations.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 px-1">
                      {msg.citations.map((c, ci) => (
                        <span
                          key={ci}
                          title={c.snippet}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border cursor-default"
                        >
                          [{ci + 1}] {c.filename} · {c.page_label}
                        </span>
                      ))}
                    </div>
                  )}
              </div>
            </div>
          ))}
          {sending && messages[messages.length - 1]?.content === "" && (
            <div className="flex gap-3">
              <div className="w-7 h-7 bg-secondary rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
              </div>
              <div className="px-4 py-3 rounded-2xl text-sm bg-card border border-border text-muted-foreground rounded-tl-sm">
                Thinking…
              </div>
            </div>
          )}
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Suggested prompts */}
        <div className="px-6 pb-3 flex gap-2 overflow-x-auto">
          {suggested.map((s) => (
            <button
              key={s}
              onClick={() => setInput(s)}
              className="flex-shrink-0 text-xs text-med-text-secondary border border-border px-3 py-1.5 rounded-full hover:border-primary/20 hover:text-primary hover:bg-secondary transition-colors"
            >
              {s}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="border-t border-border p-4 bg-card">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {attachments.map((a) => (
                <div
                  key={a.id}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
                    a.status === "failed"
                      ? "border-destructive/30 bg-destructive/10 text-destructive"
                      : a.status === "ready"
                        ? "border-primary/20 bg-primary/10 text-primary"
                        : "border-border bg-secondary text-med-text-secondary"
                  }`}
                  title={a.status === "failed" ? a.error : a.filename}
                >
                  {a.status === "ready" ? (
                    <Check className="w-3 h-3" />
                  ) : a.status === "failed" ? (
                    <XCircle className="w-3 h-3" />
                  ) : (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  )}
                  <span className="max-w-[140px] truncate">{a.filename}</span>
                  <button
                    onClick={() => {
                      setAttachments((list) =>
                        list.filter((x) => x.id !== a.id),
                      )
                      // Also detach server-side so the scoping this chip
                      // represented doesn't reappear via the /chat fallback.
                      if (a.docId != null)
                        assistantApi
                          .removeSessionAttachment(sessionId, a.docId)
                          .catch(() => {})
                    }}
                    className="hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 bg-background border border-border rounded-xl px-4 py-3 focus-within:ring-2 focus-within:ring-primary focus-within:border-transparent transition-all">
            <input
              ref={attachInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) attachFile(file)
                e.target.value = ""
              }}
            />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={
                attachments.some((a) => a.status === "ready")
                  ? "Ask about the attached file(s)…"
                  : "Ask about any ingested document, medication, diagnosis…"
              }
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-med-text-tertiary"
            />
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => attachInputRef.current?.click()}
                title="Attach a PDF or image to this conversation"
                className="w-8 h-8 hover:bg-secondary rounded-lg flex items-center justify-center transition-colors text-med-text-secondary hover:text-primary"
              >
                <Paperclip className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={send}
                disabled={sending}
                className="w-8 h-8 bg-primary hover:hover:bg-primary/90 rounded-lg flex items-center justify-center transition-colors disabled:opacity-60"
              >
                <Send className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </div>
          <p className="text-[10px] text-med-text-tertiary mt-2 text-center">
            AI responses are clinical decision support only. Always verify with
            authoritative sources.
          </p>
        </div>
      </div>

      {/* Vault panel */}
      <div className="w-72 border-l border-border bg-card flex flex-col flex-shrink-0">
        <div className="px-4 py-3.5 border-b border-border">
          <div className="text-xs font-semibold text-foreground">
            Available Documents
          </div>
          <div className="text-[10px] text-med-text-tertiary mt-0.5">
            From your Document Vault
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {vaultDocs.length === 0 && (
            <div className="text-xs text-muted-foreground">
              No documents in your vault yet.
            </div>
          )}
          {vaultDocs.map((doc) => {
            const attachment = attachments.find((a) => a.docId === doc.id)
            const busy =
              attachment &&
              attachment.status !== "ready" &&
              attachment.status !== "failed"
            return (
              <button
                key={doc.id}
                onClick={() => attachVaultDoc(doc)}
                disabled={!!attachment && attachment.status !== "failed"}
                title={
                  attachment?.status === "failed"
                    ? `${attachment.error} (click to retry)`
                    : "Add to this conversation"
                }
                className={`w-full text-left border rounded-lg p-3 transition-colors ${
                  attachment?.status === "ready"
                    ? "border-primary/30 bg-primary/5"
                    : attachment?.status === "failed"
                      ? "border-destructive/30 bg-destructive/5 hover:border-destructive/50"
                      : "border-border hover:border-primary/30 hover:bg-secondary"
                } ${
                  attachment && attachment.status !== "failed"
                    ? "cursor-default"
                    : "cursor-pointer"
                }`}
              >
                <div className="flex items-start gap-2">
                  <FileText className="w-3.5 h-3.5 text-med-text-tertiary flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-medium text-foreground truncate">
                      {doc.filename}
                    </div>
                    <div className="text-[10px] text-med-text-tertiary">
                      {doc.doc_category}
                    </div>
                  </div>
                  {busy && (
                    <RefreshCw className="w-3 h-3 text-med-text-tertiary animate-spin flex-shrink-0" />
                  )}
                  {attachment?.status === "ready" && (
                    <Check className="w-3 h-3 text-primary flex-shrink-0" />
                  )}
                  {attachment?.status === "failed" && (
                    <XCircle className="w-3 h-3 text-destructive flex-shrink-0" />
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Document Vault ───────────────────────────────────────────────────────────
const DocumentVault = ({ onNavigate }: { onNavigate: (s: Screen) => void }) => {
  const [view, setView] = useState<"grid" | "list">("list")
  const [search, setSearch] = useState("")
  const [docs, setDocs] = useState<VaultDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [viewer, setViewer] = useState<{
    filename: string
    markdown: string
  } | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [downloadDropdownId, setDownloadDropdownId] = useState<number | null>(
    null,
  )
  const [notice, setNotice] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    vaultApi
      .list()
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const folders = Array.from(
    docs.reduce((acc, d) => {
      const key = d.doc_category || "Uncategorized"
      acc.set(key, (acc.get(key) ?? 0) + 1)
      return acc
    }, new Map<string, number>()),
  ).map(([name, count]) => ({ name, count }))

  const filtered = docs.filter(
    (d) =>
      (!selectedFolder ||
        (d.doc_category || "Uncategorized") === selectedFolder) &&
      d.filename.toLowerCase().includes(search.toLowerCase()),
  )

  const view_doc = async (doc: VaultDoc) => {
    setBusyId(doc.id)
    try {
      const res = await vaultApi.get(doc.id)
      setViewer({ filename: doc.filename, markdown: res.markdown })
    } catch {
      setNotice("Could not load this document.")
    } finally {
      setBusyId(null)
    }
  }

  const download_doc = async (doc: VaultDoc, format: string) => {
    setDownloadDropdownId(null)
    try {
      if (format === "md") {
        const res = await vaultApi.get(doc.id)
        const blob = new Blob([res.markdown], { type: "text/markdown" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${doc.filename}.md`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      } else {
        // Authenticated fetch for binary files
        const blob = await vaultApi.downloadExport(doc.id, format)
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${doc.filename}.${format}`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      }
    } catch (e) {
      setNotice("Failed to download document. Please try again.")
    }
  }

  // Close dropdown if clicked outside
  useEffect(() => {
    const handleClick = () => setDownloadDropdownId(null)
    window.addEventListener("click", handleClick)
    return () => window.removeEventListener("click", handleClick)
  }, [])

  const loadIntoRAG = async (doc: VaultDoc) => {
    setBusyId(doc.id)
    setNotice(null)
    try {
      const { job_id } = await assistantApi.ingestVaultDocs([doc.id])
      const status = await assistantApi.waitForIngest(job_id)
      if (status.status === "FAILED") {
        setNotice(status.error_message ?? "Failed to load into RAG.")
      } else {
        setNotice(
          `"${doc.filename}" loaded into the AI Assistant's knowledge graph.`,
        )
      }
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Failed to load into RAG.")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      <TopBar
        title="Document Vault"
        subtitle={`${docs.length} document${docs.length === 1 ? "" : "s"}`}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate("ocr-workspace")}
              className="flex items-center gap-1.5 bg-primary hover:hover:bg-primary/90 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="w-3 h-3" /> Upload
            </button>
          </div>
        }
      />

      {notice && (
        <div className="mx-5 mt-3 text-xs text-primary bg-secondary border border-primary/20 rounded-lg px-3 py-2 flex items-center justify-between">
          {notice}
          <button
            onClick={() => setNotice(null)}
            className="text-med-text-tertiary hover:text-foreground"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Folder tree */}
        <div className="w-56 border-r border-border bg-card flex flex-col flex-shrink-0 p-3 space-y-1">
          <div className="text-xs font-semibold text-med-text-tertiary uppercase tracking-widest px-2 mb-2">
            Folders
          </div>
          <button
            onClick={() => setSelectedFolder(null)}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
              !selectedFolder
                ? "bg-secondary text-primary"
                : "text-med-text-secondary hover:bg-background hover:text-foreground"
            }`}
          >
            <span className="flex-1 text-left truncate">All Documents</span>
            <span className="text-[10px] text-med-text-tertiary">
              {docs.length}
            </span>
          </button>
          {folders.map((f) => (
            <button
              key={f.name}
              onClick={() => setSelectedFolder(f.name)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                selectedFolder === f.name
                  ? "bg-secondary text-primary"
                  : "text-med-text-secondary hover:bg-background hover:text-foreground"
              }`}
            >
              <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <span className="flex-1 text-left truncate">{f.name}</span>
              <span className="text-[10px] text-med-text-tertiary">
                {f.count}
              </span>
            </button>
          ))}
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search & filter bar */}
          <div className="border-b border-border bg-card px-5 py-3 flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2">
              <Search className="w-3.5 h-3.5 text-med-text-tertiary" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search documents…"
                className="flex-1 text-xs bg-transparent outline-none text-foreground placeholder:text-med-text-tertiary"
              />
            </div>
            <div className="flex items-center gap-1 border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setView("list")}
                className={`p-2 transition-colors ${
                  view === "list"
                    ? "bg-secondary text-primary"
                    : "text-muted-foreground hover:bg-background"
                }`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setView("grid")}
                className={`p-2 transition-colors ${
                  view === "grid"
                    ? "bg-secondary text-primary"
                    : "text-muted-foreground hover:bg-background"
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {loading && (
              <div className="text-sm text-muted-foreground">
                Loading vault…
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="text-sm text-muted-foreground">
                No documents found. Process a document in the OCR Workspace or
                PDF Summarizer to add one.
              </div>
            )}
            {!loading && view === "list" && filtered.length > 0 && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {["Name", "Category", "Confidence", "Date", ""].map(
                        (h) => (
                          <th
                            key={h}
                            className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {filtered.map((doc) => (
                      <tr
                        key={doc.id}
                        onClick={() => view_doc(doc)}
                        className="hover:bg-background transition-colors group cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <FileText className="w-4 h-4 text-med-text-tertiary flex-shrink-0" />
                            <span className="text-xs font-medium text-foreground truncate max-w-[220px]">
                              {doc.filename}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {doc.doc_category && (
                            <Chip label={doc.doc_category} color="sky" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {doc.confidence_score != null
                            ? `${doc.confidence_score}%`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {doc.extraction_date ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity text-sm relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setDownloadDropdownId(
                                  downloadDropdownId === doc.id ? null : doc.id,
                                )
                              }}
                              className="p-1 hover:bg-secondary rounded transition-colors"
                              title="Export Document"
                            >
                              📥
                            </button>

                            {downloadDropdownId === doc.id && (
                              <div
                                className="absolute right-0 top-8 z-50 w-40 bg-card border border-border rounded-lg shadow-xl py-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={() => download_doc(doc, "pdf")}
                                  className="w-full text-left px-4 py-2 text-xs hover:bg-secondary text-foreground transition-colors"
                                >
                                  PDF Document (.pdf)
                                </button>
                                <button
                                  onClick={() => download_doc(doc, "docx")}
                                  className="w-full text-left px-4 py-2 text-xs hover:bg-secondary text-foreground transition-colors"
                                >
                                  Word Document (.docx)
                                </button>
                                <button
                                  onClick={() => download_doc(doc, "md")}
                                  className="w-full text-left px-4 py-2 text-xs hover:bg-secondary text-foreground transition-colors border-t border-border mt-1 pt-2"
                                >
                                  Raw Markdown (.md)
                                </button>
                              </div>
                            )}

                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                loadIntoRAG(doc)
                              }}
                              disabled={busyId === doc.id}
                              className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-primary transition-colors"
                              title="Load into AI Assistant"
                            >
                              <Sparkles className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!loading && view === "grid" && filtered.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {filtered.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => view_doc(doc)}
                    className="bg-card border border-border rounded-xl p-4 hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer"
                  >
                    <div className="w-full h-28 bg-background rounded-lg border border-border flex items-center justify-center mb-3">
                      <FileText className="w-8 h-8 text-switch-background" />
                    </div>
                    <div className="text-xs font-medium text-foreground truncate mb-1">
                      {doc.filename}
                    </div>
                    <div className="text-[10px] text-med-text-tertiary">
                      {doc.extraction_date ?? ""}
                    </div>
                    <div className="flex gap-1 mt-2">
                      {doc.doc_category && (
                        <Chip label={doc.doc_category} color="sky" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Markdown viewer overlay */}
      {viewer && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-8"
          onClick={() => setViewer(null)}
        >
          <div
            className="bg-card rounded-xl border border-border max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
              <span className="text-sm font-medium text-foreground truncate">
                {viewer.filename}
              </span>
              <button
                onClick={() => setViewer(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <BasicMarkdown
                text={viewer.markdown}
                className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Admin Workspace ──────────────────────────────────────────────────────────
const AdminWorkspace = () => {
  const [tab, setTab] = useState<"users" | "system" | "audit">("system")

  const users = [
    {
      name: "Dr. Sarah Chen",
      role: "Cardiologist",
      dept: "Cardiology",
      status: "online",
      last: "Now",
    },
    {
      name: "Dr. Raymond Okafor",
      role: "Cardiologist",
      dept: "Cardiology",
      status: "online",
      last: "5 min ago",
    },
    {
      name: "Nurse Patricia Liu",
      role: "RN",
      dept: "CCU",
      status: "idle",
      last: "22 min ago",
    },
    {
      name: "Marcus Reyes",
      role: "Medical Coder",
      dept: "Admin",
      status: "online",
      last: "2 min ago",
    },
    {
      name: "Dr. Yuki Tanaka",
      role: "Hospitalist",
      dept: "Internal Medicine",
      status: "idle",
      last: "1 hour ago",
    },
  ]

  const workerStats = [
    { label: "OCR Workers", value: "4/4", status: "online" as const, util: 72 },
    {
      label: "AI Inference",
      value: "2/2",
      status: "online" as const,
      util: 45,
    },
    {
      label: "PDF Processor",
      value: "2/2",
      status: "online" as const,
      util: 30,
    },
    {
      label: "NLP Pipeline",
      value: "1/2",
      status: "processing" as const,
      util: 88,
    },
  ]

  const systemMetrics = [
    { label: "GPU Utilization", value: "67%", color: "#2563EB" },
    { label: "Storage Used", value: "2.4 TB / 10 TB", color: "#14B8A6" },
    { label: "Documents Processed Today", value: "47", color: "#22C55E" },
    { label: "Queue Depth", value: "3 documents", color: "#F59E0B" },
    { label: "API Latency (p95)", value: "142ms", color: "#0EA5E9" },
    { label: "Uptime", value: "99.94%", color: "#22C55E" },
  ]

  const auditLogs = [
    {
      action: "Document viewed",
      user: "Dr. Chen, Sarah",
      resource: "Cardiology_Report_Whitfield.pdf",
      time: "10:14 AM",
      ip: "10.0.1.42",
    },
    {
      action: "OCR job started",
      user: "System",
      resource: "Radiology_ChestXRay_4421.pdf",
      time: "10:01 AM",
      ip: "—",
    },
    {
      action: "Drug check performed",
      user: "Marcus Reyes",
      resource: "MRN-00421 — Whitfield",
      time: "9:48 AM",
      ip: "10.0.1.88",
    },
    {
      action: "User login",
      user: "Dr. Okafor, Raymond",
      resource: "Session #4421",
      time: "8:30 AM",
      ip: "10.0.2.15",
    },
    {
      action: "Summary exported",
      user: "Dr. Tanaka, Yuki",
      resource: "Discharge_Summary_Santos.pdf",
      time: "8:12 AM",
      ip: "10.0.1.77",
    },
  ]

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      <TopBar
        title="Admin Workspace"
        subtitle="System health, users, and audit logs"
      />
      <div className="border-b border-border bg-card px-6 flex gap-1">
        {(["system", "users", "audit"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "system"
              ? "System Status"
              : t === "users"
                ? "User Management"
                : "Audit Logs"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {tab === "system" && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-4">
              {systemMetrics.map((m) => (
                <div
                  key={m.label}
                  className="bg-card border border-border rounded-xl p-4"
                >
                  <div className="text-xs text-med-text-tertiary mb-1">
                    {m.label}
                  </div>
                  <div className="text-lg font-semibold text-foreground">
                    {m.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <div className="text-sm font-semibold text-foreground mb-4">
                Worker Pool Status
              </div>
              <div className="grid grid-cols-2 gap-4">
                {workerStats.map((w) => (
                  <div
                    key={w.label}
                    className="flex items-center gap-4 p-3 bg-background rounded-lg border border-border"
                  >
                    <StatusDot status={w.status} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-foreground mb-0.5">
                        {w.label}
                      </div>
                      <ProgressBar value={w.util} />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground flex-shrink-0">
                      {w.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "users" && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <span className="text-sm font-semibold text-foreground">
                Active Users ({users.length})
              </span>
              <button className="flex items-center gap-1.5 bg-primary hover:hover:bg-primary/90 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">
                <Plus className="w-3 h-3" /> Invite user
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {[
                    "User",
                    "Role",
                    "Department",
                    "Status",
                    "Last active",
                    "",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {users.map((u) => (
                  <tr
                    key={u.name}
                    className="hover:bg-background transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} size="sm" />
                        <span className="text-xs font-medium text-foreground">
                          {u.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">
                      {u.role}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">
                      {u.dept}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <StatusDot status={u.status as any} />
                        <span className="text-xs capitalize text-muted-foreground">
                          {u.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-med-text-tertiary">
                      {u.last}
                    </td>
                    <td className="px-5 py-3.5">
                      <button className="text-med-text-tertiary hover:text-muted-foreground">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "audit" && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <span className="text-sm font-semibold text-foreground">
                Audit Log — Today
              </span>
              <button className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border px-3 py-1.5 rounded-lg hover:bg-muted transition-colors">
                <Download className="w-3 h-3" /> Export CSV
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Action", "User", "Resource", "IP", "Time"].map((h) => (
                    <th
                      key={h}
                      className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {auditLogs.map((log) => (
                  <tr
                    key={log.action + log.time}
                    className="hover:bg-background transition-colors"
                  >
                    <td className="px-5 py-3 text-xs font-medium text-foreground">
                      {log.action}
                    </td>
                    <td className="px-5 py-3 text-xs text-med-text-secondary">
                      {log.user}
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground truncate max-w-[180px]">
                      {log.resource}
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-med-text-tertiary">
                      {log.ip}
                    </td>
                    <td className="px-5 py-3 text-xs text-med-text-tertiary">
                      {log.time}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Settings ─────────────────────────────────────────────────────────────────
const SettingsView = () => {
  const [section, setSection] = useState("profile")
  const sections = [
    {
      id: "profile",
      label: "Profile",
      icon: <Users className="w-3.5 h-3.5" />,
    },
    {
      id: "hospital",
      label: "Hospital Info",
      icon: <Building2 className="w-3.5 h-3.5" />,
    },
    {
      id: "notifications",
      label: "Notifications",
      icon: <Bell className="w-3.5 h-3.5" />,
    },
    {
      id: "ocr",
      label: "OCR Configuration",
      icon: <FileSearch className="w-3.5 h-3.5" />,
    },
    {
      id: "ai",
      label: "AI Configuration",
      icon: <Sparkles className="w-3.5 h-3.5" />,
    },
    {
      id: "security",
      label: "Security",
      icon: <Lock className="w-3.5 h-3.5" />,
    },
    { id: "api", label: "API Keys", icon: <Key className="w-3.5 h-3.5" /> },
  ]

  const Toggle = ({ on = false }: { on?: boolean }) => (
    <div
      className={`w-10 h-5.5 rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${
        on ? "bg-primary" : "bg-switch-background"
      }`}
    >
      <div
        className={`w-4.5 h-4.5 bg-card rounded-full shadow transition-transform ${
          on ? "translate-x-4.5" : "translate-x-0"
        }`}
      />
    </div>
  )

  return (
    <div className="flex-1 flex overflow-hidden bg-background">
      <div className="w-52 border-r border-border bg-card flex-shrink-0 p-3">
        <div className="text-xs font-semibold text-med-text-tertiary uppercase tracking-widest px-2 mb-3">
          Settings
        </div>
        <div className="space-y-0.5">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-colors ${
                section === s.id
                  ? "bg-secondary text-primary font-medium"
                  : "text-med-text-secondary hover:bg-background hover:text-foreground"
              }`}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {section === "profile" && (
          <div className="max-w-xl space-y-6">
            <div>
              <h2 className="text-base font-semibold text-foreground mb-1">
                Profile
              </h2>
              <p className="text-sm text-muted-foreground">
                Manage your personal information and preferences.
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-6 space-y-5">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center text-primary text-lg font-semibold">
                  SC
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">
                    Dr. Sarah Chen, MD
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Cardiologist · St. Mary Medical Center
                  </div>
                  <button className="text-xs text-primary hover:underline mt-1">
                    Change avatar
                  </button>
                </div>
              </div>
              {[
                { label: "Full Name", value: "Dr. Sarah Chen, MD" },
                { label: "Email", value: "dr.chen@stmary.org" },
                { label: "NPI Number", value: "1234567890" },
                { label: "Specialty", value: "Cardiology" },
                { label: "Department", value: "Cardiology — Unit 4B" },
              ].map((f) => (
                <div key={f.label}>
                  <label className="block text-xs font-medium text-foreground mb-1.5">
                    {f.label}
                  </label>
                  <input
                    defaultValue={f.value}
                    className="w-full px-3.5 py-2.5 border border-border rounded-lg text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  />
                </div>
              ))}
              <button className="bg-primary hover:hover:bg-primary/90 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors">
                Save changes
              </button>
            </div>
          </div>
        )}

        {section === "ai" && (
          <div className="max-w-xl space-y-6">
            <div>
              <h2 className="text-base font-semibold text-foreground mb-1">
                AI Configuration
              </h2>
              <p className="text-sm text-muted-foreground">
                Configure the AI models and behavior for Keppler AI.
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-6 space-y-5">
              {[
                { label: "Primary Model", value: "GPT-4o (Medical Fine-tune)" },
                { label: "Embedding Model", value: "text-embedding-3-large" },
                { label: "OCR Model", value: "Tesseract 5.3 + Medical NER" },
                { label: "Context Window", value: "128K tokens" },
                { label: "RAG Chunk Size", value: "512 tokens" },
              ].map((f) => (
                <div key={f.label}>
                  <label className="block text-xs font-medium text-foreground mb-1.5">
                    {f.label}
                  </label>
                  <select className="w-full px-3.5 py-2.5 border border-border rounded-lg text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all">
                    <option>{f.value}</option>
                  </select>
                </div>
              ))}
              <div className="pt-2 border-t border-border space-y-4">
                {[
                  { label: "Enable clinical suggestion mode", on: true },
                  { label: "Show confidence scores", on: true },
                  { label: "Auto-cite source documents", on: true },
                  { label: "Enable voice input", on: false },
                ].map((t) => (
                  <div
                    key={t.label}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-foreground">{t.label}</span>
                    <div
                      className={`w-10 h-5 rounded-full flex items-center px-0.5 cursor-pointer ${
                        t.on ? "bg-primary" : "bg-switch-background"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 bg-card rounded-full shadow transition-transform ${
                          t.on ? "translate-x-5" : ""
                        }`}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button className="bg-primary hover:hover:bg-primary/90 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors">
                Save configuration
              </button>
            </div>
          </div>
        )}

        {section !== "profile" && section !== "ai" && (
          <div className="max-w-xl">
            <div className="bg-card border border-border rounded-xl p-12 flex flex-col items-center justify-center text-center">
              <Settings className="w-8 h-8 text-switch-background mb-3" />
              <div className="text-sm font-medium text-foreground mb-1 capitalize">
                {section} Settings
              </div>
              <div className="text-xs text-med-text-tertiary">
                Configuration options will appear here.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
function AppInner() {
  const { isAuthenticated, loading } = useAuth()
  const [screen, setScreen] = useState<Screen>("home")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [activeOcrJobId, setActiveOcrJobId] = useState<string | null>(null)
  const [activeOcrFilename, setActiveOcrFilename] = useState<string | null>(
    null,
  )

  const startOcrJob = (jobId: string, filename: string) => {
    setActiveOcrJobId(jobId)
    setActiveOcrFilename(filename)
    // Do not navigate away; processing continues in the workspace queue
  }
  const viewOcrResult = (jobId: string, filename: string) => {
    setActiveOcrJobId(jobId)
    setActiveOcrFilename(filename)
    setScreen("ocr-result")
  }

  // There's no login screen to send anyone to -- AuthProvider signs itself
  // in behind the scenes (auth-context.tsx), so every screen is always
  // reachable. A stale "auth-*" screen value (e.g. from a token expiry
  // before this rewrite) just falls back to home instead of a real login UI.
  void isAuthenticated
  const effectiveScreen: Screen = screen.startsWith("auth") ? "home" : screen
  const isAuth = false

  const renderScreen = () => {
    switch (effectiveScreen) {
      case "auth-login":
        return <AuthLogin onNavigate={setScreen} />
      case "auth-forgot":
        return (
          <div className="min-h-screen flex items-center justify-center bg-background relative">
            <button
              onClick={() => setScreen("auth-login")}
              className="absolute top-6 left-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Back to login
            </button>
            <AuthThemeToggle />
            <div className="w-full max-w-sm text-center">
              <div className="w-14 h-14 bg-secondary rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Mail className="w-7 h-7 text-primary" />
              </div>
              <h1 className="text-2xl font-semibold text-foreground mb-2">
                Reset your password
              </h1>
              <p className="text-sm text-muted-foreground mb-8">
                Enter your hospital email and we will send you a reset link.
              </p>
              <input
                type="email"
                placeholder="dr.chen@stmary.org"
                className="w-full px-3.5 py-2.5 rounded-lg border border-border text-foreground text-sm bg-card focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent mb-3 placeholder:text-med-text-tertiary"
              />
              <button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2.5 rounded-lg text-sm transition-colors">
                Send reset link
              </button>
            </div>
          </div>
        )
      case "auth-2fa":
        return <Auth2FA onNavigate={setScreen} />
      case "auth-welcome":
        return <AuthWelcome onNavigate={setScreen} />
      case "home":
        return <WorkspaceHome onNavigate={setScreen} />
      case "ocr-workspace":
        return (
          <OCRWorkspace onStartJob={startOcrJob} onViewResult={viewOcrResult} />
        )
      case "ocr-result":
        return (
          <OCRResult
            jobId={activeOcrJobId}
            filename={activeOcrFilename}
            onNavigate={setScreen}
          />
        )
      case "pdf-summarizer":
        return <PDFSummarizer />
      case "ai-assistant":
        return <AIAssistant />
      case "document-vault":
        return <DocumentVault onNavigate={setScreen} />

      case "admin":
        return <AdminWorkspace />
      case "settings":
        return <SettingsView />
      default:
        return null
    }
  }

  if (isAuth) {
    return (
      <ThemeProvider>
        <div
          className="w-full h-screen overflow-hidden"
          style={{ fontFamily: "var(--font-sans, Inter, sans-serif)" }}
        >
          {renderScreen()}
        </div>
      </ThemeProvider>
    )
  }

  if (loading) {
    return (
      <ThemeProvider>
        <div
          className="w-full h-screen flex items-center justify-center bg-background text-sm text-muted-foreground"
          style={{ fontFamily: "var(--font-sans, Inter, sans-serif)" }}
        >
          Loading Keppler AI…
        </div>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <div
        className="w-full h-screen flex overflow-hidden"
        style={{ fontFamily: "var(--font-sans, Inter, sans-serif)" }}
      >
        <div className="relative z-50">
          <Sidebar
            current={effectiveScreen}
            onNavigate={setScreen}
            collapsed={sidebarCollapsed}
            setCollapsed={setSidebarCollapsed}
          />
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          {renderScreen()}
        </div>
      </div>
    </ThemeProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
