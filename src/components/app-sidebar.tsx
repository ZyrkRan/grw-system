"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import { signOut, useSession } from "next-auth/react"
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Route,
  Wrench,
  FileText,
  DollarSign,
  Settings,
  LogOut,
  ChevronsUpDown,
  ChevronLeft,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Calendar", url: "/calendar", icon: CalendarDays },
  { title: "Customers", url: "/customers", icon: Users },
  { title: "Routes", url: "/routes", icon: Route },
  { title: "Services", url: "/services", icon: Wrench },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Finances", url: "/finances", icon: DollarSign },
  { title: "Settings", url: "/settings", icon: Settings },
]

function SidebarToggle() {
  const { toggleSidebar, state } = useSidebar()

  return (
    <button
      onClick={toggleSidebar}
      className="absolute top-7 -right-3 z-20 hidden h-6 w-6 items-center justify-center rounded-full border bg-sidebar shadow-sm transition-colors hover:bg-sidebar-accent md:flex"
      aria-label={state === "expanded" ? "Collapse sidebar" : "Expand sidebar"}
    >
      <ChevronLeft
        className={`h-3.5 w-3.5 transition-transform duration-200 ${
          state === "collapsed" ? "rotate-180" : ""
        }`}
      />
    </button>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()

  const user = session?.user

  function getInitials(name: string | null | undefined) {
    if (!name) return "?"
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarToggle />

      <SidebarHeader className="border-b px-4 py-5">
        {/* Full logo — visible when expanded */}
        <div className="flex justify-center group-data-[collapsible=icon]:hidden">
          <img
            src="/logo.png"
            alt="GRW"
            className="h-12 w-auto dark:hidden"
          />
          <img
            src="/logo-dark.png"
            alt="GRW"
            className="hidden h-12 w-auto dark:block"
          />
        </div>
        {/* Icon logo — visible when collapsed */}
        <div className="hidden items-center justify-center group-data-[collapsible=icon]:flex">
          <img
            src="/logo-icon.png"
            alt="GRW"
            className="size-7 dark:hidden"
          />
          <img
            src="/logo-icon-dark.png"
            alt="GRW"
            className="hidden size-7 dark:block"
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  item.url === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.url)

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      size="lg"
                      tooltip={item.title}
                      className="group-data-[collapsible=icon]:!size-10 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center"
                    >
                      <Link href={item.url}>
                        <item.icon className="size-5 group-data-[collapsible=icon]:!size-6" />
                        <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {getInitials(user?.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-1 flex-col text-left text-sm leading-tight">
                    <span className="truncate font-medium">
                      {user?.name ?? "User"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user?.email ?? ""}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto h-4 w-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                className="w-56"
              >
                <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
