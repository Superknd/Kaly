package fr.kaly.api.auth;

import fr.kaly.api.user.Role;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.JwtException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;

@Service
public class JwtService {
    private final SecretKey key;
    private final Duration expiration;

    public JwtService(
            @Value("${kaly.jwt.secret}") String secret,
            @Value("${kaly.jwt.expiration:PT12H}") Duration expiration
    ) {
        byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length < 32) {
            throw new IllegalStateException("KALY_JWT_SECRET doit contenir au moins 32 caractères.");
        }
        this.key = new SecretKeySpec(keyBytes, "HmacSHA256");
        this.expiration = expiration;
    }

    public String issueToken(KalyPrincipal principal) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(principal.getUsername())
                .claim("role", principal.role().name())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(expiration)))
                .signWith(key)
                .compact();
    }

    public String getSubject(String token) {
        return claims(token).getSubject();
    }

    public Role getRole(String token) {
        return Role.valueOf(claims(token).get("role", String.class));
    }

    public long getExpirationSeconds() {
        return expiration.toSeconds();
    }

    private Claims claims(String token) throws JwtException {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
