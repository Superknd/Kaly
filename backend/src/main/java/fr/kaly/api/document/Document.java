package fr.kaly.api.document;

import fr.kaly.api.user.AppUser;
import fr.kaly.api.folder.Folder;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "documents", uniqueConstraints = @UniqueConstraint(name = "uk_documents_storage_key", columnNames = "storage_key"))
public class Document {
    @Id
    @Column(length = 36)
    private String id;

    @Column(name = "original_filename", nullable = false, length = 255)
    private String originalFilename;

    @Column(name = "storage_key", nullable = false, length = 36)
    private String storageKey;

    @Column(name = "content_type", nullable = false, length = 100)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "modified_at", nullable = false)
    private Instant modifiedAt;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private AppUser owner;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "folder_id")
    private Folder folder;

    protected Document() {
    }

    public Document(String originalFilename, String contentType, long sizeBytes, AppUser owner) {
        this.id = UUID.randomUUID().toString();
        this.originalFilename = originalFilename;
        this.storageKey = UUID.randomUUID().toString();
        this.contentType = contentType;
        this.sizeBytes = sizeBytes;
        this.owner = owner;
    }

    @PrePersist
    void beforeInsert() {
        Instant now = Instant.now();
        if (createdAt == null) createdAt = now;
        modifiedAt = now;
    }

    @PreUpdate
    void beforeUpdate() {
        modifiedAt = Instant.now();
    }

    public String getId() {
        return id;
    }

    public String getOriginalFilename() {
        return originalFilename;
    }

    public String getStorageKey() {
        return storageKey;
    }

    public String getContentType() {
        return contentType;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getModifiedAt() {
        return modifiedAt;
    }

    public AppUser getOwner() {
        return owner;
    }

    public Folder getFolder() {
        return folder;
    }

    public void rename(String originalFilename) {
        this.originalFilename = originalFilename;
    }

    public void moveTo(Folder folder) {
        this.folder = folder;
    }
}
