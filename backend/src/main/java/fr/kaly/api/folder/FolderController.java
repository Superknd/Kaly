package fr.kaly.api.folder;

import fr.kaly.api.auth.KalyPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/folders")
public class FolderController {
    private final FolderService folderService;

    public FolderController(FolderService folderService) {
        this.folderService = folderService;
    }

    @GetMapping
    public List<FolderResponse> list(@AuthenticationPrincipal KalyPrincipal owner) {
        return folderService.list(owner);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public FolderResponse create(
            @Valid @RequestBody FolderRequest request,
            @AuthenticationPrincipal KalyPrincipal owner
    ) {
        return folderService.create(request.name(), owner);
    }

    @PutMapping("/{id}")
    public FolderResponse rename(
            @PathVariable String id,
            @Valid @RequestBody FolderRequest request,
            @AuthenticationPrincipal KalyPrincipal owner
    ) {
        return folderService.rename(id, request.name(), owner);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id, @AuthenticationPrincipal KalyPrincipal owner) {
        folderService.delete(id, owner);
    }
}
