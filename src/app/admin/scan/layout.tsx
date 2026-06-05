import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'RaceControl Scanner — Velocity',
    description: 'Checkpoint QR / Barcode timing scanner',
};

// Standalone dark "Velocity Performance System" shell for the checkpoint
// scanner. Loads the JetBrains Mono / Manrope / Material Symbols fonts the
// design relies on. This route intentionally does NOT use AdminLayout — it is a
// full-screen race-control surface meant for checkpoint stations.
export default function ScanLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link
                href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Manrope:wght@400;500;600;700&display=swap"
                rel="stylesheet"
            />
            <link
                href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
                rel="stylesheet"
            />
            {children}
        </>
    );
}
