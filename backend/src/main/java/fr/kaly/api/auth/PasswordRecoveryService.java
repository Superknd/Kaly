package fr.kaly.api.auth;

import fr.kaly.api.common.ApiException;
import fr.kaly.api.notification.NotificationService;
import fr.kaly.api.user.AppUser;
import fr.kaly.api.user.AppUserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.UriComponentsBuilder;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;

@Service
public class PasswordRecoveryService {
    private static final Logger LOGGER = LoggerFactory.getLogger(PasswordRecoveryService.class);
    private static final Duration TOKEN_LIFETIME = Duration.ofMinutes(30);
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final AppUserRepository users;
    private final PasswordResetTokenRepository resetTokens;
    private final PasswordEncoder passwordEncoder;
    private final JavaMailSender mailSender;
    private final boolean enabled;
    private final String frontendUrl;
    private final String senderAddress;
    private final NotificationService notifications;

    public PasswordRecoveryService(
            AppUserRepository users,
            PasswordResetTokenRepository resetTokens,
            PasswordEncoder passwordEncoder,
            JavaMailSender mailSender,
            @Value("${kaly.password-reset.enabled:false}") boolean enabled,
            @Value("${kaly.password-reset.frontend-url:http://localhost:4200}") String frontendUrl,
            @Value("${kaly.mail.from:noreply@kaly.local}") String senderAddress,
            NotificationService notifications
    ) {
        this.users = users;
        this.resetTokens = resetTokens;
        this.passwordEncoder = passwordEncoder;
        this.mailSender = mailSender;
        this.enabled = enabled;
        this.frontendUrl = frontendUrl;
        this.senderAddress = senderAddress;
        this.notifications = notifications;
    }

    @Transactional
    public AuthMessageResponse requestReset(String email) {
        ensureEnabled();
        String normalizedEmail = email.trim().toLowerCase(Locale.ROOT);
        resetTokens.deleteAllByExpiresAtBefore(Instant.now());
        AppUser user = users.findByEmail(normalizedEmail).orElse(null);
        if (user == null) {
            return new AuthMessageResponse("Si un compte correspond à cette adresse, un lien de réinitialisation sera envoyé.");
        }

        resetTokens.deleteAllByUserId(user.getId());
        byte[] tokenBytes = new byte[32];
        SECURE_RANDOM.nextBytes(tokenBytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
        resetTokens.save(new PasswordResetToken(hash(token), user, Instant.now().plus(TOKEN_LIFETIME)));

        String resetUrl = UriComponentsBuilder.fromUriString(frontendUrl)
                .queryParam("resetToken", token)
                .build()
                .encode()
                .toUriString();
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(senderAddress);
        message.setTo(user.getEmail());
        message.setSubject("Réinitialisation de votre mot de passe Kaly");
        message.setText("""
                Bonjour %s,

                Une demande de réinitialisation du mot de passe de votre compte Kaly a été reçue.
                Utilisez ce lien dans les 30 prochaines minutes :

                %s

                Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.
                """.formatted(user.getDisplayName(), resetUrl));
        try {
            mailSender.send(message);
        } catch (MailException exception) {
            LOGGER.error("Unable to deliver a Kaly password-reset email.", exception);
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Le service d’envoi d’e-mails est indisponible. Réessayez plus tard.");
        }
        return new AuthMessageResponse("Si un compte correspond à cette adresse, un lien de réinitialisation sera envoyé.");
    }

    @Transactional
    public void confirmReset(String rawToken, String newPassword) {
        ensureEnabled();
        if (newPassword.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Le mot de passe ne peut pas dépasser 72 octets UTF-8.");
        }
        PasswordResetToken resetToken = resetTokens.findByTokenHash(hash(rawToken))
                .orElseThrow(this::invalidToken);
        Instant now = Instant.now();
        if (!resetToken.getExpiresAt().isAfter(now) || resetTokens.consumeIfActive(resetToken.getId(), now) != 1) {
            throw invalidToken();
        }

        AppUser user = users.findById(resetToken.getUser().getId())
                .orElseThrow(this::invalidToken);
        user.changePasswordHash(passwordEncoder.encode(newPassword));
        resetTokens.deleteAllByUserId(user.getId());
        notifications.notifyUser(user.getId(), "Mot de passe modifié", "Le mot de passe de votre compte Kaly a été modifié.", "security");
    }

    private void ensureEnabled() {
        if (!enabled) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "La récupération de mot de passe n’est pas configurée sur cette instance.");
        }
    }

    private ApiException invalidToken() {
        return new ApiException(HttpStatus.BAD_REQUEST, "Ce lien de réinitialisation est invalide ou a expiré.");
    }

    private String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 n’est pas disponible.", exception);
        }
    }
}
