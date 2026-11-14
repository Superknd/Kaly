<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Models\Folder;
use App\Models\KalyUser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class FolderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $folders = Folder::query()
            ->where('owner_id', $this->user($request)->id)
            ->orderBy('name')
            ->get()
            ->map(fn (Folder $folder): array => $this->folderResponse($folder));

        return response()->json($folders);
    }

    public function store(Request $request): JsonResponse
    {
        $input = $request->validate(['name' => ['required', 'string', 'max:100']]);
        $name = $this->normalizeName($input['name']);
        $user = $this->user($request);

        if (Folder::query()->where('owner_id', $user->id)->where('name', $name)->exists()) {
            throw new ApiException('Un dossier de ce nom existe déjà.', 409);
        }

        $folder = Folder::query()->create([
            'id' => (string) Str::uuid(),
            'name' => $name,
            'created_at' => now(),
            'owner_id' => $user->id,
        ]);

        return response()->json($this->folderResponse($folder), 201);
    }

    public function rename(Request $request, string $id): JsonResponse
    {
        $input = $request->validate(['name' => ['required', 'string', 'max:100']]);
        $folder = $this->ownedFolder($id, $this->user($request));
        $name = $this->normalizeName($input['name']);

        if ($folder->name !== $name && Folder::query()
            ->where('owner_id', $folder->owner_id)
            ->where('name', $name)
            ->exists()) {
            throw new ApiException('Un dossier de ce nom existe déjà.', 409);
        }

        $folder->name = $name;
        $folder->save();

        return response()->json($this->folderResponse($folder));
    }

    public function destroy(Request $request, string $id): \Illuminate\Http\Response
    {
        $folder = $this->ownedFolder($id, $this->user($request));
        DB::transaction(function () use ($folder): void {
            DB::table('documents')
                ->where('folder_id', $folder->id)
                ->update(['folder_id' => null, 'modified_at' => now()]);
            $folder->delete();
        });

        return response()->noContent();
    }

    private function user(Request $request): KalyUser
    {
        return $request->attributes->get('kalyUser');
    }

    private function ownedFolder(string $id, KalyUser $user): Folder
    {
        $folder = Folder::query()->whereKey($id)->where('owner_id', $user->id)->first();
        if (!$folder) {
            throw new ApiException('Dossier introuvable.', 404);
        }

        return $folder;
    }

    private function folderResponse(Folder $folder): array
    {
        return [
            'id' => $folder->id,
            'name' => $folder->name,
            'createdAt' => $folder->created_at?->toISOString(),
        ];
    }

    private function normalizeName(string $name): string
    {
        $name = trim($name);
        if ($name === '' || mb_strlen($name) > 100 || preg_match('/[\x00-\x1F\x7F]/u', $name)) {
            throw new ApiException('Le nom du dossier doit contenir au maximum 100 caractères.', 400);
        }

        return $name;
    }
}
