export interface Event {
    _id: string;
    name: string;
    description?: string;
    date: string;
    categories: string[];
    status: 'upcoming' | 'live' | 'finished';
    location?: string;
    bannerImage?: string;
    checkpoints: string[];
    startTime?: string;
    shareToken?: string;
}

export interface Runner {
    _id: string;
    eventId: string;
    bib: string;
    firstName: string;
    lastName: string;
    firstNameTh?: string;
    lastNameTh?: string;
    gender: 'M' | 'F';
    ageGroup?: string;
    age?: number;
    box?: string;
    team?: string;
    category: string;
    status: 'not_started' | 'in_progress' | 'finished' | 'dnf' | 'dns';
    rfidTag?: string;
    checkInTime?: string;
    startTime?: string;
    finishTime?: string;
    netTime?: number;
    elapsedTime?: number;
    overallRank: number;
    genderRank: number;
    ageGroupRank: number;
    latestCheckpoint?: string;
}

export interface TimingRecord {
    _id: string;
    eventId: string;
    runnerId: string;
    bib: string;
    checkpoint: string;
    scanTime: string;
    rfidTag?: string;
    order: number;
    note?: string;
    splitTime?: number;
    elapsedTime?: number;
}

export interface SharedResultsResponse {
    event: Event;
    runners: Runner[];
    totalRunners: number;
}

export interface RunnerDetailsResponse {
    runner: Runner;
    timingRecords: TimingRecord[];
}

export interface FilterOptions {
    category?: string;
    gender?: string;
    ageGroup?: string;
    box?: string;
    status?: string;
    search?: string;
    checkpoint?: string;
}
