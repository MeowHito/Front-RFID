'use client';

import { useEffect, useState } from 'react';

interface SpotlightProps {
    size?: number;
}

export default function CursorSpotlight({ size = 500 }: SpotlightProps) {
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            setPosition({ x: e.clientX, y: e.clientY });
            if (!isVisible) setIsVisible(true);
        };

        const handleMouseLeave = () => {
            setIsVisible(false);
        };

        window.addEventListener('mousemove', handleMouseMove);
        document.body.addEventListener('mouseleave', handleMouseLeave);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            document.body.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, [isVisible]);

    return (
        <div
            className="pointer-events-none fixed inset-0 z-30 transition-opacity duration-300"
            style={{ opacity: isVisible ? 1 : 0 }}
        >
            <div
                className="absolute rounded-full transition-transform duration-75 ease-out"
                style={{
                    left: position.x - size / 2,
                    top: position.y - size / 2,
                    width: size,
                    height: size,
                    background: `radial-gradient(circle, var(--spotlight-color) 0%, transparent 70%)`,
                }}
            />
        </div>
    );
}
