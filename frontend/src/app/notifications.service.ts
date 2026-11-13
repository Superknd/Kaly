import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface UserNotification {
  id: string;
  title: string;
  message: string;
  kind: string;
  createdAt: string;
  readAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<UserNotification[]> {
    return firstValueFrom(this.http.get<UserNotification[]>('/api/notifications'));
  }

  async unreadCount(): Promise<number> {
    const response = await firstValueFrom(this.http.get<{ count: number }>('/api/notifications/unread-count'));
    return response.count;
  }

  markRead(id: string): Promise<void> {
    return firstValueFrom(this.http.patch<void>(`/api/notifications/${encodeURIComponent(id)}/read`, {}));
  }

  markAllRead(): Promise<void> {
    return firstValueFrom(this.http.patch<void>('/api/notifications/read-all', {}));
  }
}
