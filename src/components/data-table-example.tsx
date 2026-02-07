"use client"

import { Badge } from "@/components/ui/badge"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"

// --- Sample data type ---
interface Employee {
  id: number
  name: string
  email: string
  department: string
  role: string
  status: "active" | "inactive" | "on-leave"
  salary: number
  startDate: string
}

// --- Sample data ---
const employees: Employee[] = [
  { id: 1, name: "Alice Johnson", email: "alice@example.com", department: "Engineering", role: "Senior Developer", status: "active", salary: 125000, startDate: "2022-03-15" },
  { id: 2, name: "Bob Smith", email: "bob@example.com", department: "Design", role: "Lead Designer", status: "active", salary: 110000, startDate: "2021-07-01" },
  { id: 3, name: "Carol Davis", email: "carol@example.com", department: "Marketing", role: "Marketing Manager", status: "on-leave", salary: 95000, startDate: "2023-01-10" },
  { id: 4, name: "Dan Wilson", email: "dan@example.com", department: "Engineering", role: "Junior Developer", status: "active", salary: 75000, startDate: "2024-06-20" },
  { id: 5, name: "Eva Martinez", email: "eva@example.com", department: "Sales", role: "Account Executive", status: "inactive", salary: 88000, startDate: "2020-11-05" },
  { id: 6, name: "Frank Lee", email: "frank@example.com", department: "Engineering", role: "DevOps Engineer", status: "active", salary: 115000, startDate: "2022-09-12" },
]

// --- Column definitions with custom renderers ---
const columns: ColumnDef<Employee>[] = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "department", label: "Department" },
  { key: "role", label: "Role", visible: false },
  {
    key: "status",
    label: "Status",
    render: (value) => {
      const v = value as Employee["status"]
      const variant = v === "active" ? "default" : v === "on-leave" ? "secondary" : "outline"
      return <Badge variant={variant}>{v}</Badge>
    },
  },
  {
    key: "salary",
    label: "Salary",
    className: "text-right",
    render: (value) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value as number),
  },
  {
    key: "startDate",
    label: "Start Date",
    render: (value) => new Date(value as string).toLocaleDateString(),
  },
]

export function DataTableExample() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Employees</h2>
        <p className="text-sm text-muted-foreground">
          Example usage of the DataTable component with column toggling,
          drag-to-reorder, and sorting.
        </p>
      </div>
      <DataTable
        storageKey="example-employees"
        columns={columns}
        data={employees}
        rowKey="id"
        onRowClick={(row) => alert(`Clicked: ${row.name}`)}
        emptyMessage="No employees found."
      />
    </div>
  )
}
