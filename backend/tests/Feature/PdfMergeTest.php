<?php

namespace Tests\Feature;

use App\Services\PdfMergeService;
use Illuminate\Http\UploadedFile;
use setasign\Fpdi\Fpdi;
use Tests\TestCase;

class PdfMergeTest extends TestCase
{
    public function test_it_merges_a_pdf_and_a_png_into_a_valid_pdf(): void
    {
        $source = new Fpdi();
        $source->AddPage();
        $pdfBytes = $source->Output('S');
        $pngBytes = base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=',
            true,
        );

        $merged = app(PdfMergeService::class)->merge([
            UploadedFile::fake()->createWithContent('source.pdf', $pdfBytes),
            UploadedFile::fake()->createWithContent('scan.png', $pngBytes),
        ]);

        $this->assertStringStartsWith('%PDF-', $merged);
        $mergedFile = UploadedFile::fake()->createWithContent('merged.pdf', $merged);
        $result = new Fpdi();
        $this->assertSame(2, $result->setSourceFile($mergedFile->getRealPath()));
    }

    public function test_it_rejects_uploads_with_an_unsupported_signature(): void
    {
        $this->expectException(\App\Exceptions\ApiException::class);
        app(PdfMergeService::class)->merge([
            UploadedFile::fake()->createWithContent('first.txt', 'not a pdf'),
            UploadedFile::fake()->createWithContent('second.txt', 'not a pdf'),
        ]);
    }
}
