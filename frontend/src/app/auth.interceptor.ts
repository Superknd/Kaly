import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authExpiredInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const isPublicAuthRequest = request.url.startsWith('/api/auth/') && request.url !== '/api/auth/me';
  const token = auth.token();
  const authenticatedRequest = request.url.startsWith('/api/') &&
    !isPublicAuthRequest &&
    token &&
    !request.headers.has('Authorization')
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authenticatedRequest).pipe(catchError(error => {
    if (
      error instanceof HttpErrorResponse &&
      error.status === 401 &&
      authenticatedRequest.url.startsWith('/api/') &&
      (!authenticatedRequest.url.startsWith('/api/auth/') || authenticatedRequest.url === '/api/auth/me')
    ) {
      auth.expireSession();
    }
    return throwError(() => error);
  }));
};
