package fr.kaly.api.pdf;

import fr.kaly.api.common.ApiException;
import org.apache.pdfbox.io.IOUtils;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.io.RandomAccessReadBuffer;
import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

@Service
public class PdfProcessingService {
    private static final long MAX_FILE_BYTES = 50L * 1024 * 1024;
    private static final long MAX_TOTAL_BYTES = 100L * 1024 * 1024;
    private static final long MAX_TOTAL_IMAGE_PIXELS = 30_000_000;
    private static final int MAX_FILES = 20;
    private static final int MAX_PAGES = 500;
    private static final int MAX_IMAGE_PIXELS = 15_000_000;

    public String detectAndValidate(byte[] bytes) {
        try {
            if (isPdf(bytes)) {
                try (PDDocument pdf = Loader.loadPDF(bytes)) {
                    if (pdf.getNumberOfPages() == 0) {
                        throw new ApiException(HttpStatus.BAD_REQUEST, "Le PDF ne contient aucune page.");
                    }
                }
                return "application/pdf";
            }
            if (isJpeg(bytes)) {
                readImage(bytes);
                return "image/jpeg";
            }
            if (isPng(bytes)) {
                readImage(bytes);
                return "image/png";
            }
            throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Seuls les fichiers PDF, JPEG et PNG sont acceptés.");
        } catch (ApiException exception) {
            throw exception;
        } catch (IOException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Le fichier est invalide ou ne peut pas être traité.");
        }
    }

    public byte[] merge(List<MultipartFile> files) {
        if (files == null || files.size() < 2) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Sélectionnez au moins deux fichiers à fusionner.");
        }
        if (files.size() > MAX_FILES) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "La fusion est limitée à 20 fichiers.");
        }

        List<byte[]> sources = new ArrayList<>(files.size());
        long totalBytes = 0;
        long totalImagePixels = 0;
        int totalPages = 0;
        try {
            for (MultipartFile file : files) {
                if (file.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "Un fichier sélectionné est vide.");
                if (file.getSize() > MAX_FILE_BYTES) {
                    throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "Chaque fichier doit faire 50 Mo maximum.");
                }
                totalBytes += file.getSize();
                if (totalBytes > MAX_TOTAL_BYTES) {
                    throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "La taille totale ne peut pas dépasser 100 Mo.");
                }
                byte[] bytes = file.getBytes();
                if (isPdf(bytes)) {
                    try (PDDocument pdf = Loader.loadPDF(bytes)) {
                        totalPages += pdf.getNumberOfPages();
                    }
                    sources.add(bytes);
                } else if (isJpeg(bytes) || isPng(bytes)) {
                    totalImagePixels += imagePixelCount(bytes);
                    if (totalImagePixels > MAX_TOTAL_IMAGE_PIXELS) {
                        throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "Les images fusionnées ne peuvent pas dépasser 30 mégapixels au total.");
                    }
                    sources.add(imageToPdf(bytes));
                    totalPages++;
                } else {
                    throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Seuls les PDF, JPEG et PNG sont acceptés.");
                }
                if (totalPages > MAX_PAGES) {
                    throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "La fusion est limitée à 500 pages.");
                }
            }

            PDFMergerUtility merger = new PDFMergerUtility();
            sources.forEach(source -> merger.addSource(new RandomAccessReadBuffer(source)));
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            merger.setDestinationStream(output);
            merger.mergeDocuments(IOUtils.createTempFileOnlyStreamCache());
            return output.toByteArray();
        } catch (ApiException exception) {
            throw exception;
        } catch (IOException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Un des fichiers est invalide ou ne peut pas être traité.");
        }
    }

    private byte[] imageToPdf(byte[] bytes) throws IOException {
        BufferedImage image = readImage(bytes);
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            float pageWidth = PDRectangle.A4.getWidth();
            float pageHeight = PDRectangle.A4.getHeight();
            if ((double) image.getWidth() / image.getHeight() > pageWidth / pageHeight) {
                float swap = pageWidth;
                pageWidth = pageHeight;
                pageHeight = swap;
            }
            PDPage page = new PDPage(new PDRectangle(pageWidth, pageHeight));
            document.addPage(page);
            PDImageXObject pdfImage = LosslessFactory.createFromImage(document, image);
            float scale = Math.min(pageWidth / image.getWidth(), pageHeight / image.getHeight());
            float width = image.getWidth() * scale;
            float height = image.getHeight() * scale;
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.drawImage(pdfImage, (pageWidth - width) / 2, (pageHeight - height) / 2, width, height);
            }
            document.save(output);
            return output.toByteArray();
        }
    }

    private BufferedImage readImage(byte[] bytes) throws IOException {
        try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            if (input == null) throw new IOException("Image non reconnue.");
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw new IOException("Image non reconnue.");
            ImageReader reader = readers.next();
            try {
                reader.setInput(input, true, true);
                validateImageDimensions(reader.getWidth(0), reader.getHeight(0));
                return reader.read(0);
            } finally {
                reader.dispose();
            }
        }
    }

    private long imagePixelCount(byte[] bytes) throws IOException {
        try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            if (input == null) throw new IOException("Image non reconnue.");
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw new IOException("Image non reconnue.");
            ImageReader reader = readers.next();
            try {
                reader.setInput(input, true, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                validateImageDimensions(width, height);
                return (long) width * height;
            } finally {
                reader.dispose();
            }
        }
    }

    private void validateImageDimensions(int width, int height) {
        if (width <= 0 || height <= 0 || (long) width * height > MAX_IMAGE_PIXELS) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "Chaque image ne peut pas dépasser 15 mégapixels.");
        }
    }

    private boolean isPdf(byte[] bytes) {
        return bytes.length >= 5 &&
                bytes[0] == '%' && bytes[1] == 'P' && bytes[2] == 'D' && bytes[3] == 'F' && bytes[4] == '-';
    }

    private boolean isJpeg(byte[] bytes) {
        return bytes.length >= 3 &&
                (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8 && (bytes[2] & 0xFF) == 0xFF;
    }

    private boolean isPng(byte[] bytes) {
        byte[] signature = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};
        if (bytes.length < signature.length) return false;
        for (int i = 0; i < signature.length; i++) {
            if (bytes[i] != signature[i]) return false;
        }
        return true;
    }
}
