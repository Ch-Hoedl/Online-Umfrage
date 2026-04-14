# Kollaboratives Bearbeiten - Dokumentation

## Übersicht

Das System verhindert Datenverlust beim gleichzeitigen Bearbeiten von Vorlagen durch eine Kombination aus **Optimistic Locking** und **Edit-Lock**.

## Funktionsweise

### 1. **Edit-Lock (Soft-Lock)**

Wenn ein Benutzer eine Vorlage öffnet:
- ✅ `editing_by` wird auf die Benutzer-ID gesetzt
- ✅ `editing_since` wird auf den aktuellen Zeitstempel gesetzt
- ✅ Andere Benutzer sehen eine **Warnung**, dass die Vorlage gerade bearbeitet wird

**Warnung:**
```
⚠️ Wird gerade bearbeitet
[Name] bearbeitet diese Vorlage gerade. (seit X Minuten)
Sie können trotzdem Änderungen vornehmen, aber es kann zu Konflikten kommen.
```

### 2. **Optimistic Locking (Version-Check)**

Beim Speichern:
- ✅ Aktuelle Version wird aus der Datenbank geladen
- ✅ Verglichen mit der Version beim Öffnen
- ✅ Bei Konflikt → **Konflikt-Dialog** wird angezeigt

**Konflikt-Dialog bietet 3 Optionen:**

1. **Abbrechen und zurück**
   - Verwirft eigene Änderungen
   - Kehrt zum Dashboard zurück

2. **Neu laden und erneut bearbeiten**
   - Lädt die aktuelle Version
   - Benutzer kann Änderungen erneut vornehmen

3. **Als neue Kopie speichern**
   - Speichert eigene Änderungen als neue private Vorlage
   - Titel: "[Original-Titel] (Kopie)"

### 3. **Auto-Unlock**

**Automatische Freigabe nach 10 Minuten:**

#### Option A: Edge Function (empfohlen für Produktion)
```bash
# Manuell aufrufen:
curl -X POST https://[PROJECT-ID].supabase.co/functions/v1/cleanup-edit-locks \
  -H "Authorization: Bearer [ANON-KEY]"

# Oder als Cron-Job einrichten (z.B. alle 5 Minuten)
```

#### Option B: SQL-Funktion
```sql
-- Manuell aufrufen:
SELECT cleanup_stale_edit_locks();

-- Oder als pg_cron Job (wenn verfügbar):
SELECT cron.schedule(
  'cleanup-edit-locks',
  '*/5 * * * *', -- Alle 5 Minuten
  'SELECT cleanup_stale_edit_locks();'
);
```

### 4. **Lock-Freigabe beim Verlassen**

- ✅ Lock wird automatisch freigegeben beim Verlassen der Seite
- ✅ Lock wird freigegeben nach erfolgreichem Speichern
- ✅ Lock wird nur freigegeben, wenn der aktuelle Benutzer der Editor ist

## Datenbank-Schema

```sql
ALTER TABLE surveys 
ADD COLUMN version INTEGER DEFAULT 1,
ADD COLUMN editing_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN editing_since TIMESTAMP WITH TIME ZONE;
```

## Workflow-Beispiele

### Szenario 1: Normales Bearbeiten (kein Konflikt)

1. **Benutzer A** öffnet Vorlage
   - `editing_by` = Benutzer A
   - `version` = 5
2. **Benutzer A** speichert
   - Version-Check: 5 = 5 ✅
   - `version` = 6
   - `editing_by` = NULL
3. **Erfolg!**

### Szenario 2: Gleichzeitiges Bearbeiten mit Warnung

1. **Benutzer A** öffnet Vorlage
   - `editing_by` = Benutzer A
2. **Benutzer B** öffnet Vorlage
   - Sieht Warnung: "Wird gerade von Benutzer A bearbeitet"
   - Kann trotzdem bearbeiten
3. **Benutzer A** speichert zuerst
   - `version` = 6
   - `editing_by` = NULL
4. **Benutzer B** versucht zu speichern
   - Version-Check: 5 ≠ 6 ❌
   - **Konflikt-Dialog** erscheint
5. **Benutzer B** wählt Option:
   - **Option 1:** Abbrechen
   - **Option 2:** Neu laden (Version 6) und erneut bearbeiten
   - **Option 3:** Als neue Kopie speichern

### Szenario 3: Auto-Unlock nach Timeout

1. **Benutzer A** öffnet Vorlage
   - `editing_by` = Benutzer A
   - `editing_since` = 10:00 Uhr
2. **Benutzer A** vergisst zu speichern und schließt Browser
3. **10 Minuten später** (10:10 Uhr)
   - Cleanup-Funktion läuft
   - `editing_by` = NULL
   - `editing_since` = NULL
4. **Benutzer B** kann jetzt ohne Warnung bearbeiten

## Best Practices

### Für Administratoren:

1. **Cron-Job einrichten:**
   - Edge Function alle 5 Minuten aufrufen
   - Oder pg_cron verwenden (falls verfügbar)

2. **Monitoring:**
   - Logs der Cleanup-Funktion überwachen
   - Anzahl der freigegebenen Locks tracken

### Für Benutzer:

1. **Warnung beachten:**
   - Wenn jemand anderes bearbeitet, kurz warten
   - Oder Änderungen als Kopie speichern

2. **Regelmäßig speichern:**
   - Alle paar Minuten speichern
   - Verhindert Datenverlust bei Konflikten

3. **Bei Konflikt:**
   - **Option 2** wählen, wenn Änderungen wichtig sind
   - **Option 3** wählen, wenn beide Versionen behalten werden sollen

## Technische Details

### Version-Increment

```typescript
// Beim Speichern:
UPDATE surveys
SET version = version + 1,
    editing_by = NULL,
    editing_since = NULL
WHERE id = $1
  AND version = $2; -- Optimistic Lock
```

### Lock-Heartbeat

```typescript
// Alle 5 Minuten:
UPDATE surveys
SET editing_since = NOW()
WHERE id = $1
  AND editing_by = $2;
```

### Cleanup-Query

```sql
UPDATE surveys
SET editing_by = NULL,
    editing_since = NULL
WHERE editing_by IS NOT NULL
  AND editing_since < NOW() - INTERVAL '10 minutes';
```

## Fehlerbehebung

### Problem: Lock wird nicht freigegeben

**Lösung:**
```sql
-- Manuell alle Locks freigeben:
UPDATE surveys
SET editing_by = NULL,
    editing_since = NULL
WHERE editing_by IS NOT NULL;
```

### Problem: Zu viele Konflikte

**Lösung:**
- Timeout verkürzen (z.B. 5 Minuten statt 10)
- Cleanup-Intervall erhöhen (z.B. alle 2 Minuten)

### Problem: Warnung wird nicht angezeigt

**Lösung:**
- Prüfen, ob `editing_by` und `editing_since` korrekt gesetzt werden
- Browser-Cache leeren
- Seite neu laden

## Zukünftige Erweiterungen

### Phase 3 (optional):
- 🔄 Real-time Updates mit Supabase Realtime
- 👥 Live-Anzeige aller aktiven Editoren
- 💬 Chat-Funktion für Kollaboration
- 📝 Änderungshistorie mit Diff-Ansicht
