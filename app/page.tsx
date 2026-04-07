'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type SessionLog = {
  id: number
  exercise_name: string
  reps: number
  weight: number
}

export default function Home() {
  const [logs, setLogs] = useState<SessionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    getLogs()
  }, [])

  async function getLogs() {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out after 10 seconds')), 10000)
      )

      const dataPromise = supabase
        .from('session_logs')
        .select('*')
        .order('id', { ascending: false })
        .limit(10)

      const result = (await Promise.race([dataPromise, timeoutPromise])) as {
        data: SessionLog[] | null
        error: { message: string } | null
      }

      if (result.error) {
        setErrorMessage(result.error.message)
      } else {
        setLogs(result.data || [])
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ padding: 20, background: 'black', color: 'white', minHeight: '100vh' }}>
      <h1>Gym App V9</h1>

      {loading ? (
        <p>Loading...</p>
      ) : errorMessage ? (
        <div>
          <p style={{ color: 'red' }}>Error: {errorMessage}</p>
          <p>Check Supabase table, RLS, or environment variables.</p>
        </div>
      ) : logs.length === 0 ? (
        <p>No logs yet</p>
      ) : (
        logs.map((log) => (
          <div key={log.id} style={{ marginBottom: 10 }}>
            <p>{log.exercise_name}</p>
            <p>{log.weight} kg × {log.reps}</p>
          </div>
        ))
      )}
    </main>
  )
}