package fr.kaly.api.auth;

import fr.kaly.api.user.AppUserRepository;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class KalyUserDetailsService implements UserDetailsService {
    private final AppUserRepository users;

    public KalyUserDetailsService(AppUserRepository users) {
        this.users = users;
    }

    @Override
    public UserDetails loadUserByUsername(String email) {
        return users.findByEmail(email)
                .map(KalyPrincipal::from)
                .orElseThrow(() -> new UsernameNotFoundException("Utilisateur introuvable."));
    }
}
