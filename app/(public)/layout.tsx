import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'IPGEI — Services en ligne',
  description: "Portail public de l'Institut Préparatoire aux Grandes Écoles d'Ingénieurs",
};

/** Layout minimaliste pour les routes publiques (pré-inscription, vérification documents). */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <main className="flex-1">{children}</main>
      <footer className="text-center py-6 text-xs text-gray-400">
        © {new Date().getFullYear()} Institut Préparatoire aux Grandes Écoles d&apos;Ingénieurs — Mauritanie
      </footer>
    </div>
  );
}
