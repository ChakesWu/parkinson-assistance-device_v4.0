import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/ui/AppShell";
import AppFooter from "@/components/ui/AppFooter";
import ThemeProvider from "@/components/providers/ThemeProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SteadiGrip - Parkinson's Hand Training",
  description: "Parkinson's hand training design based on LSTM and CNN hybrid model",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className={`${inter.variable} antialiased min-h-screen flex flex-col`}>
        <ThemeProvider>
          <AppShell>
            <div className="flex-1 flex flex-col">{children}</div>
            <AppFooter />
          </AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
