package fr.kaly.api.admin;

import fr.kaly.api.auth.KalyPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin/users")
@PreAuthorize("hasRole('ADMIN')")
public class AdminUserController {
    private final AdminUserService users;

    public AdminUserController(AdminUserService users) {
        this.users = users;
    }

    @GetMapping
    public List<AdminUserResponse> listUsers() {
        return users.listUsers();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AdminUserResponse createUser(@Valid @RequestBody CreateUserRequest request) {
        return users.createUser(request);
    }

    @PatchMapping("/{id}/enabled")
    public AdminUserResponse setEnabled(
            @AuthenticationPrincipal KalyPrincipal actor,
            @PathVariable String id,
            @Valid @RequestBody SetUserEnabledRequest request
    ) {
        return users.setEnabled(actor.id(), id, request.enabled());
    }
}
