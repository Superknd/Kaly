import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  LucideArrowLeft, LucideArrowRight, LucideArrowUpRight, LucideCamera, LucideChevronRight,
  LucideCombine, LucideDownload, LucideFileImage, LucideFiles, LucideFileText, LucideFolder,
  LucideHouse, LucideImage, LucideLayoutDashboard, LucidePanelLeftClose,
  LucidePlus, LucideScanLine, LucideSearch, LucideShieldCheck, LucideSparkles, LucideTrash2,
  LucideCrop,
  LucideBell, LucideCircleAlert, LucideExternalLink, LucideHeart, LucideLogIn, LucideLogOut,
  LucideEye, LucideEyeOff, LucidePencil, LucideRotateCw, LucideUpload, LucideUserCog, LucideUserPlus, LucideUserRound,
  LucideX
} from '@lucide/angular';
import { DocumentStore, StoredDocument, StoredFolder } from './document-store';
import { PdfPageThumbnail, PdfTools } from './pdf-tools';
import { ScanTools } from './scan-tools';
import { AdminService, ManagedUser } from './admin.service';
import { NotificationsService, UserNotification } from './notifications.service';
import { AuthService } from './auth.service';
import { FeatureMarquee } from './feature-marquee';
import { environment } from '../environments/environment';

type ViewKey = 'home' | 'library' | 'merge' | 'convert' | 'scanner' | 'auth' | 'support' | 'admin';
type DocumentKind = 'pdf' | 'image';
type ScanFilter = 'color' | 'grayscale' | 'bw';
type AuthMode = 'login' | 'register' | 'forgot' | 'reset';
type AppDialog =
  | { kind: 'prompt'; title: string; description: string; label: string; maximumLength: number }
  | { kind: 'confirm'; title: string; description: string; confirmLabel: string };

interface KalyDocument extends StoredDocument {
  previewUrl: string;
}

interface ScanPage {
  id: string;
  blob: Blob;
  url: string;
  source: string;
  rotation: number;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_BATCH_SIZE = 100 * 1024 * 1024;
const MAX_BATCH_FILES = 20;
const ACCEPTED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

@Component({
  selector: 'app-root',
  imports: [
    FeatureMarquee, DatePipe, LucideArrowLeft, LucideArrowRight, LucideArrowUpRight, LucideCamera,
    LucideChevronRight, LucideCombine, LucideDownload, LucideFileImage, LucideFiles,
    LucideFileText, LucideFolder, LucideHouse, LucideImage, LucideLayoutDashboard,
    LucideCircleAlert, LucideExternalLink, LucideHeart, LucidePanelLeftClose, LucidePlus, LucideScanLine, LucideSearch,
    LucideLogIn, LucideLogOut, LucidePencil, LucideRotateCw, LucideShieldCheck,
    LucideSparkles, LucideTrash2, LucideCrop, LucideUpload, LucideUserRound, LucideX,
    LucideBell, LucideEye, LucideEyeOff, LucideUserCog, LucideUserPlus
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnDestroy {
  private readonly store = inject(DocumentStore);
  private readonly pdfTools = inject(PdfTools);
  private readonly scanTools = inject(ScanTools);
  private readonly admin = inject(AdminService);
  private readonly notificationsApi = inject(NotificationsService);
  private readonly auth = inject(AuthService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);
  private cameraStream?: MediaStream;
  private handledExpiration = 0;
  private dialogResolver: ((value: string | boolean | null) => void) | null = null;

  readonly activeView = signal<ViewKey>('home');
  readonly menuOpen = signal(false);
  readonly notificationsOpen = signal(false);
  readonly notifications = signal<UserNotification[]>([]);
  readonly unreadNotificationCount = signal(0);
  readonly sessionReady = signal(false);
  readonly adminUsers = signal<ManagedUser[]>([]);
  readonly adminBusy = signal(false);
  readonly adminUserCount = computed(() => this.adminUsers().length);
  readonly documents = signal<KalyDocument[]>([]);
  readonly folders = signal<StoredFolder[]>([]);
  readonly folderFilter = signal('all');
  readonly selectedDocument = signal<KalyDocument | null>(null);
  readonly searchTerm = signal('');
  readonly libraryFilter = signal<'all' | DocumentKind>('all');
  readonly mergeFiles = signal<File[]>([]);
  readonly mergeName = signal('document-kaly');
  readonly imageFiles = signal<File[]>([]);
  readonly extractFile = signal<File | null>(null);
  readonly pageRange = signal('1');
  readonly advancedPdfFile = signal<File | null>(null);
  readonly ocrFile = signal<File | null>(null);
  readonly ocrText = signal('');
  readonly ocrProgress = signal(0);
  readonly pdfPages = signal<PdfPageThumbnail[]>([]);
  readonly splitRanges = signal('1-1; 2-2');
  readonly authMode = signal<AuthMode>('login');
  readonly passwordVisible = signal(false);
  readonly confirmationPasswordVisible = signal(false);
  readonly resetToken = signal('');
  readonly authBusy = signal(false);
  readonly authUser = this.auth.user;
  readonly isAuthenticated = this.auth.isAuthenticated;
  readonly scanPages = signal<ScanPage[]>([]);
  readonly scanName = signal('scan-kaly');
  readonly scanFilter = signal<ScanFilter>('color');
  readonly autoCrop = signal(true);
  readonly cameraActive = signal(false);
  readonly dragActive = signal(false);
  readonly isBusy = signal(false);
  readonly notice = signal('');
  readonly noticeIsError = signal(false);
  readonly appDialog = signal<AppDialog | null>(null);
  readonly dialogInput = signal('');
  readonly supportUrl = /^https?:\/\//i.test(environment.supportUrl) ? environment.supportUrl : '';
  readonly operationsCount = signal(0);
  readonly pdfCreated = computed(() => this.documents().filter(document => document.createdHere && document.kind === 'pdf').length);
  readonly recentDocuments = computed(() => [...this.documents()].sort((a, b) => b.addedAt - a.addedAt).slice(0, 4));
  readonly filteredDocuments = computed(() => {
    const query = this.searchTerm().trim().toLocaleLowerCase();
    return this.documents().filter(document =>
      (this.libraryFilter() === 'all' || document.kind === this.libraryFilter()) &&
      (this.folderFilter() === 'all' || document.folderId === this.folderFilter()) &&
      (!query || document.name.toLocaleLowerCase().includes(query))
    ).sort((a, b) => b.addedAt - a.addedAt);
  });
  readonly pageTitle = computed(() => ({
    home: 'Vue d’ensemble',
    library: 'Mes documents',
    merge: 'Fusionner des PDF',
    convert: 'Convertir & extraire',
    scanner: 'Scanner un document',
    auth: ({
      login: 'Connexion',
      register: 'Créer un compte',
      forgot: 'Mot de passe oublié',
      reset: 'Nouveau mot de passe'
    })[this.authMode()],
    support: 'Soutenir Kaly',
    admin: 'Administration'
  })[this.activeView()]);
  readonly todayLabel = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).toLocaleUpperCase();
  readonly cameraVideo = viewChild<ElementRef<HTMLVideoElement>>('cameraVideo');

  constructor() {
    const resetToken = new URLSearchParams(location.search).get('resetToken');
    if (resetToken) {
      this.resetToken.set(resetToken);
      this.authMode.set('reset');
      this.activeView.set('auth');
      history.replaceState(null, '', location.pathname);
    }
    effect(() => {
      const expired = this.auth.sessionExpired();
      if (expired <= this.handledExpiration) return;
      this.handledExpiration = expired;
      queueMicrotask(() => {
        this.replaceDocuments([]);
        this.notifications.set([]);
        this.unreadNotificationCount.set(0);
        this.adminUsers.set([]);
        void this.restoreDocuments();
        void this.restoreFolders();
        this.openAuth();
        this.showNotice('Votre session a expiré. Reconnectez-vous pour accéder à vos documents privés.', true);
      });
    });
    effect(() => {
      const user = this.authUser();
      if (!this.sessionReady()) return;
      this.notificationsOpen.set(false);
      if (!user) {
        this.notifications.set([]);
        this.unreadNotificationCount.set(0);
        this.adminUsers.set([]);
        return;
      }
      queueMicrotask(() => {
        void this.refreshNotifications();
        if (user.role === 'ADMIN') void this.refreshAdminUsers();
      });
    });
    void this.initializeWorkspace();
    this.destroyRef.onDestroy(() => {
      this.stopCamera();
      this.revokeDocumentUrls();
      this.scanPages().forEach(page => URL.revokeObjectURL(page.url));
    });
  }

  navigate(view: ViewKey, event?: Event): void {
    event?.preventDefault();
    if (this.activeView() === 'scanner' && view !== 'scanner') this.stopCamera();
    if (view === 'admin' && this.authUser()?.role !== 'ADMIN') {
      this.showNotice('Cette page est réservée aux administrateurs.', true);
      return;
    }
    this.activeView.set(view);
    this.menuOpen.set(false);
    this.notice.set('');
    if (view === 'admin') void this.refreshAdminUsers();
  }

  async onLibraryFiles(event: Event): Promise<void> {
    const files = this.filesFromEvent(event);
    for (const file of files) {
      if (!this.validateFile(file)) continue;
      await this.addDocument(file, file.name, false);
    }
  }

  async onMergeFiles(event: Event): Promise<void> {
    this.addMergeFiles(this.filesFromEvent(event));
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(true);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
    this.addMergeFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  moveMergeFile(index: number, direction: -1 | 1): void {
    const files = [...this.mergeFiles()];
    const target = index + direction;
    if (target < 0 || target >= files.length) return;
    [files[index], files[target]] = [files[target], files[index]];
    this.mergeFiles.set(files);
  }

  removeMergeFile(index: number): void {
    this.mergeFiles.update(files => files.filter((_, fileIndex) => fileIndex !== index));
  }

  isImage(file: File): boolean {
    return file.type.startsWith('image/');
  }

  async mergePdfs(): Promise<void> {
    if (this.mergeFiles().length < 2) return;
    await this.runBusy(async () => {
      const blob = await this.pdfTools.merge(this.mergeFiles());
      await this.saveGeneratedPdf(blob, this.mergeName());
      this.mergeFiles.set([]);
    });
  }

  onConvertImages(event: Event): void {
    const images = this.filesFromEvent(event).filter(file => {
      if (file.type === 'image/jpeg' || file.type === 'image/png') return true;
      this.showNotice(`« ${file.name} » n’est pas une image PNG ou JPEG.`, true);
      return false;
    });
    this.imageFiles.set(this.validateBatch(images));
  }

  onExtractFile(event: Event): void {
    const file = this.filesFromEvent(event)[0] ?? null;
    if (!file) return;
    if (!this.validateFile(file) || (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))) {
      this.extractFile.set(null);
      this.showNotice('Sélectionnez un fichier PDF valide de 50 Mo maximum.', true);
      return;
    }
    this.extractFile.set(file);
  }

  async imagesToPdf(): Promise<void> {
    if (this.imageFiles().length === 0) return;
    await this.runBusy(async () => {
      const blob = await this.pdfTools.imagesToPdf(this.imageFiles());
      await this.saveGeneratedPdf(blob, 'images-kaly');
      this.imageFiles.set([]);
    });
  }

  async extractPages(): Promise<void> {
    const file = this.extractFile();
    if (!file) return;
    await this.runBusy(async () => {
      const blob = await this.pdfTools.extractPages(file, this.pageRange());
      await this.saveGeneratedPdf(blob, `pages-${this.baseName(file.name)}`);
    });
  }

  async onAdvancedPdfFile(event: Event): Promise<void> {
    const file = this.filesFromEvent(event)[0] ?? null;
    if (!file) return;
    if (!this.validateFile(file) || (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))) {
      this.advancedPdfFile.set(null);
      this.pdfPages.set([]);
      this.showNotice('Sélectionnez un fichier PDF valide de 50 Mo maximum.', true);
      return;
    }
    this.advancedPdfFile.set(file);
    this.pdfPages.set([]);
    await this.runBusy(async () => {
      const count = await this.pdfTools.pageCount(file);
      if (count < 1) throw new Error('Ce PDF ne contient aucune page.');
      const thumbnails = await this.pdfTools.renderPdfPages(file, `1-${Math.min(count, 50)}`, 0.32);
      this.pdfPages.set(thumbnails);
      if (count > thumbnails.length) {
        this.showNotice('L’éditeur affiche les 50 premières pages. La division et la compression traitent le document complet.');
      }
    });
  }

  movePdfPage(index: number, direction: -1 | 1): void {
    const pages = [...this.pdfPages()];
    const target = index + direction;
    if (target < 0 || target >= pages.length) return;
    [pages[index], pages[target]] = [pages[target], pages[index]];
    this.pdfPages.set(pages);
  }

  removePdfPage(index: number): void {
    if (this.pdfPages().length <= 1) {
      this.showNotice('Un PDF doit conserver au moins une page.', true);
      return;
    }
    this.pdfPages.update(pages => pages.filter((_, pageIndex) => pageIndex !== index));
  }

  rotatePdfPage(index: number): void {
    this.pdfPages.update(pages => pages.map((page, pageIndex) =>
      pageIndex === index ? { ...page, rotation: (page.rotation + 90) % 360 } : page
    ));
  }

  async saveEditedPdf(): Promise<void> {
    const file = this.advancedPdfFile();
    const pages = this.pdfPages();
    if (!file || pages.length === 0) return;
    await this.runBusy(async () => {
      const blob = await this.pdfTools.editPages(
        file,
        pages.map(page => page.pageNumber),
        pages.map(page => page.rotation)
      );
      await this.saveGeneratedPdf(blob, `organise-${this.baseName(file.name)}`);
    });
  }

  async splitPdf(): Promise<void> {
    const file = this.advancedPdfFile();
    if (!file) return;
    await this.runBusy(async () => {
      const parts = await this.pdfTools.split(file, this.splitRanges());
      for (const part of parts) {
        const name = `${this.baseName(file.name)}-${part.name}`;
        const saved = await this.addDocument(part.blob, name, true);
        if (!saved) throw new Error(`Impossible d’enregistrer « ${name} ».`);
        this.downloadDocument(saved);
      }
      this.operationsCount.update(count => count + parts.length);
      this.showNotice(`${parts.length} fichiers ont été créés et téléchargés.`);
    });
  }

  async compressPdf(): Promise<void> {
    const file = this.advancedPdfFile();
    if (!file) return;
    await this.runBusy(async () => {
      const blob = await this.pdfTools.compress(file);
      if (blob.size === file.size) {
        this.showNotice('Le PDF ne peut pas être réduit avec le réglage sans perte disponible.');
        return;
      }
      await this.saveGeneratedPdf(blob, `compresse-${this.baseName(file.name)}`);
      this.showNotice(`PDF réduit de ${this.formatBytes(file.size - blob.size)}. La compression rasterise le texte.`);
    });
  }

  async pdfToImages(): Promise<void> {
    const file = this.advancedPdfFile();
    if (!file) return;
    await this.runBusy(async () => {
      const count = await this.pdfTools.pageCount(file);
      const thumbnails = await this.pdfTools.renderPdfPages(file, `1-${count}`, 1.5);
      for (const page of thumbnails) {
        const blob = await (await fetch(page.previewUrl)).blob();
        const name = `${this.baseName(file.name)}-page-${page.pageNumber}.jpg`;
        const saved = await this.addDocument(blob, name, false);
        if (!saved) throw new Error(`Impossible d’enregistrer « ${name} ».`);
      }
      this.operationsCount.update(count => count + 1);
      this.showNotice(`${thumbnails.length} pages ont été converties en images.`);
    });
  }

  onOcrFile(event: Event): void {
    const file = this.filesFromEvent(event)[0] ?? null;
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
    if (!this.validateFile(file) || (!isPdf && !isImage)) {
      this.ocrFile.set(null);
      this.ocrText.set('');
      this.showNotice('Sélectionnez un PDF ou une image JPEG, PNG ou WebP de 50 Mo maximum.', true);
      return;
    }
    this.ocrFile.set(file);
    this.ocrText.set('');
    this.ocrProgress.set(0);
  }

  async recognizeText(): Promise<void> {
    const file = this.ocrFile();
    if (!file) return;
    await this.runBusy(async () => {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      let images: Blob[] = [file];
      if (isPdf) {
        const pageCount = await this.pdfTools.pageCount(file);
        if (pageCount > 20) throw new Error('La reconnaissance OCR est limitée à 20 pages par document.');
        const pages = await this.pdfTools.renderPdfPages(file, `1-${pageCount}`, 1.5);
        images = await Promise.all(pages.map(async page => (await fetch(page.previewUrl)).blob()));
      }

      const { createWorker, OEM } = await import('tesseract.js');
      const worker = await createWorker('fra', OEM.LSTM_ONLY, {
        workerPath: '/assets/tesseract/worker.min.js',
        corePath: '/assets/tesseract/',
        langPath: '/assets/tessdata/4.0.0',
        logger: message => {
          if (message.status === 'recognizing text') this.ocrProgress.set(Math.round(message.progress * 100));
        }
      });
      try {
        const text: string[] = [];
        for (const [index, image] of images.entries()) {
          const result = await worker.recognize(image);
          text.push(result.data.text.trim());
          this.ocrProgress.set(Math.round(((index + 1) / images.length) * 100));
        }
        this.ocrText.set(text.filter(Boolean).join('\n\n'));
        this.showNotice(this.ocrText() ? 'Le texte a été extrait. Vous pouvez le copier ou le télécharger.' : 'Aucun texte lisible n’a été détecté.');
      } finally {
        await worker.terminate();
      }
    });
  }

  downloadOcrText(): void {
    const text = this.ocrText();
    if (!text) return;
    this.downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${this.baseName(this.ocrFile()?.name ?? 'document')}-ocr.txt`);
  }

  async startCamera(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.showNotice('La caméra n’est pas disponible dans ce navigateur ou cette connexion.', true);
      return;
    }
    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      this.cameraActive.set(true);
      await new Promise(resolve => setTimeout(resolve, 0));
      const video = this.cameraVideo()?.nativeElement;
      if (!video) throw new Error('Impossible d’afficher le flux de la caméra.');
      video.srcObject = this.cameraStream;
      await video.play();
      this.notice.set('');
    } catch (error) {
      this.stopCamera();
      this.showNotice(this.errorMessage(error, 'Impossible d’accéder à la caméra. Vérifiez les autorisations du navigateur.'), true);
    }
  }

  stopCamera(): void {
    this.cameraStream?.getTracks().forEach(track => track.stop());
    this.cameraStream = undefined;
    this.cameraActive.set(false);
  }

  async capturePage(): Promise<void> {
    const video = this.cameraVideo()?.nativeElement;
    if (!video || video.videoWidth === 0) {
      this.showNotice('La caméra n’est pas encore prête. Réessayez dans un instant.', true);
      return;
    }
    await this.runBusy(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Impossible de préparer la capture de la caméra.');
      context.filter = this.scanFilter() === 'grayscale' ? 'grayscale(1)' : this.scanFilter() === 'bw' ? 'grayscale(1) contrast(1.7)' : 'none';
      context.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('La capture n’a pas pu être créée.');
      const cropped = await this.addProcessedScanPage(blob, `Capture ${this.scanPages().length + 1}`);
      if (cropped === false) this.showNotice('Capture ajoutée sans recadrage : aucun contour fiable n’a été détecté.');
    });
  }

  async onScanImages(event: Event): Promise<void> {
    const images = this.filesFromEvent(event).filter(file => {
      if (file.type === 'image/png' || file.type === 'image/jpeg') return true;
      this.showNotice(`« ${file.name} » doit être une image PNG ou JPEG.`, true);
      return false;
    });
    const existingPages = this.scanPages();
    const existingSize = existingPages.reduce((size, page) => size + page.blob.size, 0);
    const accepted = this.validateBatch(images, existingPages.length, existingSize);
    if (accepted.length === 0) return;
    await this.runBusy(async () => {
      let croppedCount = 0;
      let addedCount = 0;
      for (const file of accepted) {
        const wasCropped = await this.addProcessedScanPage(file, file.name);
        if (wasCropped !== null) addedCount++;
        if (wasCropped === true) croppedCount++;
      }
      if (addedCount === 0) return;
      this.showNotice(!this.autoCrop()
        ? `${addedCount} image${addedCount > 1 ? 's ajoutées.' : ' ajoutée.'} sans recadrage automatique.`
        : croppedCount
        ? `${addedCount} page${addedCount > 1 ? 's' : ''} ajoutée${addedCount > 1 ? 's' : ''}, dont ${croppedCount} recadrée${croppedCount > 1 ? 's' : ''} automatiquement.`
        : `${addedCount} image${addedCount > 1 ? 's ajoutées' : ' ajoutée'}; aucun contour fiable n’a été détecté, les originaux ont été conservés.`);
    });
  }

  removeScanPage(index: number): void {
    this.scanPages.update(pages => {
      const page = pages[index];
      if (page) URL.revokeObjectURL(page.url);
      return pages.filter((_, pageIndex) => pageIndex !== index);
    });
  }

  moveScanPage(index: number, direction: -1 | 1): void {
    const pages = [...this.scanPages()];
    const target = index + direction;
    if (target < 0 || target >= pages.length) return;
    [pages[index], pages[target]] = [pages[target], pages[index]];
    this.scanPages.set(pages);
  }

  rotateScanPage(index: number): void {
    this.scanPages.update(pages => pages.map((page, pageIndex) =>
      pageIndex === index ? { ...page, rotation: (page.rotation + 90) % 360 } : page
    ));
  }

  async cropScanPage(index: number): Promise<void> {
    const page = this.scanPages()[index];
    if (!page) return;
    await this.runBusy(async () => {
      const cropped = await this.scanTools.cropDocument(page.blob);
      if (!cropped) {
        this.showNotice('Aucun contour de document suffisamment net n’a été détecté.', true);
        return;
      }
      const url = URL.createObjectURL(cropped);
      URL.revokeObjectURL(page.url);
      this.scanPages.update(pages => pages.map((item, pageIndex) =>
        pageIndex === index ? { ...item, blob: cropped, url } : item
      ));
      this.showNotice('La page a été recadrée automatiquement.');
    });
  }

  async createScanPdf(): Promise<void> {
    if (this.scanPages().length === 0) return;
    await this.runBusy(async () => {
      const pages = this.scanPages();
      const blob = await this.pdfTools.imagesToPdf(
        pages.map(page => page.blob),
        pages.map(page => page.rotation)
      );
      await this.saveGeneratedPdf(blob, this.scanName());
      this.scanPages().forEach(page => URL.revokeObjectURL(page.url));
      this.scanPages.set([]);
    });
  }

  previewDocument(document: KalyDocument): void {
    this.selectedDocument.set(document);
  }

  safePreviewUrl(): SafeResourceUrl | null {
    const document = this.selectedDocument();
    return document ? this.sanitizer.bypassSecurityTrustResourceUrl(document.previewUrl) : null;
  }

  closePreview(): void {
    this.selectedDocument.set(null);
  }

  openAuth(mode: AuthMode = 'login'): void {
    this.authMode.set(mode);
    this.navigate('auth');
  }

  async submitAuth(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    const email = String(values.get('email') ?? '').trim();
    const password = String(values.get('password') ?? '');
    const confirmationPassword = String(values.get('confirmPassword') ?? '');
    const displayName = String(values.get('displayName') ?? '').trim();
    if (this.authMode() === 'register' && password !== confirmationPassword) {
      this.showNotice('Les deux mots de passe ne correspondent pas.', true);
      return;
    }
    this.authBusy.set(true);
    try {
      if (this.authMode() === 'forgot') {
        await this.auth.requestPasswordReset(email);
        this.authMode.set('login');
        form.reset();
        this.showNotice('Si un compte correspond à cette adresse, un lien de réinitialisation sera envoyé.');
      } else if (this.authMode() === 'reset') {
        await this.auth.confirmPasswordReset(this.resetToken(), password);
        this.resetToken.set('');
        this.authMode.set('login');
        form.reset();
        this.showNotice('Votre mot de passe a été modifié. Vous pouvez vous connecter.');
      } else if (this.authMode() === 'register') {
        await this.auth.register(displayName, email, password);
      } else {
        await this.auth.login(email, password);
      }

      await this.restoreDocuments();
      await this.restoreFolders();
      this.navigate('home');
      form.reset();
      const name = this.authUser()?.displayName;
      this.showNotice(name ? `Bienvenue, ${name} !` : 'Connexion réussie.');
    } catch (error) {
      this.showNotice(this.errorMessage(error, 'La connexion au service a échoué.'), true);
    } finally {
      this.authBusy.set(false);
    }
  }

  togglePasswordVisibility(): void {
    this.passwordVisible.update(visible => !visible);
  }

  toggleConfirmationPasswordVisibility(): void {
    this.confirmationPasswordVisible.update(visible => !visible);
  }

  async logout(): Promise<void> {
    this.auth.logout();
    this.notifications.set([]);
    this.unreadNotificationCount.set(0);
    this.adminUsers.set([]);
    this.replaceDocuments([]);
    await this.restoreDocuments();
    await this.restoreFolders();
    this.navigate('home');
    this.showNotice('Vous êtes déconnecté. Les documents locaux restent disponibles dans ce navigateur.');
  }

  toggleNotifications(): void {
    this.notificationsOpen.update(open => !open);
    if (this.notificationsOpen()) void this.refreshNotifications();
  }

  async markNotificationRead(notification: UserNotification): Promise<void> {
    if (notification.readAt) return;
    try {
      await this.notificationsApi.markRead(notification.id);
      const readAt = new Date().toISOString();
      this.notifications.update(items => items.map(item =>
        item.id === notification.id ? { ...item, readAt } : item
      ));
      this.unreadNotificationCount.update(count => Math.max(0, count - 1));
    } catch (error) {
      this.showNotice(this.errorMessage(error, 'La notification n’a pas pu être marquée comme lue.'), true);
    }
  }

  async markAllNotificationsRead(): Promise<void> {
    try {
      await this.notificationsApi.markAllRead();
      const readAt = new Date().toISOString();
      this.notifications.update(items => items.map(item => ({ ...item, readAt: item.readAt ?? readAt })));
      this.unreadNotificationCount.set(0);
    } catch (error) {
      this.showNotice(this.errorMessage(error, 'Les notifications n’ont pas pu être marquées comme lues.'), true);
    }
  }

  async createManagedUser(event: Event): Promise<void> {
    event.preventDefault();
    if (this.authUser()?.role !== 'ADMIN') return;
    const form = event.target as HTMLFormElement;
    const values = new FormData(form);
    const displayName = String(values.get('displayName') ?? '').trim();
    const email = String(values.get('email') ?? '').trim();
    const password = String(values.get('password') ?? '');
    const role = String(values.get('role') ?? '');
    if (!displayName || !email || password.length < 10 || (role !== 'USER' && role !== 'ADMIN')) {
      this.showNotice('Vérifiez le nom, l’adresse, le rôle et le mot de passe (10 caractères minimum).', true);
      return;
    }
    this.adminBusy.set(true);
    try {
      const created = await this.admin.createUser({
        displayName,
        email,
        password,
        role
      });
      this.adminUsers.update(users => [created, ...users]);
      form.reset();
      this.showNotice(`Le compte ${created.email} a été créé (${created.role}).`);
    } catch (error) {
      this.showNotice(this.errorMessage(error, 'Le compte n’a pas pu être créé.'), true);
    } finally {
      this.adminBusy.set(false);
    }
  }

  async toggleManagedUser(user: ManagedUser): Promise<void> {
    if (this.authUser()?.role !== 'ADMIN') return;
    const enabled = !user.enabled;
    if (!await this.requestConfirmation(
      enabled ? 'Réactiver ce compte ?' : 'Désactiver ce compte ?',
      enabled
        ? `Le compte de ${user.email} pourra de nouveau se connecter.`
        : `Le compte de ${user.email} ne pourra plus se connecter. Ses données ne seront pas supprimées.`,
      enabled ? 'Réactiver' : 'Désactiver'
    )) return;
    this.adminBusy.set(true);
    try {
      const updated = await this.admin.setUserEnabled(user.id, enabled);
      this.adminUsers.update(users => users.map(item => item.id === updated.id ? updated : item));
      this.showNotice(enabled ? 'Le compte a été réactivé.' : 'Le compte a été désactivé.');
    } catch (error) {
      this.showNotice(this.errorMessage(error, 'Le statut du compte n’a pas pu être modifié.'), true);
    } finally {
      this.adminBusy.set(false);
    }
  }

  downloadDocument(document: KalyDocument): void {
    this.downloadBlob(document.file, document.name);
  }

  async renameDocument(document: KalyDocument): Promise<void> {
    const requestedName = await this.requestText(
      'Renommer le document',
      'Choisissez un nom clair pour retrouver facilement ce fichier.',
      'Nom du document',
      document.name
    );
    if (requestedName === null) return;
    const name = requestedName.trim();
    if (!name || name.length > 255) {
      this.showNotice('Le nom doit contenir de 1 à 255 caractères.', true);
      return;
    }
    try {
      await this.store.rename(document.id, name);
      this.documents.update(items => items.map(item => item.id === document.id ? { ...item, name } : item));
      this.showNotice('Le document a été renommé.');
    } catch (error) {
      this.showNotice(this.errorMessage(error, 'Le document n’a pas pu être renommé.'), true);
    }
  }

  async removeDocument(document: KalyDocument): Promise<void> {
    if (!await this.requestConfirmation(
      'Supprimer ce document ?',
      `« ${document.name} » sera supprimé définitivement de vos documents.`,
      'Supprimer'
    )) return;
    try {
      await this.store.remove(document.id);
      this.documents.update(items => items.filter(item => item.id !== document.id));
      if (this.selectedDocument()?.id === document.id) this.closePreview();
      URL.revokeObjectURL(document.previewUrl);
      this.showNotice('Le document a été supprimé.');
    } catch (error) {
      this.showNotice(this.errorMessage(error, 'Le document n’a pas pu être supprimé.'), true);
    }
  }

  async createFolder(): Promise<void> {
    const name = await this.requestText(
      'Créer un dossier',
      'Un nom court vous aidera à organiser vos documents.',
      'Nom du dossier',
      '',
      100
    );
    if (name === null) return;
    try {
      const folder = await this.store.createFolder(name.trim());
      this.folders.update(folders => [...folders, folder].sort((a, b) => a.name.localeCompare(b.name, 'fr')));
      this.showNotice(`Le dossier « ${folder.name} » a été créé.`);
    } catch (error) {
      this.showNotice(this.errorMessage(error, 'Le dossier n’a pas pu être créé.'), true);
    }
  }

  async renameFolder(folder: StoredFolder): Promise<void> {
    const name = await this.requestText(
      'Renommer le dossier',
      'Les documents contenus dans ce dossier ne seront pas modifiés.',
      'Nom du dossier',
      folder.name,
      100
    );
    if (name === null) return;
    try {
      await this.store.renameFolder(folder.id, name.trim());
      this.folders.update(folders => folders.map(item =>
        item.id === folder.id ? { ...item, name: name.trim() } : item
      ).sort((a, b) => a.name.localeCompare(b.name, 'fr')));
      this.showNotice('Le dossier a été renommé.');
    } catch (error) {
      this.showNotice(this.errorMessage(error, 'Le dossier n’a pas pu être renommé.'), true);
    }
  }

  async deleteFolder(folder: StoredFolder): Promise<void> {
    if (!await this.requestConfirmation(
      'Supprimer ce dossier ?',
      `Les documents du dossier « ${folder.name} » seront conservés, mais ne seront plus classés.`,
      'Supprimer le dossier'
    )) return;
    try {
      await this.store.deleteFolder(folder.id);
      this.folders.update(folders => folders.filter(item => item.id !== folder.id));
      this.documents.update(documents => documents.map(document =>
        document.folderId === folder.id ? { ...document, folderId: null } : document
      ));
      if (this.folderFilter() === folder.id) this.folderFilter.set('all');
      this.showNotice('Le dossier a été supprimé. Les documents ont été conservés.');
    } catch (error) {
      this.showNotice(this.errorMessage(error, 'Le dossier n’a pas pu être supprimé.'), true);
    }
  }

  async moveDocument(document: KalyDocument, event: Event): Promise<void> {
    const folderId = (event.currentTarget as HTMLSelectElement).value || null;
    try {
      await this.store.moveDocument(document.id, folderId);
      this.documents.update(documents => documents.map(item =>
        item.id === document.id ? { ...item, folderId } : item
      ));
      const folder = this.folders().find(item => item.id === folderId);
      this.showNotice(folder ? `Document déplacé dans « ${folder.name} ».` : 'Document retiré de son dossier.');
    } catch (error) {
      this.showNotice(this.errorMessage(error, 'Le document n’a pas pu être déplacé.'), true);
    }
  }

  resolvePrompt(event: SubmitEvent): void {
    event.preventDefault();
    this.resolveDialog(this.dialogInput().trim());
  }

  resolveConfirmation(confirmed: boolean): void {
    this.resolveDialog(confirmed);
  }

  closeDialogFromBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.resolveDialog(null);
  }

  cancelDialog(): void {
    this.resolveDialog(null);
  }

  async shareKaly(): Promise<void> {
    const shareData = { title: 'Kaly', text: 'Découvrez Kaly, votre espace gratuit pour organiser et préparer vos documents.', url: location.origin };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        this.showNotice('Le lien de Kaly a été copié. Merci de le partager !');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.showNotice(this.errorMessage(error, 'Le lien de Kaly n’a pas pu être partagé.'), true);
    }
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    const units = ['Ko', 'Mo', 'Go'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit++;
    }
    return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${units[unit]}`;
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }

  private async restoreDocuments(): Promise<void> {
    try {
      const stored = await this.store.list();
      this.replaceDocuments(stored.map(document => ({ ...document, previewUrl: URL.createObjectURL(document.file) })));
    } catch (error) {
      this.showNotice(this.errorMessage(error, 'Les documents enregistrés localement n’ont pas pu être chargés.'), true);
    }
  }

  private async initializeWorkspace(): Promise<void> {
    if (this.auth.token()) {
      try {
        await this.auth.refreshUser();
      } catch (error) {
        if (error instanceof HttpErrorResponse && error.status === 0) {
          this.showNotice('Le serveur ne répond pas. Les documents du compte seront rechargés à sa prochaine disponibilité.', true);
        }
      }
    }
    this.sessionReady.set(true);
    await Promise.all([this.restoreDocuments(), this.restoreFolders()]);
  }

  private async refreshNotifications(): Promise<void> {
    if (!this.auth.isAuthenticated()) return;
    try {
      const [notifications, unreadCount] = await Promise.all([
        this.notificationsApi.list(),
        this.notificationsApi.unreadCount()
      ]);
      this.notifications.set(notifications);
      this.unreadNotificationCount.set(unreadCount);
    } catch (error) {
      this.showNotice(this.errorMessage(error, 'Les notifications n’ont pas pu être chargées.'), true);
    }
  }

  async refreshAdminUsers(): Promise<void> {
    if (this.authUser()?.role !== 'ADMIN') return;
    try {
      this.adminUsers.set(await this.admin.listUsers());
    } catch (error) {
      this.showNotice(this.errorMessage(error, 'La liste des utilisateurs n’a pas pu être chargée.'), true);
    }
  }

  private requestText(
    title: string,
    description: string,
    label: string,
    initialValue = '',
    maximumLength = 255
  ): Promise<string | null> {
    this.dialogInput.set(initialValue);
    this.appDialog.set({ kind: 'prompt', title, description, label, maximumLength });
    return new Promise(resolve => {
      this.dialogResolver?.(null);
      this.dialogResolver = value => resolve(typeof value === 'string' ? value : null);
    });
  }

  private requestConfirmation(title: string, description: string, confirmLabel: string): Promise<boolean> {
    this.appDialog.set({ kind: 'confirm', title, description, confirmLabel });
    return new Promise(resolve => {
      this.dialogResolver?.(null);
      this.dialogResolver = value => resolve(value === true);
    });
  }

  private resolveDialog(value: string | boolean | null): void {
    const resolver = this.dialogResolver;
    this.dialogResolver = null;
    this.appDialog.set(null);
    resolver?.(value);
  }

  private async restoreFolders(): Promise<void> {
    try {
      const folders = await this.store.listFolders();
      this.folders.set(folders.sort((a, b) => a.name.localeCompare(b.name, 'fr')));
    } catch (error) {
      this.showNotice(this.errorMessage(error, 'Les dossiers n’ont pas pu être chargés.'), true);
    }
  }

  private replaceDocuments(documents: KalyDocument[]): void {
    this.revokeDocumentUrls();
    this.documents.set(documents);
  }

  private async addDocument(file: Blob, name: string, createdHere: boolean): Promise<KalyDocument | null> {
    const kind: DocumentKind = file.type.startsWith('image/') ? 'image' : 'pdf';
    const record: StoredDocument = {
      id: crypto.randomUUID(),
      name,
      file,
      kind,
      addedAt: Date.now(),
      createdHere
    };
    try {
      const stored = await this.store.save(record);
      const document: KalyDocument = { ...stored, previewUrl: URL.createObjectURL(file) };
      this.documents.update(items => [document, ...items]);
      return document;
    } catch (error) {
      this.showNotice(this.errorMessage(error, 'Le document n’a pas pu être enregistré dans cet espace.'), true);
      return null;
    }
  }

  private async saveGeneratedPdf(blob: Blob, requestedName: string): Promise<void> {
    const name = `${this.baseName(requestedName) || 'document-kaly'}.pdf`;
    const saved = await this.addDocument(blob, name, true);
    if (!saved) throw new Error('Le document PDF n’a pas pu être enregistré.');
    this.downloadDocument(saved);
    this.operationsCount.update(count => count + 1);
    this.showNotice(`${name} a été créé et téléchargé.`);
  }

  private addMergeFiles(files: File[]): void {
    const existing = this.mergeFiles();
    const accepted = files.filter(file => {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const isImage = file.type === 'image/jpeg' || file.type === 'image/png';
      if (!isPdf && !isImage) {
        this.showNotice(`« ${file.name} » n’est pas un PDF, un JPEG ou un PNG.`, true);
        return false;
      }
      return true;
    });
    this.mergeFiles.set([...existing, ...this.validateBatch(accepted, existing.length, existing.reduce((size, file) => size + file.size, 0))]);
  }

  private addScanPage(blob: Blob, source: string): boolean {
    const pages = this.scanPages();
    if (pages.length >= MAX_BATCH_FILES) {
      this.showNotice(`La numérisation est limitée à ${MAX_BATCH_FILES} pages.`, true);
      return false;
    }
    if (pages.reduce((size, page) => size + page.blob.size, 0) + blob.size > MAX_BATCH_SIZE) {
      this.showNotice('La taille totale des pages numérisées ne peut pas dépasser 100 Mo.', true);
      return false;
    }
    const url = URL.createObjectURL(blob);
    this.scanPages.set([...pages, { id: crypto.randomUUID(), blob, url, source, rotation: 0 }]);
    return true;
  }

  private async addProcessedScanPage(blob: Blob, source: string): Promise<boolean | null> {
    const cropped = this.autoCrop() ? await this.scanTools.cropDocument(blob) : null;
    if (!this.addScanPage(cropped ?? blob, source)) return null;
    return cropped !== null;
  }

  private filesFromEvent(event: Event): File[] {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    return files;
  }

  private validateFile(file: File): boolean {
    if (!ACCEPTED_TYPES.has(file.type) && !file.name.toLowerCase().endsWith('.pdf')) {
      this.showNotice(`Le format de « ${file.name} » n’est pas accepté.`, true);
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      this.showNotice(`« ${file.name} » dépasse la limite de 50 Mo.`, true);
      return false;
    }
    return true;
  }

  private validateBatch(files: File[], existingCount = 0, existingSize = 0): File[] {
    const accepted: File[] = [];
    let totalSize = existingSize;
    for (const file of files) {
      if (!this.validateFile(file)) continue;
      if (existingCount + accepted.length >= MAX_BATCH_FILES) {
        this.showNotice(`La sélection est limitée à ${MAX_BATCH_FILES} fichiers.`, true);
        break;
      }
      if (totalSize + file.size > MAX_BATCH_SIZE) {
        this.showNotice('La taille totale de la sélection ne peut pas dépasser 100 Mo.', true);
        continue;
      }
      totalSize += file.size;
      accepted.push(file);
    }
    return accepted;
  }

  private async runBusy(operation: () => Promise<void>): Promise<void> {
    if (this.isBusy()) return;
    this.isBusy.set(true);
    try {
      await operation();
    } catch (error) {
      this.showNotice(this.errorMessage(error, 'L’opération a échoué.'), true);
    } finally {
      this.isBusy.set(false);
    }
  }

  private showNotice(message: string, isError = false): void {
    this.notice.set(message);
    this.noticeIsError.set(isError);
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'Impossible de joindre l’API Kaly. Vérifiez qu’elle est démarrée sur le port 8080.';
      if (error.status === 401) return 'Adresse e-mail ou mot de passe incorrect, ou compte désactivé.';
      if (typeof error.error === 'object' && error.error !== null && 'message' in error.error) {
        const message = (error.error as { message?: unknown }).message;
        if (typeof message === 'string') return message;
      }
      if (error.status >= 500) return 'Le service Kaly a rencontré une erreur. Vérifiez la configuration de l’API et de la base de données.';
    }
    return error instanceof Error ? error.message : fallback;
  }

  private baseName(name: string): string {
    return name.trim().replace(/\.pdf$/i, '').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').slice(0, 100);
  }

  private downloadBlob(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private revokeDocumentUrls(): void {
    this.documents().forEach(document => URL.revokeObjectURL(document.previewUrl));
  }
}
