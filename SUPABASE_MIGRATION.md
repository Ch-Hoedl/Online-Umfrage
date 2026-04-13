# Supabase Datenbank-Migration

## Erforderliche Änderungen für die erweiterte Benutzerregistrierung

### 1. Tabelle `profiles` erweitern

Führen Sie folgende SQL-Befehle in Supabase SQL Editor aus:

```sql
-- Neue Spalten hinzufügen
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Bestehende full_name Spalte aus first_name und last_name generieren (optional)
UPDATE profiles 
SET full_name = CONCAT(first_name, ' ', last_name)
WHERE first_name IS NOT NULL AND last_name IS NOT NULL AND full_name IS NULL;
```

### 2. Trigger für neue Benutzer aktualisieren

Aktualisieren Sie den Trigger, der beim Erstellen eines neuen Auth-Benutzers ein Profil anlegt:

```sql
-- Funktion zum Erstellen eines Profils bei Registrierung
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, full_name, role, approved)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    CONCAT(
      NEW.raw_user_meta_data->>'first_name',
      ' ',
      NEW.raw_user_meta_data->>'last_name'
    ),
    'user',
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger erstellen (falls noch nicht vorhanden)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 3. RLS Policies überprüfen

Stellen Sie sicher, dass die Row Level Security Policies die neuen Spalten berücksichtigen:

```sql
-- Benutzer können ihr eigenes Profil lesen
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Super-Admins können alle Profile sehen und bearbeiten
CREATE POLICY "Super admins can view all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can update all profiles" ON profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );
```

### 4. Bestehende Benutzer migrieren (optional)

Falls Sie bereits Benutzer haben, die nur `full_name` haben:

```sql
-- Versuchen, first_name und last_name aus full_name zu extrahieren
UPDATE profiles
SET 
  first_name = SPLIT_PART(full_name, ' ', 1),
  last_name = SUBSTRING(full_name FROM POSITION(' ' IN full_name) + 1)
WHERE first_name IS NULL 
  AND last_name IS NULL 
  AND full_name IS NOT NULL
  AND full_name LIKE '% %';
```

## Testen

Nach der Migration:

1. Registrieren Sie einen neuen Benutzer mit Vor- und Nachnamen
2. Überprüfen Sie in der Datenbank, ob alle Felder korrekt gesetzt wurden
3. Testen Sie die Benutzerverwaltung als Super-Admin
4. Überprüfen Sie, ob das letzte Login-Datum aktualisiert wird

## Rollback (falls nötig)

```sql
-- Spalten entfernen (VORSICHT: Datenverlust!)
ALTER TABLE profiles 
DROP COLUMN IF EXISTS first_name,
DROP COLUMN IF EXISTS last_name,
DROP COLUMN IF EXISTS last_login_at;
```
