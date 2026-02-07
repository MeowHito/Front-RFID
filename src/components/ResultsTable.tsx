'use client';

import { Runner } from '@/types';
import { formatTime, getStatusColor, getStatusText, getGenderText, getRankIcon } from '@/lib/utils';

interface ResultsTableProps {
    runners: Runner[];
    onViewDetails: (runner: Runner) => void;
}

export default function ResultsTable({ runners, onViewDetails }: ResultsTableProps) {
    return (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                <h3 className="text-lg font-semibold text-gray-800">Race Results</h3>
                <p className="text-sm text-gray-600">Showing {runners.length} of {runners.length} runners</p>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Rank</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">BIB</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Full Name</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Gender</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Box</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Age Group</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Latest Checkpoint</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Time</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Elapsed Time</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Details</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                        {runners.map((runner, index) => {
                            const rankIcon = getRankIcon(runner.overallRank);

                            return (
                                <tr
                                    key={runner._id}
                                    className={`hover:bg-blue-50/50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                                >
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-1">
                                            {rankIcon && <span className="text-lg">{rankIcon}</span>}
                                            <span className={`font-bold ${runner.overallRank <= 3 ? 'text-amber-600' : 'text-gray-700'}`}>
                                                {runner.overallRank || '-'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-blue-100 text-blue-800">
                                            {runner.bib}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex flex-col">
                                            <span className="font-medium text-gray-900">
                                                {runner.firstNameTh} {runner.lastNameTh}
                                            </span>
                                            <span className="text-sm text-gray-500">
                                                {runner.firstName} {runner.lastName}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                                        {getGenderText(runner.gender)}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        <span className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700">
                                            {runner.box || '-'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                                        {runner.ageGroup || '-'}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-white ${getStatusColor(runner.status)}`}>
                                            {getStatusText(runner.status)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        <span className="px-2 py-1 text-sm font-medium rounded bg-indigo-50 text-indigo-700">
                                            {runner.latestCheckpoint || '-'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap font-mono text-sm font-semibold text-gray-800">
                                        {formatTime(runner.netTime)}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap font-mono text-sm text-gray-600">
                                        {formatTime(runner.elapsedTime)}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-center">
                                        <button
                                            onClick={() => onViewDetails(runner)}
                                            className="inline-flex items-center px-3 py-1.5 border border-blue-300 rounded-lg text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200"
                                        >
                                            View Details
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}

                        {runners.length === 0 && (
                            <tr>
                                <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                                    <div className="flex flex-col items-center gap-2">
                                        <svg className="h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9 10a1 1 0 11-2 0 1 1 0 012 0zm8 0a1 1 0 11-2 0 1 1 0 012 0z" />
                                        </svg>
                                        <p className="text-lg font-medium">No runners found</p>
                                        <p className="text-sm">Try adjusting your filters or search term</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
