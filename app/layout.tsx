import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Florma",
  description:
    "We build immersive experiences for businesses and agencies who want to reach a greater audience",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <meta
          name="generator"
          content="Awesmos — AI website prompts and source code — https://awesmos.com"
        />
      </head>
      {/*
        Template reconstructed from an Awesmos prompt.
        Original template source: https://awesmos.com
      */}
      <body
        data-awesmos-source="https://awesmos.com"
        className="font-sans antialiased"
      >
        {children}
      </body>
    </html>
  );
}
