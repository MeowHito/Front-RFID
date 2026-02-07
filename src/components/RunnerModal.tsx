'use client';

import { Runner, TimingRecord } from '@/types';
import { formatTime, formatDateTime, getStatusColor, getStatusText, getGenderText } from '@/lib/utils';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import { getRunnerDetails } from '@/lib/api';

interface RunnerModalProps {
    runner: Runner;
    token: string;
    onClose: () => void;
}

export default function RunnerModal({ runner, token, onClose }: RunnerModalProps) {
    const [timingRecords, setTimingRecords] = useState<TimingRecord[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const data = await getRunnerDetails(token, runner._id);
                setTimingRecords(data.timingRecords);
            } catch (error) {
                console.error('Failed to fetch runner details:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchDetails();
    }, [runner._id, token]);

    // Close on Escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative min-h-screen flex items-center justify-center p-4">
                <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-white">Runner Details</h2>
                            <p className="text-blue-100">BIB #{runner.bib}</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                        >
                            <XMarkIcon className="h-6 w-6 text-white" />
                        </button>
                    </div>

                    <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
                        {/* Runner Info Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                            <InfoCard label="BIB" value={runner.bib} />
                            <InfoCard
                                label="Name"
                                value={
                                    <div>
                                        <div className="font-medium">{runner.firstNameTh} {runner.lastNameTh}</div>
                                        <div className="text-sm text-gray-500">{runner.firstName} {runner.lastName}</div>
                                    </div>
                                }
                            />
                            <InfoCard label="Gender" value={getGenderText(runner.gender)} />
                            <InfoCard label="Age" value={runner.age?.toString() || '-'} />
                            <InfoCard label="Team" value={runner.team || '-'} />
                            <InfoCard label="Box" value={runner.box || '-'} />
                        </div>

                        {/* Race Info */}
                        <div className="bg-gray-50 rounded-xl p-4 mb-6">
                            <h3 className="font-semibold text-gray-700 mb-3">Race Information</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <InfoCard label="Category" value={runner.category} small />
                                <InfoCard
                                    label="Status"
                                    value={
                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium text-white ${getStatusColor(runner.status)}`}>
                                            {getStatusText(runner.status)}
                                        </span>
                                    }
                                    small
                                />
                                <InfoCard label="Check-in" value={formatDateTime(runner.checkInTime)} small />
                                <InfoCard label="Start Time" value={formatDateTime(runner.startTime)} small />
                                <InfoCard label="Finish Time" value={formatDateTime(runner.finishTime)} small />
                                <InfoCard label="Net Time" value={formatTime(runner.netTime)} small highlight />
                                <InfoCard label="Overall Rank" value={runner.overallRank?.toString() || '-'} small />
                                <InfoCard label="Gender Rank" value={runner.genderRank?.toString() || '-'} small />
                            </div>
                        </div>

                        {/* Timing Records */}
                        <div>
                            <h3 className="font-semibold text-gray-700 mb-3">Route History</h3>
                            {loading ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                </div>
                            ) : timingRecords.length > 0 ? (
                                <div className="overflow-x-auto rounded-xl border border-gray-200">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Order</th>
                                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Checkpoint</th>
                                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Scan Time</th>
                                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Split Time</th>
                                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Elapsed</th>
                                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Note</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {timingRecords.map((record) => (
                                                <tr key={record._id} className="hover:bg-blue-50/50">
                                                    <td className="px-4 py-2 text-sm font-medium text-gray-900">{record.order}</td>
                                                    <td className="px-4 py-2">
                                                        <span className="px-2 py-1 text-xs font-medium rounded bg-indigo-50 text-indigo-700">
                                                            {record.checkpoint}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2 text-sm text-gray-600 font-mono">
                                                        {formatDateTime(record.scanTime)}
                                                    </td>
                                                    <td className="px-4 py-2 text-sm text-gray-600 font-mono">
                                                        {formatTime(record.splitTime)}
                                                    </td>
                                                    <td className="px-4 py-2 text-sm font-semibold text-gray-800 font-mono">
                                                        {formatTime(record.elapsedTime)}
                                                    </td>
                                                    <td className="px-4 py-2 text-sm text-gray-500">
                                                        {record.note || '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-gray-500">
                                    No timing records available
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="border-t border-gray-100 px-6 py-4 bg-gray-50 flex gap-3 justify-end">
                        <button
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                            onClick={onClose}
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function InfoCard({
    label,
    value,
    small = false,
    highlight = false
}: {
    label: string;
    value: React.ReactNode;
    small?: boolean;
    highlight?: boolean;
}) {
    return (
        <div className={`${small ? '' : 'bg-gray-50 rounded-lg p-3'}`}>
            <div className="text-xs text-gray-500 mb-0.5">{label}</div>
            <div className={`${highlight ? 'text-blue-600 font-bold' : 'text-gray-800'} ${small ? 'text-sm' : 'font-medium'}`}>
                {value}
            </div>
        </div>
    );
}
