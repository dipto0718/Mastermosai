import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Kalam } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Chalk handwriting. Kalam has Latin and Devanagari; Bengali falls back to the default font.
const kalam = Kalam({ variable: "--font-kalam", subsets: ["latin", "devanagari"], weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "Mastermosai AI: your personal AI mentor",
  description:
    "Your Personal AI Mentor for Lifelong Learning. Learn with Akash Master and Little Master, free for every student, in English, Hindi and Bengali.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#121311" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${kalam.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
