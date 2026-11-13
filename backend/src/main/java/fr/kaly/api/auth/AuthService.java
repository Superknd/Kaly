package fr.kaly.api.auth;

import fr.kaly.api.common.ApiException;
import fr.kaly.api.notification.NotificationService;
import fr.kaly.api.user.AppUser;
import fr.kaly.api.user.AppUserRepository;
import fr.kaly.api.user.Role;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.Locale;

@Service
public class AuthService {
    private final AppUserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final NotificationService notifications;

    public AuthService(
            AppUserRepository users,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            NotificationService notifications
    ) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.notifications = notifications;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String email = normalizeEmail(request.email());
        validatePassword(request.password());
        if (users.existsByEmail(email)) {
            throw new ApiException(HttpStatus.CONFLICT, "Cette adresse e-mail est déjà utilisée.");
        }
        AppUser user = users.save(new AppUser(
                request.displayName().trim(),
                email,
                passwordEncoder.encode(request.password()),
                Role.USER
        ));
        notifications.notifyUser(user.getId(), "Bienvenue sur Kaly", "Votre compte est prêt. Vous pouvez commencer à organiser vos documents.", "account");
        return createResponse(user);
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        AppUser user = users.findByEmail(normalizeEmail(request.email()))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Adresse e-mail ou mot de passe incorrect."));
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Adresse e-mail ou mot de passe incorrect.");
        }
        if (!user.isEnabled()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Adresse e-mail ou mot de passe incorrect.");
        }
        return createResponse(user);
    }

    @Transactional(readOnly = true)
    public UserResponse currentUser(String email) {
        return users.findByEmail(normalizeEmail(email))
                .filter(AppUser::isEnabled)
                .map(UserResponse::from)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Session invalide ou compte désactivé."));
    }

    private AuthResponse createResponse(AppUser user) {
        KalyPrincipal principal = KalyPrincipal.from(user);
        return new AuthResponse(jwtService.issueToken(principal), jwtService.getExpirationSeconds(), UserResponse.from(user));
    }

    private void validatePassword(String password) {
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Le mot de passe ne peut pas dépasser 72 octets UTF-8.");
        }
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
