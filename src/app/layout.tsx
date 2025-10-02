import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { P2PProvider } from "@/contexts/P2PContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Navigation from "@/components/Navigation";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Retcon Black Mountain - P2P Document Archive",
  description: "A decentralized collaborative research platform with P2P document sharing",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased bg-white dark:bg-black`}>
        <ThemeProvider>
          <P2PProvider>
            <Navigation />
            <main className="min-h-screen">
              {children}
            </main>
          </P2PProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}