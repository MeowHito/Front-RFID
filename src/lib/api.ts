import axios from 'axios';
import { SharedResultsResponse, RunnerDetailsResponse, FilterOptions } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const getSharedResults = async (
    token: string,
    filters: FilterOptions = {}
): Promise<SharedResultsResponse> => {
    const params = new URLSearchParams({ token });

    Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
    });

    const response = await api.get(`/shared/results?${params.toString()}`);
    return response.data;
};

export const getResultsByEventId = async (
    eventId: string,
    filters: FilterOptions = {}
): Promise<SharedResultsResponse> => {
    const params = new URLSearchParams({ eventId });

    Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
    });

    const response = await api.get(`/shared/results?${params.toString()}`);
    return response.data;
};

export const getRunnerDetails = async (
    token: string,
    runnerId: string
): Promise<RunnerDetailsResponse> => {
    const response = await api.get('/shared/runner', {
        params: { token, runnerId },
    });
    return response.data;
};

export default api;
