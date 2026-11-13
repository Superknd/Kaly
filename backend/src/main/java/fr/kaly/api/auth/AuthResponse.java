package fr.kaly.api.auth;

public record AuthResponse(String token, long expiresInSeconds, UserResponse user) {
}
