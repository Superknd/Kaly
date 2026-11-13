package fr.kaly.api.auth;

import fr.kaly.api.user.AppUser;
import fr.kaly.api.user.Role;

public record UserResponse(String id, String displayName, String email, Role role) {
    static UserResponse from(AppUser user) {
        return new UserResponse(user.getId(), user.getDisplayName(), user.getEmail(), user.getRole());
    }
}
