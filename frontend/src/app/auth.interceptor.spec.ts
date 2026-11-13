import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from './auth.service';
import { authExpiredInterceptor } from './auth.interceptor';
import { HttpClient } from '@angular/common/http';

describe('authExpiredInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let expireSession: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    expireSession = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authExpiredInterceptor])),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { token: signal('test-access-token'), expireSession }
        }
      ]
    });
    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('adds the bearer token to authenticated API calls', () => {
    http.get('/api/notifications').subscribe();

    const request = httpTesting.expectOne('/api/notifications');
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-access-token');
    request.flush([]);
  });

  it('does not add the bearer token to public login requests', () => {
    http.post('/api/auth/login', {}).subscribe();

    const request = httpTesting.expectOne('/api/auth/login');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });
});
