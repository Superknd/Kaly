package fr.kaly.api.folder;

import fr.kaly.api.user.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "folders", uniqueConstraints = @UniqueConstraint(
        name = "uk_folders_owner_name", columnNames = {"owner_id", "name"}
))
public class Folder {
    @Id
    @Column(length = 36)
    private String id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private AppUser owner;

    protected Folder() {
    }

    public Folder(String name, AppUser owner) {
        this.id = UUID.randomUUID().toString();
        this.name = name;
        this.owner = owner;
    }

    @PrePersist
    void setCreatedAt() {
        if (createdAt == null) createdAt = Instant.now();
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public AppUser getOwner() {
        return owner;
    }

    public void rename(String name) {
        this.name = name;
    }
}
