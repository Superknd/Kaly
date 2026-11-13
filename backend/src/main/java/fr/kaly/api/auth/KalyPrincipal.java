package fr.kaly.api.auth;

import fr.kaly.api.user.AppUser;
import fr.kaly.api.user.Role;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;

public record KalyPrincipal(String id, String email, String passwordHash, Role role, boolean enabled) implements UserDetails {
    static KalyPrincipal from(AppUser user) {
        return new KalyPrincipal(user.getId(), user.getEmail(), user.getPasswordHash(), user.getRole(), user.isEnabled());
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + role.name()));
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public boolean isEnabled() {
        return enabled;
    }
}
