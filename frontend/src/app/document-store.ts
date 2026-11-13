import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

export interface StoredDocument {
  id: string;
  name: string;
  file: Blob;
  kind: 'pdf' | 'image';
  addedAt: number;
  createdHere: boolean;
  folderId?: string | null;
}

export interface StoredFolder {
  id: string;
  name: string;
  createdAt: number;
}

@Injectable({ providedIn: 'root' })
export class DocumentStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly database = this.openDatabase();
  private readonly apiUrl = this.auth.apiUrl;

  async list(): Promise<StoredDocument[]> {
    if (this.auth.isAuthenticated()) {
      const metadata = await firstValueFrom(this.http.get<Array<{
        id: string;
        name: string;
        contentType: string;
        createdAt: string;
        folderId: string | null;
      }>>(`${this.apiUrl}/api/documents`, { headers: this.authHeaders() }));
      return Promise.all(metadata.map(async document => {
        const file = await firstValueFrom(this.http.get(`${this.apiUrl}/api/documents/${encodeURIComponent(document.id)}/content`, {
          headers: this.authHeaders(),
          responseType: 'blob'
        }));
        return {
          id: document.id,
          name: document.name,
          file,
          kind: document.contentType.startsWith('image/') ? 'image' as const : 'pdf' as const,
          addedAt: Date.parse(document.createdAt),
          createdHere: false,
          folderId: document.folderId
        };
      }));
    }
    const database = await this.database;
    return new Promise((resolve, reject) => {
      const request = database.transaction('documents', 'readonly').objectStore('documents').getAll();
      request.onsuccess = () => resolve(request.result as StoredDocument[]);
      request.onerror = () => reject(request.error ?? new Error('Impossible de lire les documents locaux.'));
    });
  }

  async save(document: StoredDocument): Promise<StoredDocument> {
    if (this.auth.isAuthenticated()) {
      const payload = new FormData();
      payload.append('file', document.file, document.name);
      const metadata = await firstValueFrom(this.http.post<{
        id: string;
        name: string;
        contentType: string;
        createdAt: string;
        folderId: string | null;
      }>(`${this.apiUrl}/api/documents`, payload, { headers: this.authHeaders() }));
      return {
        ...document,
        id: metadata.id,
        name: metadata.name,
        kind: metadata.contentType.startsWith('image/') ? 'image' : 'pdf',
        addedAt: Date.parse(metadata.createdAt),
        folderId: metadata.folderId
      };
    }
    const database = await this.database;
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('documents', 'readwrite');
      transaction.objectStore('documents').put(document);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Impossible d’enregistrer le document localement.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('L’enregistrement du document a été annulé.'));
    });
    return document;
  }

  async remove(id: string): Promise<void> {
    if (this.auth.isAuthenticated()) {
      await firstValueFrom(this.http.delete(`${this.apiUrl}/api/documents/${encodeURIComponent(id)}`, {
        headers: this.authHeaders()
      }));
      return;
    }
    const database = await this.database;
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('documents', 'readwrite');
      transaction.objectStore('documents').delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Impossible de supprimer le document local.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('La suppression du document a été annulée.'));
    });
  }

  async rename(id: string, name: string): Promise<void> {
    if (this.auth.isAuthenticated()) {
      await firstValueFrom(this.http.put(`${this.apiUrl}/api/documents/${encodeURIComponent(id)}/name`, { name }, {
        headers: this.authHeaders()
      }));
      return;
    }
    const database = await this.database;
    const record = await new Promise<StoredDocument>((resolve, reject) => {
      const request = database.transaction('documents', 'readonly').objectStore('documents').get(id);
      request.onsuccess = () => request.result ? resolve(request.result as StoredDocument) : reject(new Error('Document local introuvable.'));
      request.onerror = () => reject(request.error ?? new Error('Impossible de lire le document local.'));
    });
    await this.save({ ...record, name });
  }

  async listFolders(): Promise<StoredFolder[]> {
    if (this.auth.isAuthenticated()) {
      const folders = await firstValueFrom(this.http.get<Array<{ id: string; name: string; createdAt: string }>>(
        `${this.apiUrl}/api/folders`, { headers: this.authHeaders() }
      ));
      return folders.map(folder => ({ ...folder, createdAt: Date.parse(folder.createdAt) }));
    }
    const database = await this.database;
    return new Promise((resolve, reject) => {
      const request = database.transaction('folders', 'readonly').objectStore('folders').getAll();
      request.onsuccess = () => resolve(request.result as StoredFolder[]);
      request.onerror = () => reject(request.error ?? new Error('Impossible de lire les dossiers locaux.'));
    });
  }

  async createFolder(name: string): Promise<StoredFolder> {
    const normalizedName = this.normalizeFolderName(name);
    const existing = await this.listFolders();
    if (existing.some(folder => folder.name === normalizedName)) {
      throw new Error('Un dossier de ce nom existe déjà.');
    }
    if (this.auth.isAuthenticated()) {
      const folder = await firstValueFrom(this.http.post<{ id: string; name: string; createdAt: string }>(
        `${this.apiUrl}/api/folders`, { name: normalizedName }, { headers: this.authHeaders() }
      ));
      return { ...folder, createdAt: Date.parse(folder.createdAt) };
    }
    const folder = { id: crypto.randomUUID(), name: normalizedName, createdAt: Date.now() };
    const database = await this.database;
    await this.writeTransaction(database, 'folders', store => store.put(folder));
    return folder;
  }

  async renameFolder(id: string, name: string): Promise<void> {
    const normalizedName = this.normalizeFolderName(name);
    const existing = await this.listFolders();
    if (existing.some(folder => folder.id !== id && folder.name === normalizedName)) {
      throw new Error('Un dossier de ce nom existe déjà.');
    }
    if (this.auth.isAuthenticated()) {
      await firstValueFrom(this.http.put(`${this.apiUrl}/api/folders/${encodeURIComponent(id)}`, { name: normalizedName }, {
        headers: this.authHeaders()
      }));
      return;
    }
    const folder = existing.find(item => item.id === id);
    if (!folder) throw new Error('Dossier local introuvable.');
    const database = await this.database;
    await this.writeTransaction(database, 'folders', store => store.put({ ...folder, name: normalizedName }));
  }

  async deleteFolder(id: string): Promise<void> {
    if (this.auth.isAuthenticated()) {
      await firstValueFrom(this.http.delete(`${this.apiUrl}/api/folders/${encodeURIComponent(id)}`, {
        headers: this.authHeaders()
      }));
      return;
    }
    const database = await this.database;
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(['folders', 'documents'], 'readwrite');
      transaction.objectStore('folders').delete(id);
      const documents = transaction.objectStore('documents');
      const request = documents.getAll();
      request.onsuccess = () => {
        for (const document of request.result as StoredDocument[]) {
          if (document.folderId === id) documents.put({ ...document, folderId: null });
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Impossible de supprimer le dossier.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('La suppression du dossier a été annulée.'));
    });
  }

  async moveDocument(id: string, folderId: string | null): Promise<void> {
    if (this.auth.isAuthenticated()) {
      await firstValueFrom(this.http.put(`${this.apiUrl}/api/documents/${encodeURIComponent(id)}/folder`, { folderId }, {
        headers: this.authHeaders()
      }));
      return;
    }
    const database = await this.database;
    const document = await new Promise<StoredDocument>((resolve, reject) => {
      const request = database.transaction('documents', 'readonly').objectStore('documents').get(id);
      request.onsuccess = () => request.result ? resolve(request.result as StoredDocument) : reject(new Error('Document local introuvable.'));
      request.onerror = () => reject(request.error ?? new Error('Impossible de lire le document local.'));
    });
    await this.save({ ...document, folderId });
  }

  private authHeaders(): HttpHeaders {
    const token = this.auth.token();
    if (!token) throw new Error('La session utilisateur a expiré. Reconnectez-vous.');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  private normalizeFolderName(name: string): string {
    const normalized = name.trim();
    if (!normalized || normalized.length > 100 || /[\u0000-\u001f\u007f]/.test(normalized)) {
      throw new Error('Le nom du dossier doit contenir de 1 à 100 caractères.');
    }
    return normalized;
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('Le stockage local n’est pas disponible dans ce navigateur.'));
        return;
      }
      const request = indexedDB.open('kaly-documents', 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('documents')) {
          request.result.createObjectStore('documents', { keyPath: 'id' });
        }
        if (!request.result.objectStoreNames.contains('folders')) {
          request.result.createObjectStore('folders', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Impossible d’ouvrir le stockage local.'));
    });
  }

  private writeTransaction(
    database: IDBDatabase,
    storeName: string,
    write: (store: IDBObjectStore) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      write(transaction.objectStore(storeName));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Impossible de modifier le stockage local.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('La modification du stockage local a été annulée.'));
    });
  }
}
