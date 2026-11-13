package fr.kaly.api.document;

import java.time.Instant;

public record DocumentResponse(
        String id,
        String name,
        String contentType,
        long sizeBytes,
        Instant createdAt,
        Instant modifiedAt,
        String folderId
) {
    static DocumentResponse from(Document document) {
        return new DocumentResponse(
                document.getId(),
                document.getOriginalFilename(),
                document.getContentType(),
                document.getSizeBytes(),
                document.getCreatedAt(),
                document.getModifiedAt(),
                document.getFolder() == null ? null : document.getFolder().getId()
        );
    }
}
