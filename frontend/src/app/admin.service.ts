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

@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(private readonly http: HttpClient) {}

  listUsers(): Promise<ManagedUser[]> {
    return firstValueFrom(this.http.get<ManagedUser[]>('/api/admin/users'));
  }

  createUser(input: Pick<ManagedUser, 'displayName' | 'email' | 'role'> & { password: string }): Promise<ManagedUser> {
    return firstValueFrom(this.http.post<ManagedUser>('/api/admin/users', input));
  }

  setUserEnabled(id: string, enabled: boolean): Promise<ManagedUser> {
    return firstValueFrom(this.http.patch<ManagedUser>(
      `/api/admin/users/${encodeURIComponent(id)}/enabled`,
      { enabled }
    ));
  }
}
