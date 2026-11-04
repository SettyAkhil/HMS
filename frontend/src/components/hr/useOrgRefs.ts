import { useCallback, useEffect, useState } from "react"
import { hr } from "../../services/hr/client"
import type { Branch, Department, Designation, Hospital } from "../../services/hr/types"

export type OrgRefs = { hospitals: Hospital[]; branches: Branch[]; departments: Department[]; designations: Designation[] }

let memoryCache: OrgRefs | null = null
let inflightPromise: Promise<OrgRefs> | null = null

/** Lookup lists used by filters and forms across the HR workspace. Cached in memory for instant loads. */
export default function useOrgRefs(version = 0) {
  const [data, setData] = useState<OrgRefs | null>(memoryCache)
  const [loading, setLoading] = useState(!memoryCache)
  const [error, setError] = useState<any>(null)

  const reload = useCallback(async () => {
    if (memoryCache && version === 0) {
      setData(memoryCache)
      setLoading(false)
      return
    }

    if (!inflightPromise) {
      inflightPromise = Promise.all([
        hr.get<Hospital[]>("/api/v1/hr/hospitals"),
        hr.get<Branch[]>("/api/v1/hr/branches"),
        hr.get<Department[]>("/api/v1/hr/departments"),
        hr.get<Designation[]>("/api/v1/hr/designations"),
      ]).then(([hospitals, branches, departments, designations]) => {
        const refs = { hospitals, branches, departments, designations }
        memoryCache = refs
        return refs
      }).finally(() => {
        inflightPromise = null
      })
    }

    try {
      const result = await inflightPromise
      setData(result)
      setError(null)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [version])

  useEffect(() => {
    reload()
  }, [reload])

  return { data, error, loading, reload, setData }
}
