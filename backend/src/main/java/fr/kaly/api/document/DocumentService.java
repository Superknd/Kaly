package fr.kaly.api.document;

import fr.kaly.api.auth.KalyPrincipal;
import fr.kaly.api.common.ApiException;
import fr.kaly.api.folder.Folder;
import fr.kaly.api.folder.FolderRepository;
import fr.kaly.api.pdf.PdfProcessingService;
import fr.kaly.api.user.AppUser;
import fr.kaly.api.user.AppUserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.List;
import java.util.UUID;

@Service
public class DocumentService {
    private static final long MAX_FILE_SIZE = 50L * 1024 * 1024;
    private final DocumentRepository documents;
    private final AppUserRepository users;
    private final FolderRepository folders;
    private final PdfProcessingService pdfProcessingService;
    private final Path storageRoot;

    public DocumentService(
            DocumentRepository documents,
            AppUserRepository users,
            FolderRepository folders,
            PdfProcessingService pdfProcessingService,
            @Value("${kaly.storage-location}") String storageLocation
    ) {
        this.documents = documents;
        this.users = users;
        this.folders = folders;
        this.pdfProcessingService = pdfProcessingService;
        this.storageRoot = Path.of(storageLocation).toAbsolutePath().normalize();
    }

    @Transactional(readOnly = true)
    public List<DocumentResponse> list(KalyPrincipal owner) {
        return documents.findAllByOwnerIdOrderByCreatedAtDesc(owner.id())
                .stream()
                .map(DocumentResponse::from)
                .toList();
    }

    @Transactional
    public DocumentResponse upload(MultipartFile file, KalyPrincipal owner) {
        if (file.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "Le fichier est vide.");
        if (file.getSize() > MAX_FILE_SIZE) throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "La taille maximale par fichier est de 50 Mo.");

        byte[] content;
        try {
            content = file.getBytes();
        } catch (IOException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Le fichier n’a pas pu être lu.");
        }

        String contentType = pdfProcessingService.detectAndValidate(content);
        AppUser user = users.findById(owner.id())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Compte utilisateur introuvable."));
        Document document = new Document(safeFilename(file.getOriginalFilename()), contentType, content.length, user);
        Path target = storageRoot.resolve(document.getStorageKey()).normalize();
        if (!target.startsWith(storageRoot)) throw new IllegalStateException("Chemin de stockage invalide.");

        try {
            Files.createDirectories(storageRoot);
            Files.write(target, content, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
            Document saved = documents.save(document);
            return DocumentResponse.from(saved);
        } catch (IOException exception) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Le fichier n’a pas pu être enregistré.");
        } catch (RuntimeException exception) {
            try {
                Files.deleteIfExists(target);
            } catch (IOException cleanupException) {
                exception.addSuppressed(cleanupException);
            }
            throw exception;
        }
    }

    @Transactional(readOnly = true)
    public Document getOwnedDocument(String id, KalyPrincipal owner) {
        return documents.findByIdAndOwnerId(id, owner.id())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Document introuvable."));
    }

    public byte[] readContent(Document document) {
        try {
            return Files.readAllBytes(resolveStorageKey(document));
        } catch (IOException exception) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Le fichier associé à ce document est introuvable.");
        }
    }

    @Transactional
    public void delete(String id, KalyPrincipal owner) {
        Document document = getOwnedDocument(id, owner);
        Path path = resolveStorageKey(document);
        try {
            Files.deleteIfExists(path);
        } catch (IOException exception) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Le fichier n’a pas pu être supprimé.");
        }
        documents.delete(document);
    }

    @Transactional
    public DocumentResponse rename(String id, String name, KalyPrincipal owner) {
        Document document = getOwnedDocument(id, owner);
        document.rename(safeFilename(name));
        return DocumentResponse.from(documents.save(document));
    }

    @Transactional
    public DocumentResponse move(String id, String folderId, KalyPrincipal owner) {
        Document document = getOwnedDocument(id, owner);
        Folder folder = folderId == null || folderId.isBlank()
                ? null
                : folders.findByIdAndOwnerId(folderId, owner.id())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Dossier introuvable."));
        document.moveTo(folder);
        return DocumentResponse.from(documents.save(document));
    }

    private String safeFilename(String filename) {
        if (filename == null || filename.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Le nom du fichier est obligatoire.");
        }
        String basename = filename.replace('\\', '/');
        basename = basename.substring(basename.lastIndexOf('/') + 1)
                .replaceAll("[\\p{Cntrl}<>:\"|?*]", "-")
                .trim();
        if (basename.isBlank() || basename.length() > 255) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Le nom du fichier doit contenir de 1 à 255 caractères.");
        }
        return basename;
    }

    private Path resolveStorageKey(Document document) {
        Path path = storageRoot.resolve(document.getStorageKey()).normalize();
        if (!path.startsWith(storageRoot)) throw new IllegalStateException("Chemin de stockage invalide.");
        return path;
    }
}
