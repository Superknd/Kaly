package fr.kaly.api.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PasswordResetConfirmRequest(
        @NotBlank @Size(max = 128) String token,
        @NotBlank @Size(min = 10, max = 72) String password
) {
}
