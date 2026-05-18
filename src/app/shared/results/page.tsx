'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Event, Runner, FilterOptions } from '@/types';
import { getSharedResults, getResultsByEventId } from '@/lib/api';
import { socketService } from '@/lib/socket';
import { formatDate } from '@/lib/utils';
import LiveClock from '@/components/LiveClock';
import SearchBar from '@/components/SearchBar';
import FilterPanel from '@/components/FilterPanel';
import ResultsTable from '@/components/ResultsTable';
import RunnerModal from '@/components/RunnerModal';

function SharedResultsContent() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token') || '';
    const eventId = searchParams.get('eventId') || '';

    const [event, setEvent] = useState<Event | null>(null);
    const [runners, setRunners] = useState<Runner[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedRunner, setSelectedRunner] = useState<Runner | null>(null);
    const [filters, setFilters] = useState<FilterOptions>({});
    const [searchTerm, setSearchTerm] = useState('');

    const fetchResults = useCallback(async () => {
        if (!token && !eventId) {
            setError('No token or eventId provided');
            setLoading(false);
            return;
        }

        try {
            // If we have token, use it; otherwise use eventId
            const data = token
                ? await getSharedResults(token, { ...filters, search: searchTerm || undefined })
                : await getResultsByEventId(eventId, { ...filters, search: searchTerm || undefined });
            setEvent(data.event);
            setRunners(data.runners);
            setError(null);
        } catch (err) {
            setError('Failed to load results. Please check the link and try again.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [token, eventId, filters, searchTerm]);

    useEffect(() => {
        fetchResults();
    }, [fetchResults]);

    useEffect(() => {
        if (!event?._id) return;

        socketService.connect();
        socketService.joinEvent(event._id);

        const unsubscribe = socketService.onRunnerUpdate((updatedRunner) => {
            setRunners((prev) =>
                prev.map((r) => (r._id === updatedRunner._id ? updatedRunner : r))
            );
        });

        return () => {
            socketService.leaveEvent(event._id);
            socketService.disconnect();
            unsubscribe();
        };
    }, [event?._id]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-500">Loading results...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 max-w-md mx-4 text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-semibold text-gray-800 mb-2">Error</h2>
                    <p className="text-gray-500 mb-6">{error}</p>
                    <Link href="/" className="text-blue-500 hover:text-blue-600 font-medium">
                        ← Back to Home
                    </Link>
                </div>
            </div>
        );
    }

    if (!event) return null;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <Link href="/" className="text-sm text-blue-500 hover:text-blue-600 mb-1 inline-block">
                                ← Back
                            </Link>
                            <h1 className="text-xl font-semibold text-gray-800">{event.name}</h1>
                            <p className="text-sm text-gray-500">{formatDate(event.date)} • {event.location}</p>
                        </div>
                        <LiveClock isLive={event.status === 'live'} startTime={event.startTime} />
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-6 py-6">
                {/* Search and Filters */}
                <div className="space-y-4 mb-6">
                    <div className="flex flex-col sm:flex-row gap-4">
                        <SearchBar
                            value={searchTerm}
                            onChange={setSearchTerm}
                            placeholder="Search BIB or Name..."
                        />
                    </div>
                    <FilterPanel filters={filters} onChange={setFilters} event={event} />
                </div>

                {/* Results Table */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <ResultsTable runners={runners} onViewDetails={setSelectedRunner} />
                </div>
            </main>

            {/* Runner Details Modal */}
            {selectedRunner && (
                <RunnerModal
                    runner={selectedRunner}
                    token={token}
                    onClose={() => setSelectedRunner(null)}
                />
            )}
        </div>
    );
}

export default function SharedResultsPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-500">Loading...</p>
                </div>
            </div>
        }>
            <SharedResultsContent />
        </Suspense>
    );
}
