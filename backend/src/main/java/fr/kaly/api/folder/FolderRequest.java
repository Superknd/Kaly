package fr.kaly.api.folder;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record FolderRequest(@NotBlank @Size(max = 100) String name) {
}
