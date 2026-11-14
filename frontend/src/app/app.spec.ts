import { TestBed } from '@angular/core/testing';
import { afterEach } from 'vitest';
import { vi } from 'vitest';
import { AdminService, AdminStats, ManagedUser } from './admin.service';
import { AuthService } from './auth.service';
import { App } from './app';

describe('App', () => {
  afterEach(() => {
    const url = new URL(location.href);
    url.searchParams.delete('auth');
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the Kaly workspace', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand')?.textContent).toContain('Kaly');
    expect(compiled.querySelector('h1')?.textContent).toContain('Bonjour');
  });

  it('should open the support page from the community navigation', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    const supportButton = Array.from(buttons)
      .find(button => button.textContent?.includes('Soutenir le projet'));
    if (!supportButton) throw new Error('Support navigation button was not rendered.');
    supportButton.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Soutenir Kaly');
    expect(fixture.nativeElement.textContent).toContain('Kaly restera gratuite');
  });

  it('should reveal and hide the password on the login form', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.componentInstance.openAuth('login');
    fixture.detectChanges();

    const password = fixture.nativeElement.querySelector('#auth-password') as HTMLInputElement;
    const toggle = fixture.nativeElement.querySelector('[aria-label="Afficher le mot de passe"]') as HTMLButtonElement;
    expect(password.type).toBe('password');
    toggle.click();
    fixture.detectChanges();
    expect(password.type).toBe('text');

    (fixture.nativeElement.querySelector('[aria-label="Masquer le mot de passe"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(password.type).toBe('password');
  });

  it('should keep the forgot-password form in auth mode after requesting a reset link', async () => {
    const auth = TestBed.inject(AuthService);
    const requestReset = vi.spyOn(auth, 'requestPasswordReset').mockResolvedValue();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const app = fixture.componentInstance;
    app.openAuth('forgot');
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('.auth-form') as HTMLFormElement;
    (form.querySelector('#auth-email') as HTMLInputElement).value = 'user@example.test';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(requestReset).toHaveBeenCalledWith('user@example.test');
    expect(app.activeView()).toBe('auth');
    expect(app.authMode()).toBe('login');
    expect(fixture.nativeElement.querySelector('.notice')?.textContent)
      .toContain('un lien de réinitialisation sera envoyé');
    expect(fixture.nativeElement.textContent).not.toContain('Connexion réussie');
    fixture.destroy();
  });

  it('should keep the auth view after confirming a password reset', async () => {
    const auth = TestBed.inject(AuthService);
    const confirmReset = vi.spyOn(auth, 'confirmPasswordReset').mockResolvedValue();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const app = fixture.componentInstance;
    app.resetToken.set('test-reset-token');
    app.openAuth('reset');
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('.auth-form') as HTMLFormElement;
    (form.querySelector('#auth-password') as HTMLInputElement).value = 'a-new-valid-password';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(confirmReset).toHaveBeenCalledWith('test-reset-token', 'a-new-valid-password');
    expect(app.activeView()).toBe('auth');
    expect(app.authMode()).toBe('login');
    expect(fixture.nativeElement.querySelector('.notice')?.textContent)
      .toContain('Votre mot de passe a été modifié');
    expect(fixture.nativeElement.textContent).not.toContain('Connexion réussie');
    fixture.destroy();
  });

  it('should show a confirmation password field when creating an account', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.componentInstance.openAuth('register');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#auth-confirm-password')).toBeTruthy();
  });

  it('should show a direct registration link in the header', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('.auth-register-link') as HTMLAnchorElement | null;
    expect(link?.getAttribute('href')).toBe('?auth=register');

    link?.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.auth-page h1')?.textContent).toContain('Créez votre espace');
    expect(new URLSearchParams(location.search).get('auth')).toBe('register');

    fixture.componentInstance.navigate('home');
    expect(new URLSearchParams(location.search).has('auth')).toBe(false);
    fixture.destroy();
  });

  it('should open the registration form from a direct registration URL', async () => {
    history.replaceState(history.state, '', `${location.pathname}?auth=register`);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.auth-page h1')?.textContent).toContain('Créez votre espace');
    expect(fixture.nativeElement.querySelector('#auth-confirm-password')).toBeTruthy();

    fixture.destroy();
    history.replaceState(history.state, '', location.pathname);
  });

  it('should filter admin accounts by search text, status, and role', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const app = fixture.componentInstance;
    app.adminUsers.set([
      { id: '1', displayName: 'Active Member', email: 'member@example.test', role: 'USER', enabled: true, createdAt: '2026-01-01T00:00:00Z' },
      { id: '2', displayName: 'Disabled Admin', email: 'admin@example.test', role: 'ADMIN', enabled: false, createdAt: '2026-01-02T00:00:00Z' },
      { id: '3', displayName: 'Active Admin', email: 'active-admin@example.test', role: 'ADMIN', enabled: true, createdAt: '2026-01-03T00:00:00Z' },
    ]);

    app.adminSearch.set('admin');
    app.adminStatusFilter.set('active');
    app.adminRoleFilter.set('ADMIN');

    expect(app.filteredAdminUsers().map(user => user.id)).toEqual(['3']);
    fixture.destroy();
  });

  it('should render admin statistics, account filters, and private usage summaries', async () => {
    const adminService = TestBed.inject(AdminService);
    const users: ManagedUser[] = [
      { id: 'admin-id', displayName: 'Kaly Admin', email: 'admin@example.test', role: 'ADMIN', enabled: true, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'member-id', displayName: 'Kaly Member', email: 'member@example.test', role: 'USER', enabled: true, createdAt: '2026-01-02T00:00:00Z' },
    ];
    const stats: AdminStats = {
      users: { total: 2, active: 2, disabled: 0, admins: 1, members: 1 },
      documents: { total: 3, storageBytes: 4096 },
      folders: { total: 1 },
      notifications: { total: 2, unread: 1 },
      trends: {
        usersCreated: Array.from({ length: 30 }, (_, index) => ({ date: `2026-01-${String(index + 1).padStart(2, '0')}`, count: 0 })),
        documentsCreated: Array.from({ length: 30 }, (_, index) => ({ date: `2026-01-${String(index + 1).padStart(2, '0')}`, count: 0, storageBytes: 0 })),
      },
    };
    vi.spyOn(adminService, 'listUsers').mockResolvedValue(users);
    vi.spyOn(adminService, 'getStats').mockResolvedValue(stats);
    vi.spyOn(adminService, 'getUserActivity').mockResolvedValue({
      userId: 'member-id',
      documents: 3,
      storageBytes: 4096,
      folders: 1,
      notifications: 2,
    });
    const auth = TestBed.inject(AuthService);
    auth.user.set({ id: 'admin-id', displayName: 'Kaly Admin', email: 'admin@example.test', role: 'ADMIN' });
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance.navigate('admin');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Documents stockés');
    expect(fixture.nativeElement.textContent).toContain('Nouveaux comptes');
    expect(fixture.nativeElement.querySelector('[aria-label="Rechercher un compte"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[aria-label="Filtrer par statut"]')).toBeTruthy();

    const usageButton = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent?.includes('Voir l’usage'));
    usageButton?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('stockage');
    expect(fixture.nativeElement.textContent).not.toContain('private-document.pdf');

    fixture.destroy();
    auth.user.set(null);
  });

  it('should reject account creation when password confirmations differ', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.componentInstance.openAuth('register');
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('.auth-form') as HTMLFormElement;
    (form.querySelector('#auth-name') as HTMLInputElement).value = 'Test User';
    (form.querySelector('#auth-email') as HTMLInputElement).value = 'test@example.test';
    (form.querySelector('#auth-password') as HTMLInputElement).value = 'first-password';
    (form.querySelector('#auth-confirm-password') as HTMLInputElement).value = 'other-password';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.notice')?.textContent).toContain('ne correspondent pas');
  });

  it('should render two feature marquees on the home page', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('app-feature-marquee .feature-marquee').length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Correction de perspective');
    expect(fixture.nativeElement.textContent).toContain('Extraction de pages');
  });

  it('should use the in-app dialog instead of a native prompt', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();
    const app = fixture.componentInstance;

    const operation = app.createFolder();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeTruthy();

    app.cancelDialog();
    await operation;
  });
});
