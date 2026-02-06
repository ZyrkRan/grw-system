import type { Metadata } from "next"
import { SessionProvider } from "@/components/session-provider"
import "./globals.css"

export const metadata: Metadata = {
  title: "GRW CRM",
  description: "Service Management CRM",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
