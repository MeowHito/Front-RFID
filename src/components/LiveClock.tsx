'use client';

import { useState, useEffect } from 'react';

interface LiveClockProps {
    isLive: boolean;
    startTime?: string;
}

export default function LiveClock({ isLive, startTime }: LiveClockProps) {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [elapsedTime, setElapsedTime] = useState('00:00:00');

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(new Date());

            if (isLive && startTime) {
                const start = new Date(startTime).getTime();
                const now = Date.now();
                const elapsed = now - start;

                const hours = Math.floor(elapsed / 3600000);
                const minutes = Math.floor((elapsed % 3600000) / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);

                setElapsedTime(
                    `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
                );
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [isLive, startTime]);

    return (
        <div className="flex items-center gap-4">
            {isLive && (
                <div className="flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                    <span className="text-green-500 font-semibold">Live</span>
                </div>
            )}
            <div className="text-xl font-mono font-bold text-white bg-gray-800 px-4 py-2 rounded-lg">
                {isLive ? elapsedTime : currentTime.toLocaleTimeString('th-TH')}
            </div>
        </div>
    );
}
