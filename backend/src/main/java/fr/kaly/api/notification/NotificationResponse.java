package fr.kaly.api.notification;

import java.time.Instant;

public record NotificationResponse(String id, String title, String message, String kind, Instant createdAt, Instant readAt) {
    static NotificationResponse from(UserNotification notification) {
        return new NotificationResponse(
                notification.getId(),
                notification.getTitle(),
                notification.getMessage(),
                notification.getKind(),
                notification.getCreatedAt(),
                notification.getReadAt()
        );
    }
}
