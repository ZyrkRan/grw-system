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
  Save,
  Loader2,
  ChevronDown,
  Brain,
  CheckCircle2,
  XCircle,
  RefreshCw,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  getOllamaConfig,
  setOllamaConfig,
  checkOllamaHealth,
  listModels,
  type OllamaModel,
} from "@/lib/ollama"

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
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Settings</h1>
      <CompanySettingsSection />
      <ProfileSection />
      <OllamaSection />
    </div>
  )
}

// ─── Collapsible Section Wrapper ──────────────────────────────────────────────

function SettingsSection({
  icon: Icon,
  title,
  description,
  defaultOpen = true,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer select-none">
            <div className="flex items-center gap-2">
              <Icon className="text-muted-foreground size-5" />
              <div className="flex-1">
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </div>
              <ChevronDown
                className={cn(
                  "size-5 text-muted-foreground transition-transform duration-200",
                  open && "rotate-180"
                )}
              />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
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
    <SettingsSection
      icon={Building}
      title="Company Information"
      description="Your business details used on invoices and communications."
    >
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
    </SettingsSection>
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
    <SettingsSection
      icon={User}
      title="Profile"
      description="Update your personal information and password."
    >
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
    </SettingsSection>
  )
}

// ─── Ollama AI Integration ───────────────────────────────────────────────────

function OllamaSection() {
  const [ollamaUrl, setOllamaUrl] = useState("")
  const [selectedModel, setSelectedModel] = useState("")
  const [models, setModels] = useState<OllamaModel[]>([])
  const [isConnected, setIsConnected] = useState<boolean | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  // Load config from localStorage on mount
  useEffect(() => {
    const config = getOllamaConfig()
    setOllamaUrl(config.url)
    setSelectedModel(config.model)
    // Auto-check connection on mount
    testConnection(config.url)
  }, [])

  async function testConnection(url?: string) {
    setIsTesting(true)
    setMessage(null)
    try {
      // Temporarily set URL if provided so health check uses it
      if (url) {
        setOllamaConfig({ url })
      }
      const health = await checkOllamaHealth()
      setIsConnected(health.connected)

      if (health.connected) {
        const availableModels = await listModels()
        setModels(availableModels)
        // If current model isn't in the list, select the first available
        if (availableModels.length > 0) {
          const currentModel = selectedModel || getOllamaConfig().model
          const modelExists = availableModels.some(
            (m) => m.name === currentModel
          )
          if (!modelExists) {
            setSelectedModel(availableModels[0].name)
          }
        }
      } else {
        setModels([])
        setMessage({
          type: "error",
          text: health.error || "Cannot connect to Ollama",
        })
      }
    } catch {
      setIsConnected(false)
      setModels([])
      setMessage({ type: "error", text: "Failed to connect to Ollama" })
    } finally {
      setIsTesting(false)
    }
  }

  async function handleSave() {
    setIsSaving(true)
    setMessage(null)
    try {
      // Save to localStorage (client-side features)
      setOllamaConfig({ url: ollamaUrl, model: selectedModel })
      // Save to database (server-side AI features)
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ollamaUrl, ollamaModel: selectedModel }),
      })
      setMessage({ type: "success", text: "Ollama settings saved." })
    } catch {
      setMessage({ type: "error", text: "Failed to save settings." })
    } finally {
      setIsSaving(false)
    }
  }

  function formatModelSize(bytes: number) {
    const gb = bytes / (1024 * 1024 * 1024)
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  }

  return (
    <SettingsSection
      icon={Brain}
      title="AI Integration (Ollama)"
      description="Connect to a local Ollama instance for AI-powered features like transaction categorization."
      defaultOpen={false}
    >
      <div className="space-y-4">
        {/* Connection status */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Status:</span>
          {isConnected === null || isTesting ? (
            <Badge variant="outline" className="gap-1.5">
              <Loader2 className="size-3 animate-spin" />
              Checking...
            </Badge>
          ) : isConnected ? (
            <Badge variant="outline" className="gap-1.5 border-green-500 text-green-600">
              <CheckCircle2 className="size-3" />
              Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1.5 border-red-500 text-red-600">
              <XCircle className="size-3" />
              Disconnected
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => testConnection()}
            disabled={isTesting}
          >
            <RefreshCw className={cn("size-4", isTesting && "animate-spin")} />
            <span className="sr-only">Test connection</span>
          </Button>
        </div>

        <Separator />

        {/* Ollama URL */}
        <div className="space-y-2">
          <Label htmlFor="ollamaUrl">Ollama URL</Label>
          <Input
            id="ollamaUrl"
            value={ollamaUrl}
            onChange={(e) => setOllamaUrl(e.target.value)}
            placeholder="http://localhost:11434"
          />
          <p className="text-xs text-muted-foreground">
            The URL of your local Ollama instance. Default is http://localhost:11434
          </p>
        </div>

        {/* Model selection */}
        <div className="space-y-2">
          <Label htmlFor="ollamaModel">Model</Label>
          {models.length > 0 ? (
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger>
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.name} value={m.name}>
                    <span className="flex items-center gap-2">
                      {m.name}
                      <span className="text-xs text-muted-foreground">
                        ({formatModelSize(m.size)})
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="ollamaModel"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              placeholder="mistral"
            />
          )}
          <p className="text-xs text-muted-foreground">
            {models.length > 0
              ? `${models.length} model${models.length === 1 ? "" : "s"} available on your Ollama instance.`
              : "Connect to Ollama to see available models, or type a model name manually."}
          </p>
        </div>

        {/* Info box */}
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            AI features run entirely on your local machine via Ollama. Your data never
            leaves your network. Make sure Ollama is running before using AI features.
          </p>
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

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Save Settings
          </Button>
          <Button
            variant="outline"
            onClick={() => testConnection(ollamaUrl)}
            disabled={isTesting}
          >
            {isTesting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            Test Connection
          </Button>
        </div>
      </div>
    </SettingsSection>
  )
}

