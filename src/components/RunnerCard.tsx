'use client';

import { useTheme } from '@/lib/theme-context';
import { useLanguage } from '@/lib/language-context';

export interface Runner {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    firstNameTh?: string;
    lastNameTh?: string;
    gender: string;
    ageGroup?: string;
    category?: string;
    status: string;
    overallRank?: number;
    genderRank?: number;
    categoryRank?: number;
    latestCheckpoint?: string;
    netTime?: number;
    nationality?: string;
}

interface RunnerCardProps {
    runner: Runner;
    showRanks?: boolean;
    onClick?: () => void;
}

// Format time from milliseconds
function formatTime(ms: number | undefined): string {
    if (!ms) return '--:--:--';
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Get status color
function getStatusColor(status: string): { bg: string; text: string } {
    switch (status) {
        case 'finished':
            return { bg: 'bg-green-500/20', text: 'text-green-400' };
        case 'in_progress':
            return { bg: 'bg-blue-500/20', text: 'text-blue-400' };
        case 'dns':
            return { bg: 'bg-gray-500/20', text: 'text-gray-400' };
        case 'dnf':
            return { bg: 'bg-red-500/20', text: 'text-red-400' };
        case 'registered':
            return { bg: 'bg-yellow-500/20', text: 'text-yellow-400' };
        default:
            return { bg: 'bg-gray-500/20', text: 'text-gray-400' };
    }
}

// Get status label
function getStatusLabel(status: string, lang: string): string {
    const labels: Record<string, { th: string; en: string }> = {
        'finished': { th: 'เข้าเส้นชัย', en: 'Finished' },
        'in_progress': { th: 'กำลังแข่ง', en: 'Racing' },
        'dns': { th: 'ไม่ออกสตาร์ท', en: 'DNS' },
        'dnf': { th: 'ออกจากการแข่ง', en: 'DNF' },
        'registered': { th: 'ลงทะเบียน', en: 'Registered' },
        'not_started': { th: 'รอเริ่ม', en: 'Not Started' },
    };
    return labels[status]?.[lang === 'th' ? 'th' : 'en'] || status;
}

// Mobile-friendly Runner Card Component
export function RunnerCard({ runner, showRanks = true, onClick }: RunnerCardProps) {
    const { theme } = useTheme();
    const { language } = useLanguage();
    const statusColors = getStatusColor(runner.status);

    const displayName = language === 'th' && runner.firstNameTh
        ? `${runner.firstNameTh} ${runner.lastNameTh || ''}`
        : `${runner.firstName} ${runner.lastName}`;

    return (
        <div
            onClick={onClick}
            className={`
                rounded-xl p-4 transition-all duration-200
                ${onClick ? 'cursor-pointer hover:scale-[1.02]' : ''}
                ${theme === 'dark'
                    ? 'bg-gray-800/50 border border-gray-700/50 hover:border-gray-600'
                    : 'bg-white border border-gray-200 shadow-sm hover:shadow-md'
                }
            `}
        >
            {/* Top: BIB + Name + Status */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    {/* BIB Badge */}
                    <div className={`
                        text-lg font-bold px-3 py-1 rounded-lg min-w-[60px] text-center
                        ${theme === 'dark' ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'}
                    `}>
                        {runner.bib}
                    </div>

                    {/* Name & Category */}
                    <div>
                        <h3 className={`font-semibold text-base ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                            {displayName}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                            {runner.category && (
                                <span className={`text-xs px-2 py-0.5 rounded ${theme === 'dark' ? 'bg-purple-600/30 text-purple-300' : 'bg-purple-100 text-purple-700'}`}>
                                    {runner.category}
                                </span>
                            )}
                            <span className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                {runner.gender === 'M' ? '♂' : '♀'} {runner.ageGroup || ''}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Status Badge */}
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors.bg} ${statusColors.text}`}>
                    {getStatusLabel(runner.status, language)}
                </span>
            </div>

            {/* Bottom: Time & Ranks */}
            <div className={`mt-3 pt-3 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'} flex justify-between items-center`}>
                {/* Time */}
                <div>
                    <span className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Time</span>
                    <div className={`font-mono font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        {formatTime(runner.netTime)}
                    </div>
                </div>

                {/* Checkpoint */}
                {runner.latestCheckpoint && (
                    <div className="text-center">
                        <span className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Checkpoint</span>
                        <div className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                            {runner.latestCheckpoint}
                        </div>
                    </div>
                )}

                {/* Ranks */}
                {showRanks && (
                    <div className="flex gap-3 text-center">
                        {runner.overallRank && runner.overallRank > 0 && (
                            <div>
                                <span className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Rank</span>
                                <div className={`font-bold ${theme === 'dark' ? 'text-yellow-400' : 'text-yellow-600'}`}>
                                    #{runner.overallRank}
                                </div>
                            </div>
                        )}
                        {runner.genderRank && runner.genderRank > 0 && (
                            <div>
                                <span className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Gen</span>
                                <div className={`font-bold ${runner.gender === 'M' ? 'text-blue-400' : 'text-pink-400'}`}>
                                    #{runner.genderRank}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// Desktop Table Row Component
export function RunnerTableRow({ runner, showRanks = true, onClick }: RunnerCardProps) {
    const { theme } = useTheme();
    const { language } = useLanguage();
    const statusColors = getStatusColor(runner.status);

    const displayName = language === 'th' && runner.firstNameTh
        ? `${runner.firstNameTh} ${runner.lastNameTh || ''}`
        : `${runner.firstName} ${runner.lastName}`;

    return (
        <tr
            onClick={onClick}
            className={`
                transition-colors
                ${onClick ? 'cursor-pointer' : ''}
                ${theme === 'dark'
                    ? 'hover:bg-gray-700/50 border-b border-gray-700/50'
                    : 'hover:bg-gray-50 border-b border-gray-100'
                }
            `}
        >
            {/* Rank */}
            <td className="py-3 px-4 text-center">
                <span className={`font-bold ${theme === 'dark' ? 'text-yellow-400' : 'text-yellow-600'}`}>
                    {runner.overallRank || '-'}
                </span>
            </td>

            {/* BIB */}
            <td className="py-3 px-4">
                <span className={`font-bold px-2 py-1 rounded ${theme === 'dark' ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'}`}>
                    {runner.bib}
                </span>
            </td>

            {/* Name */}
            <td className="py-3 px-4">
                <div className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {displayName}
                </div>
                <div className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    {runner.gender === 'M' ? '♂' : '♀'} {runner.ageGroup}
                </div>
            </td>

            {/* Category */}
            <td className="py-3 px-4">
                <span className={`text-xs px-2 py-1 rounded ${theme === 'dark' ? 'bg-purple-600/30 text-purple-300' : 'bg-purple-100 text-purple-700'}`}>
                    {runner.category || '-'}
                </span>
            </td>

            {/* Status */}
            <td className="py-3 px-4">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors.bg} ${statusColors.text}`}>
                    {getStatusLabel(runner.status, language)}
                </span>
            </td>

            {/* Time */}
            <td className="py-3 px-4">
                <span className={`font-mono ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {formatTime(runner.netTime)}
                </span>
            </td>

            {/* Checkpoint */}
            <td className="py-3 px-4">
                <span className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                    {runner.latestCheckpoint || '-'}
                </span>
            </td>

            {/* Gender Rank */}
            {showRanks && (
                <td className="py-3 px-4 text-center">
                    <span className={`font-bold ${runner.gender === 'M' ? 'text-blue-400' : 'text-pink-400'}`}>
                        {runner.genderRank || '-'}
                    </span>
                </td>
            )}
        </tr>
    );
}

// Main Runners List Component (Responsive)
interface RunnersListProps {
    runners: Runner[];
    showRanks?: boolean;
    onRunnerClick?: (runner: Runner) => void;
    loading?: boolean;
    emptyMessage?: string;
}

export function RunnersList({ runners, showRanks = true, onRunnerClick, loading, emptyMessage }: RunnersListProps) {
    const { theme } = useTheme();
    const { language } = useLanguage();

    if (loading) {
        return (
            <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                <span className={`ml-3 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                </span>
            </div>
        );
    }

    if (runners.length === 0) {
        return (
            <div className={`text-center py-12 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                {emptyMessage || (language === 'th' ? 'ไม่พบนักวิ่ง' : 'No runners found')}
            </div>
        );
    }

    return (
        <>
            {/* Mobile: Card Layout */}
            <div className="md:hidden space-y-3">
                {runners.map(runner => (
                    <RunnerCard
                        key={runner._id}
                        runner={runner}
                        showRanks={showRanks}
                        onClick={onRunnerClick ? () => onRunnerClick(runner) : undefined}
                    />
                ))}
            </div>

            {/* Desktop: Table Layout */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className={`text-left text-sm ${theme === 'dark' ? 'text-gray-400 border-b border-gray-700' : 'text-gray-500 border-b border-gray-200'}`}>
                            <th className="py-3 px-4 font-medium">#</th>
                            <th className="py-3 px-4 font-medium">BIB</th>
                            <th className="py-3 px-4 font-medium">{language === 'th' ? 'ชื่อ' : 'Name'}</th>
                            <th className="py-3 px-4 font-medium">{language === 'th' ? 'ประเภท' : 'Category'}</th>
                            <th className="py-3 px-4 font-medium">{language === 'th' ? 'สถานะ' : 'Status'}</th>
                            <th className="py-3 px-4 font-medium">{language === 'th' ? 'เวลา' : 'Time'}</th>
                            <th className="py-3 px-4 font-medium">{language === 'th' ? 'จุดล่าสุด' : 'Checkpoint'}</th>
                            {showRanks && <th className="py-3 px-4 font-medium text-center">{language === 'th' ? 'อันดับเพศ' : 'Gen Rank'}</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {runners.map(runner => (
                            <RunnerTableRow
                                key={runner._id}
                                runner={runner}
                                showRanks={showRanks}
                                onClick={onRunnerClick ? () => onRunnerClick(runner) : undefined}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

export default RunnersList;
