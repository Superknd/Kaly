package fr.kaly.api.pdf;

import fr.kaly.api.common.ApiException;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.List;
import javax.imageio.ImageIO;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class PdfProcessingServiceTests {
    private final PdfProcessingService service = new PdfProcessingService();

    @Test
    void mergesPdfsAndImagesIntoOneDocument() throws Exception {
        byte[] firstPdf = createPdf(2);
        byte[] secondPdf = createPdf(1);
        byte[] png = createPng();

        byte[] result = service.merge(List.of(
                new MockMultipartFile("files", "first.pdf", "application/pdf", firstPdf),
                new MockMultipartFile("files", "photo.png", "image/png", png),
                new MockMultipartFile("files", "second.pdf", "application/pdf", secondPdf)
        ));

        try (PDDocument merged = Loader.loadPDF(result)) {
            assertEquals(4, merged.getNumberOfPages());
        }
    }

    @Test
    void rejectsUnsupportedFiles() {
        MockMultipartFile executable = new MockMultipartFile("files", "file.exe", "application/octet-stream", new byte[]{1, 2, 3});

        assertThrows(ApiException.class, () -> service.merge(List.of(executable, executable)));
    }

    private byte[] createPdf(int pageCount) throws Exception {
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            for (int i = 0; i < pageCount; i++) document.addPage(new org.apache.pdfbox.pdmodel.PDPage());
            document.save(output);
            return output.toByteArray();
        }
    }

    private byte[] createPng() throws Exception {
        BufferedImage image = new BufferedImage(10, 10, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        ImageIO.write(image, "png", output);
        return output.toByteArray();
    }
}
