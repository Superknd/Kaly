package fr.kaly.api.document;

import jakarta.validation.constraints.Size;

public record MoveDocumentRequest(@Size(max = 36) String folderId) {
}
