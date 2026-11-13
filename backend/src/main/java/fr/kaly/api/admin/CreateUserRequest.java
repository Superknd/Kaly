package fr.kaly.api.admin;

import fr.kaly.api.user.Role;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateUserRequest(
        @NotBlank @Email @Size(max = 254) String email,
        @NotBlank @Size(min = 10, max = 72) String password,
        @NotBlank @Size(max = 100) String displayName,
        @NotNull Role role
) {
}
