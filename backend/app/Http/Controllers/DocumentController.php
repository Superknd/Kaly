<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\Document;
use App\Models\Folder;
use App\Models\KalyUser;
use App\Services\PdfMergeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class DocumentController extends Controller
{
    public function __construct(private readonly PdfMergeService $pdfs)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $user = $this->user($request);
        $documents = Document::query()
            ->where('owner_id', $user->id)
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (Document $document): array => $this->documentResponse($document));

        return response()->json($documents);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate(['file' => ['required', 'file', 'max:51200']]);
        $file = $request->file('file');
        if (!$file || !$file->isValid()) {
            throw new ApiException('Le fichier n’a pas pu être lu.', 400);
        }

        $size = (int) $file->getSize();
        if ($size === 0) {
            throw new ApiException('Le fichier est vide.', 400);
        }
        if ($size > 50 * 1024 * 1024) {
            throw new ApiException('La taille maximale par fichier est de 50 Mo.', 413);
        }

        $contentType = $this->detectContentType($file->getRealPath());
        if ($contentType === 'application/pdf') {
            $this->pdfs->validatePdf($file->getRealPath());
        } else {
            $this->pdfs->validateImage($file->getRealPath(), $contentType);
        }
        $filename = $this->safeFilename($file->getClientOriginalName());
        $user = $this->user($request);
        $storageKey = (string) Str::uuid();
        $disk = Storage::disk('kaly-documents');
        $stream = fopen($file->getRealPath(), 'rb');

        if ($stream === false || !$disk->put($storageKey, $stream)) {
            if (is_resource($stream)) {
                fclose($stream);
            }
            throw new ApiException('Le fichier n’a pas pu être enregistré.', 500);
        }
        fclose($stream);

        try {
            $document = DB::transaction(function () use ($user, $filename, $contentType, $size, $storageKey): Document {
                return Document::query()->create([
                    'id' => (string) Str::uuid(),
                    'original_filename' => $filename,
                    'storage_key' => $storageKey,
                    'content_type' => $contentType,
                    'size_bytes' => $size,
                    'created_at' => now(),
                    'modified_at' => now(),
                    'owner_id' => $user->id,
                ]);
            });
        } catch (Throwable $exception) {
            $disk->delete($storageKey);
            throw $exception;
        }

        return response()->json($this->documentResponse($document), 201);
    }

    public function content(Request $request, string $id): StreamedResponse
    {
        $document = $this->ownedDocument($id, $this->user($request));
        $disk = Storage::disk('kaly-documents');

        if (!$disk->exists($document->storage_key)) {
            throw new ApiException('Le fichier associé à ce document est introuvable.', 404);
        }

        $filename = rawurlencode($document->original_filename);
        return response()->stream(function () use ($disk, $document): void {
            $stream = $disk->readStream($document->storage_key);
            if (!is_resource($stream)) {
                throw new ApiException('Le fichier associé à ce document est introuvable.', 404);
            }
            try {
                fpassthru($stream);
            } finally {
                fclose($stream);
            }
        }, 200, [
            'Content-Type' => $document->content_type,
            'Content-Length' => (string) $document->size_bytes,
            'Content-Disposition' => "attachment; filename*=UTF-8''{$filename}",
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function rename(Request $request, string $id): JsonResponse
    {
        $input = $request->validate(['name' => ['required', 'string', 'max:255']]);
        $document = $this->ownedDocument($id, $this->user($request));
        $document->original_filename = $this->safeFilename($input['name']);
        $document->modified_at = now();
        $document->save();

        return response()->json($this->documentResponse($document));
    }

    public function move(Request $request, string $id): JsonResponse
    {
        $input = $request->validate([
            'folderId' => ['sometimes', 'nullable', 'string', 'max:36'],
        ]);
        $user = $this->user($request);
        $document = $this->ownedDocument($id, $user);
        $folderId = $input['folderId'] ?? null;

        if ($folderId !== null && $folderId !== '') {
            $folder = Folder::query()
                ->whereKey($folderId)
                ->where('owner_id', $user->id)
                ->first();
            if (!$folder) {
                throw new ApiException('Dossier introuvable.', 404);
            }
            $document->folder_id = $folder->id;
        } else {
            $document->folder_id = null;
        }

        $document->modified_at = now();
        $document->save();

        return response()->json($this->documentResponse($document));
    }

    public function destroy(Request $request, string $id): \Illuminate\Http\Response
    {
        $document = $this->ownedDocument($id, $this->user($request));
        $disk = Storage::disk('kaly-documents');
        if ($disk->exists($document->storage_key) && !$disk->delete($document->storage_key)) {
            throw new ApiException('Le fichier n’a pas pu être supprimé.', 500);
        }
        $document->delete();

        return response()->noContent();
    }

    private function user(Request $request): KalyUser
    {
        return $request->attributes->get('kalyUser');
    }

    private function ownedDocument(string $id, KalyUser $user): Document
    {
        $document = Document::query()
            ->whereKey($id)
            ->where('owner_id', $user->id)
            ->first();

        if (!$document) {
            throw new ApiException('Document introuvable.', 404);
        }

        return $document;
    }

    private function documentResponse(Document $document): array
    {
        return [
            'id' => $document->id,
            'name' => $document->original_filename,
            'contentType' => $document->content_type,
            'sizeBytes' => $document->size_bytes,
            'createdAt' => $document->created_at?->toISOString(),
            'modifiedAt' => $document->modified_at?->toISOString(),
            'folderId' => $document->folder_id,
        ];
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

    private function safeFilename(?string $filename): string
    {
        if ($filename === null || trim($filename) === '') {
            throw new ApiException('Le nom du fichier est obligatoire.', 400);
        }
        $basename = basename(str_replace('\\', '/', $filename));
        $basename = preg_replace('/[\x00-\x1F\x7F<>:"|?*]/u', '-', $basename);
        $basename = trim($basename ?? '');

        if ($basename === '' || mb_strlen($basename) > 255) {
            throw new ApiException('Le nom du fichier doit contenir de 1 à 255 caractères.', 400);
        }

        return $basename;
    }
}
