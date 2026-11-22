import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Residential Tax Appeal", template: "%s · Residential Tax Appeal" },
  description:
    "Look up your Cook County property, see its assessment history, find out when your township is open for appeal, and get the comparable properties to use in your appeal.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">Residential Tax Appeal</Link>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <p>
            Residential Tax Appeal is not a law firm and does not give legal or tax advice. Property data comes from the Cook County
            Assessor&apos;s open data and may lag the county&apos;s own website. Always confirm deadlines with the{" "}
            <a href="https://www.cookcountyassessoril.gov/assessment-calendar-and-deadlines">Cook County Assessor</a>.
          </p>
        </footer>
      </body>
    </html>
  );
}
