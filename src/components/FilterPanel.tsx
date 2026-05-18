'use client';

import { Event, FilterOptions } from '@/types';

interface FilterPanelProps {
    filters: FilterOptions;
    onChange: (filters: FilterOptions) => void;
    event: Event;
}

const GENDER_OPTIONS = [
    { value: '', label: 'All Genders' },
    { value: 'M', label: 'Male' },
    { value: 'F', label: 'Female' },
];

const STATUS_OPTIONS = [
    { value: '', label: 'All Status' },
    { value: 'not_started', label: 'Not Started' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'finished', label: 'Finished' },
    { value: 'dnf', label: 'DNF' },
    { value: 'dns', label: 'DNS' },
];

export default function FilterPanel({ filters, onChange, event }: FilterPanelProps) {
    const update = <K extends keyof FilterOptions>(key: K, value: FilterOptions[K]) => {
        onChange({ ...filters, [key]: value || undefined });
    };

    const hasActiveFilters = Boolean(
        filters.category || filters.gender || filters.ageGroup || filters.status || filters.checkpoint,
    );

    const selectClass =
        'px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition min-w-[140px]';

    return (
        <div className="flex flex-wrap items-center gap-2">
            <select
                value={filters.category || ''}
                onChange={(e) => update('category', e.target.value)}
                className={selectClass}
            >
                <option value="">All Categories</option>
                {event.categories?.map((cat) => (
                    <option key={cat} value={cat}>
                        {cat}
                    </option>
                ))}
            </select>

            <select
                value={filters.gender || ''}
                onChange={(e) => update('gender', e.target.value)}
                className={selectClass}
            >
                {GENDER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>

            <select
                value={filters.status || ''}
                onChange={(e) => update('status', e.target.value)}
                className={selectClass}
            >
                {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>

            {event.checkpoints?.length > 0 && (
                <select
                    value={filters.checkpoint || ''}
                    onChange={(e) => update('checkpoint', e.target.value)}
                    className={selectClass}
                >
                    <option value="">All Checkpoints</option>
                    {event.checkpoints.map((cp) => (
                        <option key={cp} value={cp}>
                            {cp}
                        </option>
                    ))}
                </select>
            )}

            <input
                type="text"
                placeholder="Age group (e.g. M30-39)"
                value={filters.ageGroup || ''}
                onChange={(e) => update('ageGroup', e.target.value)}
                className={`${selectClass} w-44`}
            />

            {hasActiveFilters && (
                <button
                    onClick={() => onChange({})}
                    className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition"
                >
                    Clear filters
                </button>
            )}
        </div>
    );
}
