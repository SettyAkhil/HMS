import * as React from "react"
import { cn } from "../../lib/cn"
import {
  COUNTRY_CODES,
  DEFAULT_COUNTRY_CODE,
  splitPhoneNumber,
  combinePhoneNumber,
  formatNationalDigits,
  CountryCode,
} from "./countryCodes"

export interface PhoneInputProps {
  value?: string
  countryCode?: string
  onCountryCodeChange?: (countryCode: string) => void
  onChange?: (
    value: string,
    meta?: { countryCode: string; nationalNumber: string; country?: CountryCode; isValid?: boolean }
  ) => void
  onValidChange?: (isValid: boolean) => void
  format?: "combined" | "national"
  placeholder?: string
  disabled?: boolean
  required?: boolean
  id?: string
  name?: string
  maxLength?: number
  className?: string
  inputClassName?: string
  selectClassName?: string
  autoFocus?: boolean
  size?: "sm" | "md" | "lg"
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  value = "",
  countryCode: controlledCode,
  onCountryCodeChange,
  onChange,
  onValidChange,
  format = "combined",
  placeholder,
  disabled = false,
  required = false,
  id,
  name,
  maxLength,
  className,
  inputClassName,
  selectClassName,
  autoFocus = false,
  size = "md",
}) => {
  // Parse incoming value into countryCode and nationalNumber
  const parsed = React.useMemo(() => {
    return splitPhoneNumber(value, controlledCode || DEFAULT_COUNTRY_CODE)
  }, [value, controlledCode])

  const [internalCode, setInternalCode] = React.useState<string>(
    controlledCode || parsed.countryCode || DEFAULT_COUNTRY_CODE
  )
  const [isTouched, setIsTouched] = React.useState(false)

  // Keep internal code in sync if controlled or if parsed code changed from a prefixed value
  React.useEffect(() => {
    if (controlledCode) {
      setInternalCode(controlledCode)
    } else if (parsed.countryCode) {
      setInternalCode(parsed.countryCode)
    }
  }, [controlledCode, parsed.countryCode])

  const activeCode = controlledCode || internalCode || DEFAULT_COUNTRY_CODE
  const activeCountry = React.useMemo(() => {
    return (
      COUNTRY_CODES.find((c) => c.dialCode === activeCode) ||
      COUNTRY_CODES.find((c) => c.dialCode === DEFAULT_COUNTRY_CODE) ||
      COUNTRY_CODES[0]
    )
  }, [activeCode])

  // Extract pure digits from current national number
  const currentDigits = React.useMemo(() => {
    return parsed.nationalNumber.replace(/\D/g, "").slice(0, activeCountry.digitsLength)
  }, [parsed.nationalNumber, activeCountry.digitsLength])

  const isValid = currentDigits.length === activeCountry.digitsLength
  const isPartiallyFilled = isTouched && currentDigits.length > 0 && !isValid

  React.useEffect(() => {
    if (onValidChange) {
      onValidChange(isValid)
    }
  }, [isValid, onValidChange])

  const handleCodeChange = (newCode: string) => {
    setInternalCode(newCode)
    if (onCountryCodeChange) {
      onCountryCodeChange(newCode)
    }
    const country = COUNTRY_CODES.find((c) => c.dialCode === newCode) || activeCountry
    // Re-slice digits to the new country length
    const slicedDigits = currentDigits.slice(0, country.digitsLength)
    const formatted = formatNationalDigits(slicedDigits, country)
    const outValue =
      format === "combined"
        ? combinePhoneNumber(newCode, formatted)
        : formatted

    if (onChange) {
      onChange(outValue, {
        countryCode: newCode,
        nationalNumber: formatted,
        country,
        isValid: slicedDigits.length === country.digitsLength,
      })
    }
  }

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value

    // If user pasted a number that starts with +, extract country code automatically
    let codeToUse = activeCode
    if (raw.trim().startsWith("+")) {
      const autoParsed = splitPhoneNumber(raw, activeCode)
      codeToUse = autoParsed.countryCode
      setInternalCode(codeToUse)
      if (onCountryCodeChange) {
        onCountryCodeChange(codeToUse)
      }
      raw = autoParsed.nationalNumber
    }

    const country = COUNTRY_CODES.find((c) => c.dialCode === codeToUse) || activeCountry
    // Strictly cap digits to the selected country's required national length
    const rawDigits = raw.replace(/\D/g, "").slice(0, country.digitsLength)
    const formatted = formatNationalDigits(rawDigits, country)
    const valid = rawDigits.length === country.digitsLength

    if (onChange) {
      const outValue =
        format === "combined"
          ? combinePhoneNumber(codeToUse, formatted)
          : formatted
      onChange(outValue, {
        countryCode: codeToUse,
        nationalNumber: formatted,
        country,
        isValid: valid,
      })
    }
  }

  // Size styling classes
  const sizeClasses = {
    sm: "h-7 text-[11px]",
    md: "h-9 text-[12px]",
    lg: "h-10 text-[13px]",
  }[size]

  // Formatted display value in input
  const displayValue = React.useMemo(() => {
    if (!currentDigits) return ""
    return formatNationalDigits(currentDigits, activeCountry)
  }, [currentDigits, activeCountry])

  return (
    <div
      className={cn(
        "inline-flex items-center w-full rounded-none border bg-white transition-all shadow-2xs relative",
        isPartiallyFilled
          ? "border-red-500 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-500/20"
          : isValid
          ? "border-emerald-500/80 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-500/20"
          : "border-[#CBD5E1] focus-within:border-[#1B4FD8] focus-within:ring-2 focus-within:ring-[#1B4FD8]/20",
        "focus-within:outline-none",
        disabled && "opacity-60 bg-gray-100 cursor-not-allowed",
        className
      )}
    >
      {/* Country Code Dropdown Badge */}
      <div
        className={cn(
          "relative flex items-center bg-slate-50 border-r border-[#CBD5E1] text-slate-700 px-2 py-0 shrink-0 select-none hover:bg-slate-100 transition-colors cursor-pointer",
          sizeClasses,
          selectClassName
        )}
        title={`Selected: ${activeCountry.name} (${activeCode}) - ${activeCountry.digitsLength} digits required`}
      >
        <span className="mr-1 text-sm leading-none" role="img" aria-label={activeCountry.name}>
          {activeCountry.flag}
        </span>
        <span className="font-semibold text-slate-800 font-mono text-[11px]">
          {activeCode}
        </span>
        <svg
          className="w-2.5 h-2.5 ml-1 text-slate-400 pointer-events-none"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
            d="M19 9l-7 7-7-7"
          />
        </svg>

        {/* Native Select overlaid seamlessly for perfect accessibility & mobile pickers */}
        <select
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
          value={activeCode}
          onChange={(e) => handleCodeChange(e.target.value)}
          disabled={disabled}
          title="Select Country Code"
        >
          {COUNTRY_CODES.map((c) => (
            <option key={`${c.code}-${c.dialCode}`} value={c.dialCode}>
              {c.flag} {c.name} ({c.dialCode}) - {c.digitsLength} digits
            </option>
          ))}
        </select>
      </div>

      {/* National Number Input */}
      <input
        type="tel"
        inputMode="numeric"
        value={displayValue}
        onChange={handleNumberChange}
        onBlur={() => setIsTouched(true)}
        placeholder={
          placeholder ||
          (activeCode === "+91"
            ? "98765 43210"
            : activeCode === "+1"
            ? "234 567 8901"
            : `${activeCountry.digitsLength}-digit number`)
        }
        disabled={disabled}
        required={required}
        id={id}
        name={name}
        maxLength={activeCountry.digitsLength + 4} // allow for spacing
        autoFocus={autoFocus}
        className={cn(
          "w-full h-full px-2.5 py-1 text-slate-900 bg-transparent placeholder-slate-400 focus:outline-none font-mono",
          sizeClasses,
          inputClassName
        )}
      />

      {/* Real-time Validation Checkmark indicator (matches design in Issue 1) */}
      {isValid && (
        <div
          className="pr-2 flex items-center text-emerald-600 font-bold select-none shrink-0"
          title={`Valid ${activeCountry.name} mobile number (${activeCountry.digitsLength} digits)`}
        >
          <span className="text-[13px] bg-emerald-50 text-emerald-600 border border-emerald-300 w-4 h-4 rounded-full flex items-center justify-center font-bold">
            ✓
          </span>
        </div>
      )}

      {/* Invalid Warning indicator when user blurred with incomplete number */}
      {isPartiallyFilled && (
        <div
          className="pr-2 flex items-center text-red-500 font-bold select-none shrink-0"
          title={`Needs ${activeCountry.digitsLength} digits (entered ${currentDigits.length})`}
        >
          <span className="text-[10px] bg-red-50 text-red-600 border border-red-300 px-1 py-0.2 font-mono">
            {currentDigits.length}/{activeCountry.digitsLength}
          </span>
        </div>
      )}
    </div>
  )
}

export default PhoneInput
