package fr.kaly.api.auth;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, String> {
    Optional<PasswordResetToken> findByTokenHash(String tokenHash);

    void deleteAllByUserId(String userId);

    void deleteAllByExpiresAtBefore(Instant now);

    @Modifying
    @Query("""
            update PasswordResetToken token
            set token.usedAt = :usedAt
            where token.id = :id and token.usedAt is null and token.expiresAt > :usedAt
            """)
    int consumeIfActive(@Param("id") String id, @Param("usedAt") Instant usedAt);
}
