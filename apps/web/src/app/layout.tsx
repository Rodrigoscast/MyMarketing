import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MyMarketing | Plataforma de marketing",
  description: "Agende publicacoes, conecte anuncios e acompanhe resultados em uma plataforma elegante para times de marketing."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
