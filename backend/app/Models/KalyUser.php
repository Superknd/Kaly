<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class KalyUser extends Model
{
    protected $table = 'app_users';
    protected $primaryKey = 'id';
    public $incrementing = false;
    public $timestamps = false;
    protected $keyType = 'string';
    protected $hidden = ['password_hash'];
    protected $guarded = [];

    protected function casts(): array
    {
        return ['enabled' => 'boolean', 'created_at' => 'immutable_datetime'];
    }
}
