package fr.kaly.api.config;

import fr.kaly.api.user.AppUser;
import fr.kaly.api.user.AppUserRepository;
import fr.kaly.api.user.Role;
import fr.kaly.api.notification.NotificationService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.Locale;

@Component
@Profile({"dev", "local"})
@ConditionalOnProperty(name = "kaly.demo-accounts.enabled", havingValue = "true")
public class DemoAccountSeeder implements ApplicationRunner {
    private final AppUserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final NotificationService notifications;
    private final DemoAccount admin;
    private final DemoAccount user;

    public DemoAccountSeeder(
            AppUserRepository users,
            PasswordEncoder passwordEncoder,
            NotificationService notifications,
            @Value("${kaly.demo-accounts.admin-name:Kaly Admin}") String adminName,
            @Value("${kaly.demo-accounts.admin-email:admin@kaly.local}") String adminEmail,
            @Value("${kaly.demo-accounts.admin-password:}") String adminPassword,
            @Value("${kaly.demo-accounts.user-name:Kaly User}") String userName,
            @Value("${kaly.demo-accounts.user-email:user@kaly.local}") String userEmail,
            @Value("${kaly.demo-accounts.user-password:}") String userPassword
    ) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.notifications = notifications;
        this.admin = new DemoAccount(adminName, adminEmail, adminPassword);
        this.user = new DemoAccount(userName, userEmail, userPassword);
    }

    @Override
    public void run(ApplicationArguments args) {
        if (admin.email().trim().equalsIgnoreCase(user.email().trim())) {
            throw new IllegalStateException("Les adresses des comptes de démonstration admin et utilisateur doivent être différentes.");
        }
        validateIfMissing(admin);
        validateIfMissing(user);
        createIfMissing(admin, Role.ADMIN);
        createIfMissing(user, Role.USER);
    }

    private void validateIfMissing(DemoAccount account) {
        String email = account.email().trim().toLowerCase(Locale.ROOT);
        if (!users.existsByEmail(email) && account.password().length() < 12) {
            throw new IllegalStateException("Les mots de passe des comptes de démonstration doivent contenir au moins 12 caractères.");
        }
    }

    private void createIfMissing(DemoAccount account, Role role) {
        String email = account.email().trim().toLowerCase(Locale.ROOT);
        if (users.existsByEmail(email)) return;
        AppUser created = users.save(new AppUser(
                account.displayName(),
                email,
                passwordEncoder.encode(account.password()),
                role
        ));
        notifications.notifyUser(
                created.getId(),
                "Bienvenue sur Kaly",
                "Ce compte de démonstration a été créé pour vérifier les fonctions " + role.name() + " de Kaly.",
                "account"
        );
    }

    public record DemoAccount(String displayName, String email, String password) {
    }
}
