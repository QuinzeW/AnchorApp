import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"
import "./styles.css"

const title = "Sensory Anchoring"
const description = "Petits défis photographiques pour s’occuper l’esprit."

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ),
  title,
  description,
  applicationName: "Sensory Anchoring",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sensory Anchoring",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  openGraph: {
    title,
    description,
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#fffef6",
}

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="fr">
      <body className="min-h-dvh overscroll-none bg-[#fffef6] text-[#002d3a] antialiased">
        <div id="root" tabIndex={-1}>
          {children}
        </div>
      </body>
    </html>
  )
}
