"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import {
  Building,
  Globe,
  Mail,
  Phone,
  MapPin,
  User,
  Lock,
  Webhook,
  Save,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"

interface CompanySettings {
  id: number
  companyName: string
  companyAddress: string
  companyCity: string
  companyState: string
  companyZip: string
  companyPhone: string
  companyEmail: string
  companyWebsite: string
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>
      <CompanySettingsSection />
      <ProfileSection />
      <N8nIntegrationSection />
    </div>
  )
}

// ─── Company Information ────────────────────────────────────────────────────

function CompanySettingsSection() {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  const [companyName, setCompanyName] = useState("")
  const [companyAddress, setCompanyAddress] = useState("")
  const [companyCity, setCompanyCity] = useState("")
  const [companyState, setCompanyState] = useState("")
  const [companyZip, setCompanyZip] = useState("")
  const [companyPhone, setCompanyPhone] = useState("")
  const [companyEmail, setCompanyEmail] = useState("")
  const [companyWebsite, setCompanyWebsite] = useState("")

  const fetchSettings = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/settings")
      const result = await res.json()
      if (result.success && result.data) {
        const s = result.data as CompanySettings
        setCompanyName(s.companyName || "")
        setCompanyAddress(s.companyAddress || "")
        setCompanyCity(s.companyCity || "")
        setCompanyState(s.companyState || "")
        setCompanyZip(s.companyZip || "")
        setCompanyPhone(s.companyPhone || "")
        setCompanyEmail(s.companyEmail || "")
        setCompanyWebsite(s.companyWebsite || "")
      }
    } catch {
      setMessage({ type: "error", text: "Failed to load settings." })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  async function handleSave() {
    setIsSaving(true)
    setMessage(null)

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          companyAddress,
          companyCity,
          companyState,
          companyZip,
          companyPhone,
          companyEmail,
          companyWebsite,
        }),
      })
      const result = await res.json()

      if (result.success) {
        setMessage({ type: "success", text: "Company settings saved." })
      } else {
        setMessage({
          type: "error",
          text: result.error || "Failed to save settings.",
        })
      }
    } catch {
      setMessage({ type: "error", text: "Failed to save settings." })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building className="text-muted-foreground size-5" />
          <div>
            <CardTitle>Company Information</CardTitle>
            <CardDescription>
              Your business details used on invoices and communications.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Your company name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="companyAddress">Address</Label>
              <div className="relative">
                <MapPin className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                <Input
                  id="companyAddress"
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  placeholder="Street address"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="companyCity">City</Label>
                <Input
                  id="companyCity"
                  value={companyCity}
                  onChange={(e) => setCompanyCity(e.target.value)}
                  placeholder="City"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyState">State</Label>
                <Input
                  id="companyState"
                  value={companyState}
                  onChange={(e) => setCompanyState(e.target.value)}
                  placeholder="State"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyZip">Zip Code</Label>
                <Input
                  id="companyZip"
                  value={companyZip}
                  onChange={(e) => setCompanyZip(e.target.value)}
                  placeholder="Zip code"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="companyPhone">Phone</Label>
              <div className="relative">
                <Phone className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                <Input
                  id="companyPhone"
                  value={companyPhone}
                  onChange={(e) => setCompanyPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="companyEmail">Email</Label>
              <div className="relative">
                <Mail className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                <Input
                  id="companyEmail"
                  type="email"
                  value={companyEmail}
                  onChange={(e) => setCompanyEmail(e.target.value)}
                  placeholder="company@example.com"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="companyWebsite">Website</Label>
              <div className="relative">
                <Globe className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                <Input
                  id="companyWebsite"
                  value={companyWebsite}
                  onChange={(e) => setCompanyWebsite(e.target.value)}
                  placeholder="https://www.example.com"
                  className="pl-9"
                />
              </div>
            </div>

            {message && (
              <div
                className={`rounded-md px-3 py-2 text-sm ${
                  message.type === "success"
                    ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {message.text}
              </div>
            )}

            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Save className="mr-2 size-4" />
              )}
              Save Changes
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Profile ────────────────────────────────────────────────────────────────

function ProfileSection() {
  const { data: session, update: updateSession } = useSession()
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  useEffect(() => {
    if (session?.user) {
      setName(session.user.name || "")
      setEmail(session.user.email || "")
    }
  }, [session])

  async function handleSave() {
    setMessage(null)

    if (newPassword && newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "Passwords do not match." })
      return
    }

    if (newPassword && newPassword.length < 6) {
      setMessage({
        type: "error",
        text: "Password must be at least 6 characters.",
      })
      return
    }

    setIsSaving(true)

    try {
      const body: Record<string, string> = { name, email }
      if (newPassword) {
        body.password = newPassword
      }

      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const result = await res.json()

      if (result.success) {
        setMessage({ type: "success", text: "Profile updated." })
        setNewPassword("")
        setConfirmPassword("")
        // Refresh the session to reflect new name/email
        await updateSession()
      } else {
        setMessage({
          type: "error",
          text: result.error || "Failed to update profile.",
        })
      }
    } catch {
      setMessage({ type: "error", text: "Failed to update profile." })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <User className="text-muted-foreground size-5" />
          <div>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Update your personal information and password.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profileName">Name</Label>
            <Input
              id="profileName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profileEmail">Email</Label>
            <div className="relative">
              <Mail className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <Input
                id="profileEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="pl-9"
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <div className="relative">
              <Lock className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Leave blank to keep current"
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <div className="relative">
              <Lock className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="pl-9"
              />
            </div>
          </div>

          {message && (
            <div
              className={`rounded-md px-3 py-2 text-sm ${
                message.type === "success"
                  ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {message.text}
            </div>
          )}

          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Update Profile
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── n8n Integration ────────────────────────────────────────────────────────

function N8nIntegrationSection() {
  const webhookUrl = "/api/webhooks/n8n"
  const supportedEvents = [
    "New Customer Created",
    "Service Completed",
    "Invoice Created",
  ]

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Webhook className="text-muted-foreground size-5" />
          <div>
            <CardTitle>Automation (n8n)</CardTitle>
            <CardDescription>
              Configure your n8n instance to send webhooks to this endpoint. Set
              the <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">N8N_WEBHOOK_URL</code> environment
              variable to enable outgoing automation triggers.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Webhook Endpoint</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm font-mono">
                {webhookUrl}
              </code>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Supported Events</Label>
            <div className="flex flex-wrap gap-2">
              {supportedEvents.map((event) => (
                <Badge key={event} variant="secondary">
                  {event}
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950">
            <p className="text-sm text-amber-800 dark:text-amber-300">
              <strong>Webhook Authentication:</strong> Set the{" "}
              <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded">
                N8N_WEBHOOK_SECRET
              </code>{" "}
              environment variable for incoming webhook authentication. Include
              this secret in the <code className="font-mono text-xs">Authorization</code> header
              of your n8n webhook requests.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
