import { icons } from "lucide-react"

type IconName = keyof typeof icons

interface LucideIconProps {
  name: string
  className?: string
  style?: React.CSSProperties
}

export function LucideIcon({ name, className, style }: LucideIconProps) {
  if (!name || !/^[a-z0-9-]+$/i.test(name)) return null

  // Convert kebab-case or lowercase to PascalCase for lucide-react icons map
  const pascalName = name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("") as IconName

  const Icon = icons[pascalName]

  if (!Icon) return null

  return <Icon className={className} style={style} />
}
