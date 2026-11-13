package fr.kaly.api.folder;

import java.time.Instant;

public record FolderResponse(String id, String name, Instant createdAt) {
    static FolderResponse from(Folder folder) {
        return new FolderResponse(folder.getId(), folder.getName(), folder.getCreatedAt());
    }
}
