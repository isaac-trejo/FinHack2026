import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GSSI Dashboard — Global Supply Chain Stress Index",
  description: "Real-time GSSI monitoring and 3-month forecast dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Inline script prevents flash of wrong theme before React hydrates
  const themeScript = `
    (function(){
      try {
        var t = localStorage.getItem('gssi-theme');
        if (t === 'light') { document.documentElement.classList.remove('dark'); }
        else if (t === 'dark') { document.documentElement.classList.add('dark'); }
        else if (window.matchMedia('(prefers-color-scheme: light)').matches) { document.documentElement.classList.remove('dark'); }
        else { document.documentElement.classList.add('dark'); }
      } catch(e) { document.documentElement.classList.add('dark'); }
    })();
  `;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
