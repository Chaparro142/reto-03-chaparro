import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Mi aplicación',
  description: 'Hecha con Next.js',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
