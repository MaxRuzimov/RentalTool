import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RentalTool",
  description: "Rent tools from people near you in the GTA.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="relative min-h-full flex flex-col overflow-x-hidden font-sans">
        <div
          className="pointer-events-none fixed -top-32 -left-32 h-[480px] w-[480px] rounded-full bg-primary/10 blur-[100px]"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none fixed -right-24 -bottom-24 h-[420px] w-[420px] rounded-full bg-accent/10 blur-[100px]"
          aria-hidden="true"
        />
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
