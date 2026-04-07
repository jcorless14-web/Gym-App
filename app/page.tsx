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

  useEffect(() => {
    getLogs()
  }, [])

  async function getLogs() {
    const { data, error } = await supabase
      .from('session_logs')
      .select('*')

    if (error) {
      console.error(error)
    } else {
      setLogs(data || [])
    }

    setLoading(false)
  }

  return (
    <main style={{ padding: 20, background: 'black', color: 'white', minHeight: '100vh' }}>
      <h1>Gym App V9</h1>

      {loading ? (
        <p>Loading...</p>
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