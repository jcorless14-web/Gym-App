"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type Exercise = {
  name: string
  weight: number
  reps: number
}

export default function Home() {
  const [exercises, setExercises] = useState<Exercise[]>([
    { name: "Cable Lateral Raise", weight: 12, reps: 15 },
    { name: "Incline Dumbbell Press", weight: 34, reps: 10 },
    { name: "Bench Press", weight: 90, reps: 8 },
  ])

  const [name, setName] = useState("")
  const [weight, setWeight] = useState("")
  const [reps, setReps] = useState("")

  const addExercise = () => {
    if (!name || !weight || !reps) return

    const newExercise = {
      name,
      weight: Number(weight),
      reps: Number(reps),
    }

    setExercises([newExercise, ...exercises])
    setName("")
    setWeight("")
    setReps("")
  }

  return (
    <main className="p-6 max-w-xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Gym App V10</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {exercises.map((ex, i) => (
            <div key={i} className="border-b pb-2">
              <p className="font-medium">{ex.name}</p>
              <p className="text-sm text-gray-400">
                {ex.weight} kg × {ex.reps}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add Exercise</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Exercise name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            placeholder="Weight (kg)"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            type="number"
          />
          <Input
            placeholder="Reps"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            type="number"
          />
          <Button onClick={addExercise}>Add</Button>
        </CardContent>
      </Card>
    </main>
  )
}