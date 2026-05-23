import type { Metadata } from "next";
import { Prompt } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { LanguageProvider } from "@/lib/language-context";
import Script from "next/script";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["thai", "latin", "latin-ext"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});
  
export const metadata: Metadata = {
  title: "RFID Timing System",
  description: "ระบบจับเวลาวิ่งแบบ Real-time ด้วยเทคโนโลยี RFID",
  other: {
    google: "notranslate",
  },
};

// Inline script to set theme class before React hydration (prevents flash)
const themeScript = `
  (function() {
    try {
      var theme = localStorage.getItem('theme') || 'light';
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
      }
    } catch (e) {
      document.documentElement.classList.add('light');
    }
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className="light" translate="no" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {GA_ID && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
            <Script id="ga-init" strategy="afterInteractive">{`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}', { page_path: window.location.pathname });
            `}</Script>
          </>
        )}
      </head>
      <body
        className={`${prompt.variable} font-sans antialiased notranslate`}
        translate="no"
      >
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              {children}
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
