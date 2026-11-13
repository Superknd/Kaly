package fr.kaly.api.admin;

import fr.kaly.api.user.AppUser;
import fr.kaly.api.user.Role;

import java.time.Instant;

public record AdminUserResponse(
        String id,
        String displayName,
        String email,
        Role role,
        boolean enabled,
        Instant createdAt
) {
    static AdminUserResponse from(AppUser user) {
        return new AdminUserResponse(
                user.getId(),
                user.getDisplayName(),
                user.getEmail(),
                user.getRole(),
                user.isEnabled(),
                user.getCreatedAt()
        );
    }
}
