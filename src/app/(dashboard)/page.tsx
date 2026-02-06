import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <Card>
        <CardHeader>
          <CardTitle>Welcome to GRW CRM</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Your service management dashboard. Use the sidebar to navigate
            between sections.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
