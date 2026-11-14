<?php

namespace App\Http\Controllers;

use App\Services\PdfMergeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class PdfController extends Controller
{
    public function __construct(private readonly PdfMergeService $pdfs)
    {
    }

    public function merge(Request $request): Response|JsonResponse
    {
        $input = $request->validate([
            'files' => ['required', 'array', 'min:2', 'max:20'],
            'files.*' => ['required', 'file', 'max:51200'],
        ]);
        $pdf = $this->pdfs->merge($input['files']);

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Length' => (string) strlen($pdf),
            'Content-Disposition' => 'attachment; filename="kaly-fusion.pdf"',
        ]);
    }
}
