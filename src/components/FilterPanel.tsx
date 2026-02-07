'use client';

import { FilterOptions, Event } from '@/types';
import { FunnelIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

interface FilterPanelProps {
    filters: FilterOptions;
    onChange: (filters: FilterOptions) => void;
    event: Event;
}

export default function FilterPanel({ filters, onChange, event }: FilterPanelProps) {
    const [isOpen, setIsOpen] = useState(false);

    const statusOptions = [
        { value: '', label: 'All Status' },
        { value: 'finished', label: 'Finished' },
        { value: 'in_progress', label: 'In Progress' },
        { value: 'dnf', label: 'DNF' },
        { value: 'dns', label: 'DNS' },
        { value: 'not_started', label: 'Not Started' },
    ];

    const genderOptions = [
        { value: '', label: 'All Gender' },
        { value: 'M', label: 'Male' },
        { value: 'F', label: 'Female' },
    ];

    const handleFilterChange = (key: keyof FilterOptions, value: string) => {
        onChange({ ...filters, [key]: value || undefined });
    };

    const SelectFilter = ({
        label,
        value,
        options,
        filterKey
    }: {
        label: string;
        value: string | undefined;
        options: { value: string; label: string }[];
        filterKey: keyof FilterOptions;
    }) => (
        <div className="relative">
            <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
            <div className="relative">
                <select
                    value={value || ''}
                    onChange={(e) => handleFilterChange(filterKey, e.target.value)}
                    className="block w-full appearance-none bg-white border border-gray-200 rounded-lg py-2 pl-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer hover:border-gray-300 transition-colors"
                >
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <ChevronDownIcon className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
        </div>
    );

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-4 py-3 w-full text-left hover:bg-gray-50 rounded-xl transition-colors"
            >
                <FunnelIcon className="h-5 w-5 text-gray-500" />
                <span className="font-medium text-gray-700">Filters</span>
                <ChevronDownIcon className={`h-4 w-4 text-gray-400 ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="px-4 pb-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 border-t border-gray-100 pt-4">
                    <SelectFilter
                        label="Event Type"
                        value={filters.category}
                        options={[
                            { value: '', label: 'All Categories' },
                            ...event.categories.map(c => ({ value: c, label: c })),
                        ]}
                        filterKey="category"
                    />

                    <SelectFilter
                        label="Status"
                        value={filters.status}
                        options={statusOptions}
                        filterKey="status"
                    />

                    <SelectFilter
                        label="Gender"
                        value={filters.gender}
                        options={genderOptions}
                        filterKey="gender"
                    />

                    <SelectFilter
                        label="Age Group"
                        value={filters.ageGroup}
                        options={[
                            { value: '', label: 'All Ages' },
                            { value: '18-29', label: '18-29' },
                            { value: '30-39', label: '30-39' },
                            { value: '40-49', label: '40-49' },
                            { value: '50-59', label: '50-59' },
                            { value: '60+', label: '60+' },
                        ]}
                        filterKey="ageGroup"
                    />

                    <SelectFilter
                        label="Checkpoint"
                        value={filters.checkpoint}
                        options={[
                            { value: '', label: 'All Checkpoints' },
                            ...event.checkpoints.map(c => ({ value: c, label: c })),
                        ]}
                        filterKey="checkpoint"
                    />
                </div>
            )}
        </div>
    );
}
