package fr.kaly.api.document;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DocumentRepository extends JpaRepository<Document, String> {
    List<Document> findAllByOwnerIdOrderByCreatedAtDesc(String ownerId);
    List<Document> findAllByOwnerIdAndFolderIdOrderByCreatedAtDesc(String ownerId, String folderId);
    Optional<Document> findByIdAndOwnerId(String id, String ownerId);
}
