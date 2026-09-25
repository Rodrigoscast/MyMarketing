import type { Metadata } from "next";
import "./globals.css";
import "react-toastify/dist/ReactToastify.css";
import { ToastProvider } from "@/components/Toast";

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
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
