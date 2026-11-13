package fr.kaly.api.config;

import fr.kaly.api.notification.NotificationService;
import fr.kaly.api.user.AppUser;
import fr.kaly.api.user.AppUserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DemoAccountSeederTests {
    @Test
    void validatesBothMissingAccountsBeforeCreatingEitherOne() {
        AppUserRepository users = mock(AppUserRepository.class);
        PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
        NotificationService notifications = mock(NotificationService.class);
        when(users.existsByEmail(anyString())).thenReturn(false);
        DemoAccountSeeder seeder = new DemoAccountSeeder(
                users,
                passwordEncoder,
                notifications,
                "Kaly Admin",
                "admin@kaly.local",
                "password54321",
                "Kaly User",
                "user@kaly.local",
                "kinda654321"
        );

        assertThrows(IllegalStateException.class, () -> seeder.run(new DefaultApplicationArguments()));

        verify(users, never()).save(any(AppUser.class));
        verify(passwordEncoder, never()).encode(anyString());
        verify(notifications, never()).notifyUser(anyString(), anyString(), anyString(), anyString());
    }
}
