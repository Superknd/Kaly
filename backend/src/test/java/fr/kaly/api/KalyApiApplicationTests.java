package fr.kaly.api;

import fr.kaly.api.user.AppUser;
import fr.kaly.api.user.AppUserRepository;
import fr.kaly.api.user.Role;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.mockito.ArgumentCaptor;

import java.io.ByteArrayOutputStream;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.mockito.Mockito.verify;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class KalyApiApplicationTests {
    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AppUserRepository users;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @MockitoBean
    private JavaMailSender mailSender;

    @Test
    void documentApiRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/documents"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void registrationReturnsJwtWithoutExposingPasswordHash() throws Exception {
        String email = "test-" + UUID.randomUUID() + "@example.test";
        String response = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "displayName": "Test Kaly",
                                  "email": "%s",
                                  "password": "un-mot-de-passe-solide"
                                }
                                """.formatted(email)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.user.email").value(email))
                .andExpect(jsonPath("$.user.passwordHash").doesNotExist())
                .andReturn()
                .getResponse()
                .getContentAsString();

        String token = response.replaceFirst("(?s).*\"token\":\"([^\"]+)\".*", "$1");
        mockMvc.perform(get("/api/documents").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());
    }

    @Test
    void registrationRejectsMalformedEmail() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "displayName": "Test Kaly",
                                  "email": "not-an-email",
                                  "password": "un-mot-de-passe-solide"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    @Test
    void sessionIdentityAndPersistentNotificationsBelongToTheirUser() throws Exception {
        String ownerToken = register("notification-owner");
        String otherToken = register("notification-other");

        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("USER"));

        String notifications = mockMvc.perform(get("/api/notifications")
                        .header("Authorization", "Bearer " + ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("Bienvenue sur Kaly"))
                .andExpect(jsonPath("$[0].readAt").value(nullValue()))
                .andReturn()
                .getResponse()
                .getContentAsString();
        String notificationId = notifications.replaceFirst("(?s).*\"id\":\"([^\"]+)\".*", "$1");

        mockMvc.perform(get("/api/notifications/unread-count")
                        .header("Authorization", "Bearer " + ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(1));
        mockMvc.perform(get("/api/notifications")
                        .header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(org.hamcrest.Matchers.not(notificationId)));
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(
                        "/api/notifications/" + notificationId + "/read")
                        .header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isNotFound());

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(
                        "/api/notifications/" + notificationId + "/read")
                        .header("Authorization", "Bearer " + ownerToken))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/notifications/unread-count")
                        .header("Authorization", "Bearer " + ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(0));
    }

    @Test
    void markingAllNotificationsReadUpdatesTheUnreadCount() throws Exception {
        String token = register("notification-read-all");

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(
                        "/api/notifications/read-all")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/notifications/unread-count")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(0));
    }

    @Test
    void notificationPatchRequestsAreAllowedByCors() throws Exception {
        mockMvc.perform(options("/api/notifications/read-all")
                        .header("Origin", "http://localhost:4200")
                        .header("Access-Control-Request-Method", "PATCH"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Methods", containsString("PATCH")));
    }

    @Test
    void onlyAdminsCanManageUsersAndCannotDisableTheirOwnAccount() throws Exception {
        String userToken = register("regular-user");
        mockMvc.perform(get("/api/admin/users").header("Authorization", "Bearer " + userToken))
                .andExpect(status().isForbidden());

        AppUser admin = users.save(new AppUser(
                "Test Admin",
                "admin-" + UUID.randomUUID() + "@example.test",
                passwordEncoder.encode("an-admin-password"),
                Role.ADMIN
        ));
        String adminToken = login(admin.getEmail(), "an-admin-password");

        mockMvc.perform(get("/api/admin/users").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.role == 'ADMIN')]").exists())
                .andExpect(jsonPath("$[?(@.passwordHash)]").doesNotExist());
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(
                        "/api/admin/users/" + admin.getId() + "/enabled")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\":false}"))
                .andExpect(status().isBadRequest());
        AppUser target = users.save(new AppUser(
                "Target User",
                "target-" + UUID.randomUUID() + "@example.test",
                passwordEncoder.encode("target-user-password"),
                Role.USER
        ));
        String targetToken = login(target.getEmail(), "target-user-password");
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(
                        "/api/admin/users/" + target.getId() + "/enabled")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(false));
        org.junit.jupiter.api.Assertions.assertFalse(
                users.findById(target.getId()).orElseThrow().isEnabled()
        );
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"target-user-password\"}".formatted(target.getEmail())))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/documents").header("Authorization", "Bearer " + targetToken))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void adminsCanCreateUsersButPublicRegistrationCannotChooseAdminRole() throws Exception {
        AppUser admin = users.save(new AppUser(
                "Create Admin",
                "creator-" + UUID.randomUUID() + "@example.test",
                passwordEncoder.encode("creator-admin-password"),
                Role.ADMIN
        ));
        String adminToken = login(admin.getEmail(), "creator-admin-password");
        String email = "managed-" + UUID.randomUUID() + "@example.test";

        mockMvc.perform(post("/api/admin/users")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "displayName": "Managed User",
                                  "email": "%s",
                                  "password": "managed-account-password",
                                  "role": "USER"
                                }
                                """.formatted(email)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value(email))
                .andExpect(jsonPath("$.role").value("USER"))
                .andExpect(jsonPath("$.enabled").value(true));

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "displayName": "Public Admin",
                                  "email": "public-admin-%s@example.test",
                                  "password": "another-secure-password",
                                  "role": "ADMIN"
                                }
                                """.formatted(UUID.randomUUID())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.user.role").value("USER"));
    }

    @Test
    void usersCannotAccessAnotherUsersDocuments() throws Exception {
        String ownerToken = register("owner");
        String otherToken = register("other");
        MockMultipartFile file = new MockMultipartFile("file", "private.pdf", "application/pdf", createPdf());

        String uploadResponse = mockMvc.perform(multipart("/api/documents")
                        .file(file)
                        .header("Authorization", "Bearer " + ownerToken))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("private.pdf"))
                .andReturn()
                .getResponse()
                .getContentAsString();
        String documentId = uploadResponse.replaceFirst("(?s).*\"id\":\"([^\"]+)\".*", "$1");

        mockMvc.perform(get("/api/documents/" + documentId + "/content")
                        .header("Authorization", "Bearer " + ownerToken))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_PDF));

        mockMvc.perform(get("/api/documents/" + documentId + "/content")
                        .header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isNotFound());

        mockMvc.perform(delete("/api/documents/" + documentId)
                        .header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isNotFound());
    }

    @Test
    void folderOwnershipIsEnforcedAndDeletingFolderKeepsDocuments() throws Exception {
        String ownerToken = register("folder-owner");
        String otherToken = register("folder-other");
        String folderResponse = mockMvc.perform(post("/api/folders")
                        .header("Authorization", "Bearer " + ownerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Factures\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Factures"))
                .andReturn()
                .getResponse()
                .getContentAsString();
        String folderId = folderResponse.replaceFirst("(?s).*\"id\":\"([^\"]+)\".*", "$1");

        String uploadResponse = mockMvc.perform(multipart("/api/documents")
                        .file(new MockMultipartFile("file", "invoice.pdf", "application/pdf", createPdf()))
                        .header("Authorization", "Bearer " + ownerToken))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String documentId = uploadResponse.replaceFirst("(?s).*\"id\":\"([^\"]+)\".*", "$1");

        String otherUpload = mockMvc.perform(multipart("/api/documents")
                        .file(new MockMultipartFile("file", "other.pdf", "application/pdf", createPdf()))
                        .header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String otherDocumentId = otherUpload.replaceFirst("(?s).*\"id\":\"([^\"]+)\".*", "$1");

        mockMvc.perform(put("/api/documents/" + otherDocumentId + "/folder")
                        .header("Authorization", "Bearer " + otherToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"folderId\":\"%s\"}".formatted(folderId)))
                .andExpect(status().isNotFound());

        mockMvc.perform(put("/api/documents/" + documentId + "/folder")
                        .header("Authorization", "Bearer " + ownerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"folderId\":\"%s\"}".formatted(folderId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.folderId").value(folderId));

        mockMvc.perform(delete("/api/folders/" + folderId)
                        .header("Authorization", "Bearer " + ownerToken))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/documents")
                        .header("Authorization", "Bearer " + ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].folderId").value(nullValue()));
    }

    @Test
    void passwordResetTokenIsSingleUseAndChangesThePassword() throws Exception {
        String email = "reset-" + UUID.randomUUID() + "@example.test";
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "displayName": "Reset Test",
                                  "email": "%s",
                                  "password": "ancien-mot-de-passe"
                                }
                                """.formatted(email)))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/auth/password-reset")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\"}".formatted(email)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.message").isNotEmpty());

        ArgumentCaptor<SimpleMailMessage> mail = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(mail.capture());
        String resetToken = mail.getValue().getText().replaceFirst("(?s).*resetToken=([A-Za-z0-9_-]+).*", "$1");
        org.junit.jupiter.api.Assertions.assertEquals(43, resetToken.length());

        mockMvc.perform(post("/api/auth/password-reset/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"%s\",\"password\":\"nouveau-mot-de-passe\"}".formatted(resetToken)))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"nouveau-mot-de-passe\"}".formatted(email)))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/auth/password-reset/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"%s\",\"password\":\"autre-mot-de-passe\"}".formatted(resetToken)))
                .andExpect(status().isBadRequest());
    }

    private String register(String prefix) throws Exception {
        String email = prefix + "-" + UUID.randomUUID() + "@example.test";
        String response = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "displayName": "Test Kaly",
                                  "email": "%s",
                                  "password": "un-mot-de-passe-solide"
                                }
                                """.formatted(email)))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return response.replaceFirst("(?s).*\"token\":\"([^\"]+)\".*", "$1");
    }

    private String login(String email, String password) throws Exception {
        String response = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password)))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return response.replaceFirst("(?s).*\"token\":\"([^\"]+)\".*", "$1");
    }

    private byte[] createPdf() throws Exception {
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            document.addPage(new PDPage());
            document.save(output);
            return output.toByteArray();
        }
    }
}
