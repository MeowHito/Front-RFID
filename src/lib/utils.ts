export function formatTime(ms: number | undefined): string {
    if (!ms) return '--:--:--';

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function formatDateTime(dateString: string | undefined): string {
    if (!dateString) return '--';

    const date = new Date(dateString);
    return date.toLocaleString('th-TH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

export function formatDate(dateString: string | undefined): string {
    if (!dateString) return '--';

    const date = new Date(dateString);
    return date.toLocaleDateString('th-TH', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    });
}

export function getStatusColor(status: string): string {
    switch (status) {
        case 'finished':
            return 'bg-green-500';
        case 'in_progress':
            return 'bg-blue-500';
        case 'dnf':
            return 'bg-pink-500';
        case 'dns':
            return 'bg-orange-500';
        default:
            return 'bg-gray-400';
    }
}

export function getStatusText(status: string): string {
    switch (status) {
        case 'finished':
            return 'Finished';
        case 'in_progress':
            return 'In Progress';
        case 'dnf':
            return 'DNF';
        case 'dns':
            return 'DNS';
        case 'not_started':
            return 'Not Started';
        default:
            return status;
    }
}

export function getGenderText(gender: string): string {
    return gender === 'M' ? 'ชาย Male (M)' : 'หญิง Female (F)';
}

export function getRankIcon(rank: number): string | null {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return null;
}
