package fr.kaly.api.notification;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface NotificationRepository extends JpaRepository<UserNotification, String> {
    List<UserNotification> findByUserIdOrderByCreatedAtDesc(String userId, Pageable pageable);
    long countByUserIdAndReadAtIsNull(String userId);
    Optional<UserNotification> findByIdAndUserId(String id, String userId);

    @Modifying
    @Query("update UserNotification n set n.readAt = :readAt where n.user.id = :userId and n.readAt is null")
    int markAllRead(@Param("userId") String userId, @Param("readAt") Instant readAt);
}
