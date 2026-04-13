# Auto-Unlock Einrichtung

## Übersicht

Das Auto-Unlock System gibt automatisch Edit-Locks frei, die älter als 10 Minuten sind. Dies verhindert, dass Vorlagen dauerhaft gesperrt bleiben, wenn Benutzer vergessen zu speichern oder den Browser schließen.

## Option 1: Supabase Cron (Empfohlen)

### Schritt 1: Supabase Dashboard öffnen

1. Gehe zu [Supabase Dashboard](https://supabase.com/dashboard)
2. Wähle dein Projekt aus
3. Navigiere zu **Database** → **Extensions**
4. Aktiviere die Extension **pg_cron**

### Schritt 2: Cron-Job erstellen

Führe folgendes SQL aus (im SQL Editor):

```sql
-- Cron-Job erstellen (läuft alle 5 Minuten)
SELECT cron.schedule(
  'cleanup-edit-locks',           -- Job-Name
  '*/5 * * * *',                  -- Alle 5 Minuten
  $$SELECT cleanup_stale_edit_locks();$$
);
```

### Schritt 3: Überprüfen

```sql
-- Alle Cron-Jobs anzeigen:
SELECT * FROM cron.job;

-- Job-Historie anzeigen:
SELECT * FROM cron.job_run_details 
WHERE jobname = 'cleanup-edit-locks'
ORDER BY start_time DESC
LIMIT 10;
```

### Schritt 4: Job löschen (falls nötig)

```sql
-- Job löschen:
SELECT cron.unschedule('cleanup-edit-locks');
```

---

## Option 2: Externe Cron-Job (Alternative)

Falls pg_cron nicht verfügbar ist, kannst du einen externen Cron-Job einrichten.

### Schritt 1: Edge Function URL

```
https://nmveysejndbibgpkfhmi.supabase.co/functions/v1/cleanup-edit-locks
```

### Schritt 2: Cron-Job einrichten

#### Linux/Mac (crontab):

```bash
# Crontab bearbeiten:
crontab -e

# Folgende Zeile hinzufügen (alle 5 Minuten):
*/5 * * * * curl -X POST https://nmveysejndbibgpkfhmi.supabase.co/functions/v1/cleanup-edit-locks -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdmV5c2VqbmRiaWJncGtmaG1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTI2NjUsImV4cCI6MjA4NDQ2ODY2NX0.5scWE3PXdNwFAR8ZD4Vz0u-bBjIxUudbOWCSxlwaVE8" > /dev/null 2>&1
```

#### Windows (Task Scheduler):

1. Öffne **Task Scheduler**
2. Erstelle neue Aufgabe:
   - **Name:** Cleanup Edit Locks
   - **Trigger:** Alle 5 Minuten
   - **Aktion:** Programm starten
   - **Programm:** `curl.exe`
   - **Argumente:**
     ```
     -X POST https://nmveysejndbibgpkfhmi.supabase.co/functions/v1/cleanup-edit-locks -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdmV5c2VqbmRiaWJncGtmaG1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTI2NjUsImV4cCI6MjA4NDQ2ODY2NX0.5scWE3PXdNwFAR8ZD4Vz0u-bBjIxUudbOWCSxlwaVE8"
     ```

#### Cloud-Dienste:

**EasyCron (kostenlos):**
1. Gehe zu [easycron.com](https://www.easycron.com)
2. Erstelle kostenlosen Account
3. Neue Cron-Job erstellen:
   - **URL:** `https://nmveysejndbibgpkfhmi.supabase.co/functions/v1/cleanup-edit-locks`
   - **Method:** POST
   - **Headers:** `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdmV5c2VqbmRiaWJncGtmaG1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTI2NjUsImV4cCI6MjA4NDQ2ODY2NX0.5scWE3PXdNwFAR8ZD4Vz0u-bBjIxUudbOWCSxlwaVE8`
   - **Interval:** Alle 5 Minuten

**cron-job.org (kostenlos):**
1. Gehe zu [cron-job.org](https://cron-job.org)
2. Erstelle kostenlosen Account
3. Neue Cron-Job erstellen:
   - **URL:** `https://nmveysejndbibgpkfhmi.supabase.co/functions/v1/cleanup-edit-locks`
   - **Schedule:** `*/5 * * * *`
   - **Request Method:** POST
   - **Headers:** `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdmV5c2VqbmRiaWJncGtmaG1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTI2NjUsImV4cCI6MjA4NDQ2ODY2NX0.5scWE3PXdNwFAR8ZD4Vz0u-bBjIxUudbOWCSxlwaVE8`

---

## Option 3: Manuell (für Tests)

### SQL-Funktion aufrufen:

```sql
SELECT cleanup_stale_edit_locks();
```

### Edge Function aufrufen:

```bash
curl -X POST https://nmveysejndbibgpkfhmi.supabase.co/functions/v1/cleanup-edit-locks \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdmV5c2VqbmRiaWJncGtmaG1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTI2NjUsImV4cCI6MjA4NDQ2ODY2NX0.5scWE3PXdNwFAR8ZD4Vz0u-bBjIxUudbOWCSxlwaVE8"
```

---

## Monitoring

### Logs überprüfen (Edge Function):

1. Gehe zu **Edge Functions** → **cleanup-edit-locks**
2. Klicke auf **Logs**
3. Suche nach:
   ```
   [cleanup-edit-locks] Released X stale locks
   ```

### Logs überprüfen (SQL):

```sql
-- Anzahl der aktuell gesperrten Vorlagen:
SELECT COUNT(*) 
FROM surveys 
WHERE editing_by IS NOT NULL;

-- Details der gesperrten Vorlagen:
SELECT 
  s.title,
  p.first_name || ' ' || p.last_name AS editor,
  s.editing_since,
  EXTRACT(EPOCH FROM (NOW() - s.editing_since))/60 AS minutes_locked
FROM surveys s
JOIN profiles p ON s.editing_by = p.id
WHERE s.editing_by IS NOT NULL
ORDER BY s.editing_since;
```

---

## Troubleshooting

### Problem: Cron-Job läuft nicht

**Lösung:**
```sql
-- Prüfen, ob pg_cron aktiviert ist:
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- Falls nicht aktiviert:
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

### Problem: Edge Function gibt Fehler zurück

**Lösung:**
1. Prüfe Edge Function Logs
2. Stelle sicher, dass `SUPABASE_SERVICE_ROLE_KEY` gesetzt ist
3. Teste manuell mit curl

### Problem: Locks werden nicht freigegeben

**Lösung:**
```sql
-- Manuell alle Locks freigeben:
UPDATE surveys
SET editing_by = NULL,
    editing_since = NULL
WHERE editing_by IS NOT NULL;

-- Dann Cleanup-Funktion testen:
SELECT cleanup_stale_edit_locks();
```

---

## Empfohlene Einstellungen

| Einstellung | Wert | Begründung |
|-------------|------|------------|
| **Timeout** | 10 Minuten | Balance zwischen Sicherheit und Benutzerfreundlichkeit |
| **Cleanup-Intervall** | 5 Minuten | Häufig genug, aber nicht zu viel Last |
| **Heartbeat** | 5 Minuten | Hält Lock aktiv bei aktiver Bearbeitung |

### Anpassungen:

**Kürzerer Timeout (5 Minuten):**
```sql
-- In cleanup_stale_edit_locks():
WHERE editing_since < NOW() - INTERVAL '5 minutes'
```

**Längerer Timeout (15 Minuten):**
```sql
-- In cleanup_stale_edit_locks():
WHERE editing_since < NOW() - INTERVAL '15 minutes'
```

---

## Zusammenfassung

✅ **Empfohlen:** Option 1 (Supabase Cron mit pg_cron)
- Einfach einzurichten
- Läuft automatisch
- Keine externe Abhängigkeit

✅ **Alternative:** Option 2 (Externe Cron-Jobs)
- Funktioniert immer
- Unabhängig von Supabase Extensions
- Kostenlose Cloud-Dienste verfügbar

⚠️ **Nur für Tests:** Option 3 (Manuell)
- Nicht für Produktion geeignet
- Gut zum Testen
