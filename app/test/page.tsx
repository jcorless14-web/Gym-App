import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function Test() {
  return (
    <main style={{ padding: 20 }}>
      <Card>
        <CardHeader>
          <CardTitle>V10 Test Working</CardTitle>
        </CardHeader>
        <CardContent>
          Your UI system is working.
        </CardContent>
      </Card>
    </main>
  )
}