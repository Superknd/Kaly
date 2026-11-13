package fr.kaly.api.folder;

import fr.kaly.api.auth.KalyPrincipal;
import fr.kaly.api.common.ApiException;
import fr.kaly.api.document.Document;
import fr.kaly.api.document.DocumentRepository;
import fr.kaly.api.user.AppUser;
import fr.kaly.api.user.AppUserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class FolderService {
    private final FolderRepository folders;
    private final DocumentRepository documents;
    private final AppUserRepository users;

    public FolderService(FolderRepository folders, DocumentRepository documents, AppUserRepository users) {
        this.folders = folders;
        this.documents = documents;
        this.users = users;
    }

    @Transactional(readOnly = true)
    public List<FolderResponse> list(KalyPrincipal owner) {
        return folders.findAllByOwnerIdOrderByNameAsc(owner.id()).stream().map(FolderResponse::from).toList();
    }

    @Transactional
    public FolderResponse create(String name, KalyPrincipal owner) {
        String normalized = normalizeName(name);
        if (folders.existsByNameAndOwnerId(normalized, owner.id())) {
            throw new ApiException(HttpStatus.CONFLICT, "Un dossier de ce nom existe déjà.");
        }
        AppUser user = users.findById(owner.id())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Compte utilisateur introuvable."));
        return FolderResponse.from(folders.save(new Folder(normalized, user)));
    }

    @Transactional
    public FolderResponse rename(String id, String name, KalyPrincipal owner) {
        Folder folder = getOwnedFolder(id, owner);
        String normalized = normalizeName(name);
        if (!folder.getName().equals(normalized) && folders.existsByNameAndOwnerId(normalized, owner.id())) {
            throw new ApiException(HttpStatus.CONFLICT, "Un dossier de ce nom existe déjà.");
        }
        folder.rename(normalized);
        return FolderResponse.from(folders.save(folder));
    }

    @Transactional
    public void delete(String id, KalyPrincipal owner) {
        Folder folder = getOwnedFolder(id, owner);
        List<Document> contained = documents.findAllByOwnerIdAndFolderIdOrderByCreatedAtDesc(owner.id(), id);
        contained.forEach(document -> document.moveTo(null));
        documents.saveAll(contained);
        folders.delete(folder);
    }

    private Folder getOwnedFolder(String id, KalyPrincipal owner) {
        return folders.findByIdAndOwnerId(id, owner.id())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Dossier introuvable."));
    }

    private String normalizeName(String name) {
        if (name == null || name.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Le nom du dossier est obligatoire.");
        }
        String normalized = name.trim();
        if (normalized.length() > 100 || normalized.codePoints().anyMatch(Character::isISOControl)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Le nom du dossier doit contenir au maximum 100 caractères.");
        }
        return normalized;
    }
}
