import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'ARCHIVIST MK1 — Camera Node',
    description: 'CCTV Mobile Camera Stream',
    viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
};

export default function CameraLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link
                href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Manrope:wght@300;400;500;600;700&display=swap"
                rel="stylesheet"
            />
            <link
                href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,300,0,0&display=swap"
                rel="stylesheet"
            />
            {children}
        </>
    );
}
