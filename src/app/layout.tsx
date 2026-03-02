import type { Metadata } from "next";
import "./globals.css";
import { ConfiguredThemeProvider } from "@/components/configured-theme-provider";
import { RouteScopedSnstrProvider } from "@/components/providers/route-scoped-snstr-provider";
import { ThemeColorProvider } from "@/contexts/theme-context";
import { QueryProvider } from "@/contexts/query-provider";
import { SessionProvider } from "@/contexts/session-provider";
import { ToastProvider } from "@/hooks/use-toast";
import { copyConfig } from "@/lib/copy";

const siteFavicon = copyConfig.site.favicon?.trim() || "/favicon.ico";

export const metadata: Metadata = {
  title: "PlebDevs - Build on Bitcoin",
  description:
    "A one-of-a-kind developer education, content, and community platform built on Nostr and fully Lightning integrated.",
  openGraph: {
    title: "PlebDevs - Build on Bitcoin",
    description: "A one-of-a-kind developer education, content, and community platform built on Nostr and fully Lightning integrated.",
    type: "website",
    siteName: "PlebDevs",
  },
  twitter: {
    card: "summary",
    title: "PlebDevs - Build on Bitcoin",
    description: "A one-of-a-kind developer education, content, and community platform built on Nostr and fully Lightning integrated.",
  },
  icons: {
    icon: siteFavicon,
    shortcut: siteFavicon,
    apple: siteFavicon,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ConfiguredThemeProvider>
          <ThemeColorProvider>
            <QueryProvider>
              <SessionProvider>
                <ToastProvider>
                  <RouteScopedSnstrProvider>
                    {children}
                  </RouteScopedSnstrProvider>
                </ToastProvider>
              </SessionProvider>
            </QueryProvider>
          </ThemeColorProvider>
        </ConfiguredThemeProvider>
      </body>
    </html>
  );
}
