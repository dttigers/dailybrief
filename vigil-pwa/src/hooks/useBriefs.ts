import { useEffect, useState } from 'react'
import { getBriefs, type BriefApiResponse } from '../api/client'

export function useBriefs() {
  const [briefs, setBriefs] = useState<BriefApiResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getBriefs({ limit: 50 })
      .then((res) => {
        if (!cancelled) setBriefs(res.data)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { briefs, loading, error }
}
