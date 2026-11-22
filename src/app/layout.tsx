import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meja Bundar: Grup Chat Multi-AI",
  description:
    "Satu meja grup chat tempat pemilik duduk bersama tujuh kursi AI dengan peran khusus, pipeline tugas berurutan, gambar visual, dan kontrol sumber model.",
  icons: {
    icon: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-[#F6F4F0] font-sans text-[#18181B] antialiased selection:bg-[#FED7AA] selection:text-[#18181B]">
        {children}
      </body>
    </html>
  );
}
