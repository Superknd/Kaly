package fr.kaly.api.admin;

import fr.kaly.api.common.ApiException;
import fr.kaly.api.notification.NotificationService;
import fr.kaly.api.user.AppUser;
import fr.kaly.api.user.AppUserRepository;
import fr.kaly.api.user.Role;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;

@Service
public class AdminUserService {
    private final AppUserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final NotificationService notifications;

    public AdminUserService(
            AppUserRepository users,
            PasswordEncoder passwordEncoder,
            NotificationService notifications
    ) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.notifications = notifications;
    }

    @Transactional(readOnly = true)
    public List<AdminUserResponse> listUsers() {
        return users.findAll(PageRequest.of(0, 100)).getContent().stream()
                .map(AdminUserResponse::from)
                .toList();
    }

    @Transactional
    public AdminUserResponse createUser(CreateUserRequest request) {
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        String displayName = request.displayName().trim();
        if (displayName.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Le nom du compte est obligatoire.");
        }
        if (request.password().getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Le mot de passe ne peut pas dépasser 72 octets UTF-8.");
        }
        if (users.existsByEmail(email)) {
            throw new ApiException(HttpStatus.CONFLICT, "Cette adresse e-mail est déjà utilisée.");
        }
        AppUser user = users.save(new AppUser(
                displayName,
                email,
                passwordEncoder.encode(request.password()),
                request.role()
        ));
        notifications.notifyUser(user.getId(), "Compte Kaly créé", "Un administrateur a créé votre compte Kaly.", "account");
        return AdminUserResponse.from(user);
    }

    @Transactional
    public AdminUserResponse setEnabled(String actorId, String userId, boolean enabled) {
        AppUser user = users.findById(userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Compte utilisateur introuvable."));
        if (!enabled && actorId.equals(userId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Vous ne pouvez pas désactiver votre propre compte.");
        }
        if (!enabled && user.getRole() == Role.ADMIN && user.isEnabled()
                && users.countByRoleAndEnabledTrue(Role.ADMIN) <= 1) {
            throw new ApiException(HttpStatus.CONFLICT, "Le dernier compte administrateur actif ne peut pas être désactivé.");
        }
        if (user.isEnabled() != enabled) {
            user.setEnabled(enabled);
            users.saveAndFlush(user);
            notifications.notifyUser(
                    user.getId(),
                    enabled ? "Compte réactivé" : "Compte désactivé",
                    enabled
                            ? "Votre accès à Kaly a été réactivé par un administrateur."
                            : "Votre accès à Kaly a été désactivé par un administrateur.",
                    "account"
            );
        }
        return AdminUserResponse.from(user);
    }
}
