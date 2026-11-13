import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface AuthUser {
  id: string;
  displayName: string;
  email: string;
  role: 'USER' | 'ADMIN';
}

interface AuthResponse {
  token: string;
  expiresInSeconds: number;
  user: AuthUser;
}

interface AuthMessageResponse {
  message: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenKey = 'kaly.access-token';
  private readonly userKey = 'kaly.user';
  private readonly savedUser = this.readSavedUser();
  readonly token = signal(this.readSavedToken());
  readonly user = signal<AuthUser | null>(this.savedUser);
  readonly sessionExpired = signal(0);
  readonly isAuthenticated = computed(() => this.token() !== null && this.user() !== null);
  readonly apiUrl = '';

  constructor(private readonly http: HttpClient) {}

  async login(email: string, password: string): Promise<void> {
    const response = await firstValueFrom(this.http.post<AuthResponse>(`${this.apiUrl}/api/auth/login`, { email, password }));
    this.storeSession(response);
  }

  async register(displayName: string, email: string, password: string): Promise<void> {
    const response = await firstValueFrom(this.http.post<AuthResponse>(`${this.apiUrl}/api/auth/register`, {
      displayName,
      email,
      password
    }));
    this.storeSession(response);
  }

  async requestPasswordReset(email: string): Promise<void> {
    await firstValueFrom(this.http.post<AuthMessageResponse>(`${this.apiUrl}/api/auth/password-reset`, { email }));
  }

  async confirmPasswordReset(token: string, password: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.apiUrl}/api/auth/password-reset/confirm`, { token, password }));
  }

  async refreshUser(): Promise<void> {
    const user = await firstValueFrom(this.http.get<AuthUser>(`${this.apiUrl}/api/auth/me`));
    sessionStorage.setItem(this.userKey, JSON.stringify(user));
    this.user.set(user);
  }

  logout(): void {
    sessionStorage.removeItem(this.tokenKey);
    sessionStorage.removeItem(this.userKey);
    this.token.set(null);
    this.user.set(null);
  }

  expireSession(): void {
    this.logout();
    this.sessionExpired.update(count => count + 1);
  }

  private storeSession(response: AuthResponse): void {
    sessionStorage.setItem(this.tokenKey, response.token);
    sessionStorage.setItem(this.userKey, JSON.stringify(response.user));
    this.token.set(response.token);
    this.user.set(response.user);
    this.sessionExpired.set(0);
  }

  private readSavedToken(): string | null {
    try {
      return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(this.tokenKey);
    } catch {
      return null;
    }
  }

  private readSavedUser(): AuthUser | null {
    try {
      if (typeof sessionStorage === 'undefined') return null;
      const saved = sessionStorage.getItem(this.userKey);
      if (!saved) return null;
      const user = JSON.parse(saved) as AuthUser;
      return user.id && user.email && user.displayName && user.role ? user : null;
    } catch {
      return null;
    }
  }
}
