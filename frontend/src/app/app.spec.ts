import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
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

  it('should show a confirmation password field when creating an account', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.componentInstance.openAuth('register');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#auth-confirm-password')).toBeTruthy();
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
