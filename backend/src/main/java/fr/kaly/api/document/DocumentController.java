package fr.kaly.api.document;

import fr.kaly.api.auth.KalyPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api/documents")
public class DocumentController {
    private final DocumentService documentService;

    public DocumentController(DocumentService documentService) {
        this.documentService = documentService;
    }

    @GetMapping
    public List<DocumentResponse> list(@AuthenticationPrincipal KalyPrincipal owner) {
        return documentService.list(owner);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<DocumentResponse> upload(
            @RequestPart("file") MultipartFile file,
            @AuthenticationPrincipal KalyPrincipal owner
    ) {
        return ResponseEntity.status(201).body(documentService.upload(file, owner));
    }

    @GetMapping("/{id}/content")
    public ResponseEntity<byte[]> download(
            @PathVariable String id,
            @AuthenticationPrincipal KalyPrincipal owner
    ) {
        Document document = documentService.getOwnedDocument(id, owner);
        byte[] content = documentService.readContent(document);
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(document.getOriginalFilename(), StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(document.getContentType()))
                .contentLength(content.length)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(content);
    }

    @PutMapping("/{id}/name")
    public DocumentResponse rename(
            @PathVariable String id,
            @Valid @RequestBody RenameDocumentRequest request,
            @AuthenticationPrincipal KalyPrincipal owner
    ) {
        return documentService.rename(id, request.name(), owner);
    }

    @PutMapping("/{id}/folder")
    public DocumentResponse move(
            @PathVariable String id,
            @Valid @RequestBody MoveDocumentRequest request,
            @AuthenticationPrincipal KalyPrincipal owner
    ) {
        return documentService.move(id, request.folderId(), owner);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @PathVariable String id,
            @AuthenticationPrincipal KalyPrincipal owner
    ) {
        documentService.delete(id, owner);
        return ResponseEntity.noContent().build();
    }
}
