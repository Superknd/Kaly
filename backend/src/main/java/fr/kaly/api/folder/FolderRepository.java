package fr.kaly.api.folder;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FolderRepository extends JpaRepository<Folder, String> {
    List<Folder> findAllByOwnerIdOrderByNameAsc(String ownerId);
    Optional<Folder> findByIdAndOwnerId(String id, String ownerId);
    boolean existsByNameAndOwnerId(String name, String ownerId);
}
