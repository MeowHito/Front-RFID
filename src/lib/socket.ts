import { io, Socket } from 'socket.io-client';
import { Runner } from '@/types';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

class SocketService {
    private socket: Socket | null = null;
    private eventId: string | null = null;

    connect() {
        if (this.socket?.connected) return;

        this.socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
        });

        this.socket.on('connect', () => {
            console.log('WebSocket connected');
            if (this.eventId) {
                this.joinEvent(this.eventId);
            }
        });

        this.socket.on('disconnect', () => {
            console.log('WebSocket disconnected');
        });
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    joinEvent(eventId: string) {
        this.eventId = eventId;
        if (this.socket?.connected) {
            this.socket.emit('joinEvent', eventId);
        }
    }

    leaveEvent(eventId: string) {
        if (this.socket?.connected) {
            this.socket.emit('leaveEvent', eventId);
        }
        this.eventId = null;
    }

    onRunnerUpdate(callback: (runner: Runner) => void) {
        this.socket?.on('runnerUpdate', callback);
        return () => {
            this.socket?.off('runnerUpdate', callback);
        };
    }

    onEventStatus(callback: (data: { eventId: string; status: string }) => void) {
        this.socket?.on('eventStatus', callback);
        return () => {
            this.socket?.off('eventStatus', callback);
        };
    }
}

export const socketService = new SocketService();
