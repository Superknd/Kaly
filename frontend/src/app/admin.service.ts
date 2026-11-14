import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface ManagedUser {
  id: string;
  displayName: string;
  email: string;
  role: 'USER' | 'ADMIN';
  enabled: boolean;
  createdAt: string;
}

export interface AdminUserActivity {
  userId: string;
  documents: number;
  storageBytes: number;
  folders: number;
  notifications: number;
}

interface DailyCount {
  date: string;
  count: number;
}

interface DailyDocumentCount extends DailyCount {
  storageBytes: number;
}

export interface AdminStats {
  users: {
    total: number;
    active: number;
    disabled: number;
    admins: number;
    members: number;
  };
  documents: {
    total: number;
    storageBytes: number;
  };
  folders: {
    total: number;
  };
  notifications: {
    total: number;
    unread: number;
  };
  trends: {
    usersCreated: DailyCount[];
    documentsCreated: DailyDocumentCount[];
  };
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(private readonly http: HttpClient) {}

  getStats(): Promise<AdminStats> {
    return firstValueFrom(this.http.get<AdminStats>('/api/admin/stats'));
  }

  listUsers(): Promise<ManagedUser[]> {
    return firstValueFrom(this.http.get<ManagedUser[]>('/api/admin/users'));
  }

  getUserActivity(id: string): Promise<AdminUserActivity> {
    return firstValueFrom(this.http.get<AdminUserActivity>(
      `/api/admin/users/${encodeURIComponent(id)}/activity`
    ));
  }

  createUser(input: Pick<ManagedUser, 'displayName' | 'email' | 'role'> & { password: string }): Promise<ManagedUser> {
    return firstValueFrom(this.http.post<ManagedUser>('/api/admin/users', input));
  }

  setUserRole(id: string, role: ManagedUser['role']): Promise<ManagedUser> {
    return firstValueFrom(this.http.patch<ManagedUser>(
      `/api/admin/users/${encodeURIComponent(id)}/role`,
      { role }
    ));
  }

  sendPasswordReset(id: string): Promise<{ message: string }> {
    return firstValueFrom(this.http.post<{ message: string }>(
      `/api/admin/users/${encodeURIComponent(id)}/password-reset`,
      {}
    ));
  }

  setUserEnabled(id: string, enabled: boolean): Promise<ManagedUser> {
    return firstValueFrom(this.http.patch<ManagedUser>(
      `/api/admin/users/${encodeURIComponent(id)}/enabled`,
      { enabled }
    ));
  }
}
