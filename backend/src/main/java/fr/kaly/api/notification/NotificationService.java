package fr.kaly.api.notification;

import fr.kaly.api.common.ApiException;
import fr.kaly.api.user.AppUser;
import fr.kaly.api.user.AppUserRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Service
public class NotificationService {
    private final NotificationRepository notifications;
    private final AppUserRepository users;

    public NotificationService(NotificationRepository notifications, AppUserRepository users) {
        this.notifications = notifications;
        this.users = users;
    }

    @Transactional(readOnly = true)
    public List<NotificationResponse> list(String userId) {
        return notifications.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, 50))
                .stream()
                .map(NotificationResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public long unreadCount(String userId) {
        return notifications.countByUserIdAndReadAtIsNull(userId);
    }

    @Transactional
    public void markRead(String userId, String notificationId) {
        UserNotification notification = notifications.findByIdAndUserId(notificationId, userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Notification introuvable."));
        notification.markRead(Instant.now());
    }

    @Transactional
    public void markAllRead(String userId) {
        notifications.markAllRead(userId, Instant.now());
    }

    @Transactional
    public void notifyUser(String userId, String title, String message, String kind) {
        AppUser user = users.findById(userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Compte utilisateur introuvable."));
        notifications.save(new UserNotification(user, title, message, kind));
    }
}
