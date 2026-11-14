<?php

namespace App\Services;

use App\Exceptions\ApiException;
use Illuminate\Http\UploadedFile;
use setasign\Fpdi\Fpdi;
use Throwable;

class PdfMergeService
{
    private const MAX_FILE_BYTES = 50 * 1024 * 1024;
    private const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
    private const MAX_TOTAL_IMAGE_PIXELS = 30_000_000;
    private const MAX_IMAGE_PIXELS = 15_000_000;
    private const MAX_FILES = 20;
    private const MAX_PAGES = 500;

    public function validatePdf(string $path): void
    {
        try {
            if ((new Fpdi())->setSourceFile($path) < 1) {
                throw new ApiException('Le PDF ne contient aucune page.', 400);
            }
        } catch (ApiException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            report($exception);
            throw new ApiException('Le fichier PDF est invalide ou ne peut pas être traité.', 400);
        }
    }

    public function validateImage(string $path, string $contentType): void
    {
        $this->imagePixelCount($path);

        try {
            $image = $contentType === 'image/png'
                ? imagecreatefrompng($path)
                : imagecreatefromjpeg($path);
            if ($image === false) {
                throw new ApiException('Le fichier image est invalide.', 400);
            }
            imagedestroy($image);
        } catch (ApiException $exception) {
            throw $exception;
        } catch (Throwable) {
            throw new ApiException('Le fichier image est invalide ou ne peut pas être traité.', 400);
        }
    }

    /**
     * @param array<UploadedFile> $files
     */
    public function merge(array $files): string
    {
        if (count($files) < 2) {
            throw new ApiException('Sélectionnez au moins deux fichiers à fusionner.', 400);
        }
        if (count($files) > self::MAX_FILES) {
            throw new ApiException('La fusion est limitée à 20 fichiers.', 413);
        }

        $totalBytes = 0;
        $totalImagePixels = 0;
        $totalPages = 0;
        $pdf = new Fpdi();

        try {
            foreach ($files as $file) {
                if (!$file->isValid() || $file->getSize() === 0) {
                    throw new ApiException('Un fichier sélectionné est vide ou invalide.', 400);
                }

                $size = (int) $file->getSize();
                if ($size > self::MAX_FILE_BYTES) {
                    throw new ApiException('Chaque fichier doit faire 50 Mo maximum.', 413);
                }
                $totalBytes += $size;
                if ($totalBytes > self::MAX_TOTAL_BYTES) {
                    throw new ApiException('La taille totale ne peut pas dépasser 100 Mo.', 413);
                }

                $path = $file->getRealPath();
                $contentType = $this->detectContentType($path);
                if ($contentType === 'application/pdf') {
                    $totalPages += $this->appendPdf($pdf, $path, self::MAX_PAGES - $totalPages);
                } else {
                    $pixels = $this->imagePixelCount($path);
                    $totalImagePixels += $pixels;
                    if ($totalImagePixels > self::MAX_TOTAL_IMAGE_PIXELS) {
                        throw new ApiException('Les images fusionnées ne peuvent pas dépasser 30 mégapixels au total.', 413);
                    }
                    if ($totalPages >= self::MAX_PAGES) {
                        throw new ApiException('La fusion est limitée à 500 pages.', 413);
                    }
                    $this->appendImage($pdf, $path, $contentType === 'image/png' ? 'PNG' : 'JPG');
                    $totalPages += 1;
                }

                if ($totalPages > self::MAX_PAGES) {
                    throw new ApiException('La fusion est limitée à 500 pages.', 413);
                }
            }

            return $pdf->Output('S');
        } catch (ApiException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            report($exception);
            throw new ApiException('Un des fichiers est invalide ou ne peut pas être traité.', 400);
        }
    }

    private function appendPdf(Fpdi $output, string $path, int $remainingPages): int
    {
        $pageCount = $output->setSourceFile($path);
        if ($pageCount > $remainingPages) {
            throw new ApiException('La fusion est limitée à 500 pages.', 413);
        }

        for ($page = 1; $page <= $pageCount; $page++) {
            $template = $output->importPage($page);
            $size = $output->getTemplateSize($template);
            $output->AddPage($size['orientation'], [$size['width'], $size['height']]);
            $output->useTemplate($template);
        }

        return $pageCount;
    }

    private function appendImage(Fpdi $pdf, string $path, string $type): void
    {
        $dimensions = getimagesize($path);
        if ($dimensions === false) {
            throw new ApiException('Un fichier image est invalide.', 400);
        }

        $landscape = $dimensions[0] > $dimensions[1];
        $pageWidth = $landscape ? 297.0 : 210.0;
        $pageHeight = $landscape ? 210.0 : 297.0;
        $scale = min($pageWidth / $dimensions[0], $pageHeight / $dimensions[1]);
        $width = $dimensions[0] * $scale;
        $height = $dimensions[1] * $scale;

        $pdf->AddPage($landscape ? 'L' : 'P', 'A4');
        $pdf->Image($path, ($pageWidth - $width) / 2, ($pageHeight - $height) / 2, $width, $height, $type);
    }

    private function imagePixelCount(string $path): int
    {
        $dimensions = getimagesize($path);
        if ($dimensions === false || $dimensions[0] <= 0 || $dimensions[1] <= 0) {
            throw new ApiException('Un fichier image est invalide.', 400);
        }

        $pixels = $dimensions[0] * $dimensions[1];
        if ($pixels > self::MAX_IMAGE_PIXELS) {
            throw new ApiException('Chaque image ne peut pas dépasser 15 mégapixels.', 413);
        }

        return $pixels;
    }

    private function detectContentType(string $path): string
    {
        $stream = fopen($path, 'rb');
        $signature = $stream === false ? false : fread($stream, 8);
        if (is_resource($stream)) {
            fclose($stream);
        }

        if (is_string($signature) && str_starts_with($signature, '%PDF-')) {
            return 'application/pdf';
        }
        if (is_string($signature) && str_starts_with($signature, "\x89PNG\r\n\x1a\n")) {
            return 'image/png';
        }
        if (is_string($signature) && strlen($signature) >= 3 && substr($signature, 0, 3) === "\xff\xd8\xff") {
            return 'image/jpeg';
        }

        throw new ApiException('Seuls les fichiers PDF, JPEG et PNG sont acceptés.', 415);
    }
}
