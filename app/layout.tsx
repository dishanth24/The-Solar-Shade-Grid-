import type { Metadata } from "next";
import { Lora, Lato } from "next/font/google";
import "./globals.css";
import { SimProvider } from "@/lib/sim-context";

const lora = Lora({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const lato = Lato({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "700", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Solar Shade Grid | Digital Twin",
  description: "Digital twin and live dashboard for a solar-canopy market micro-grid",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${lato.variable} ${lora.variable} h-full antialiased`}
    >
      <body className="min-h-full h-full flex flex-col font-sans overflow-hidden">
        <SimProvider>{children}</SimProvider>
      </body>
    </html>
  );
}
