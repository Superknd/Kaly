package fr.kaly.api.document;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RenameDocumentRequest(@NotBlank @Size(max = 255) String name) {
}
