# Setup User Pertama (Admin)

Karena Finrok sekarang pakai auth, kamu perlu buat user admin pertama via Supabase Dashboard.

## Langkah:

1. Buka https://supabase.com/dashboard/project/luljlelroruiizyetoub/auth/users
2. Klik **"Add user"** → **"Create new user"**
3. Isi:
   - Email: `tony@roketin.com` (atau email kamu)
   - Password: (pilih password kuat)
   - ✅ Centang "Auto Confirm User"
4. Klik **Create User**

## Set sebagai Admin:

Setelah user dibuat, jalankan SQL ini di Supabase SQL Editor:
```sql
UPDATE public.user_profiles 
SET role = 'admin' 
WHERE email = 'tony@roketin.com';  -- ganti dengan email kamu
```

## Buat User Lain (opsional):

Ulangi langkah di atas untuk user lain.
Role options: `admin`, `finance`, `viewer`

```sql
-- Contoh set user lain jadi finance
UPDATE public.user_profiles SET role = 'finance' WHERE email = 'finance@roketin.com';
```
