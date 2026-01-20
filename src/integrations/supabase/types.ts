export interface Survey {
  id: string;
  title: string;
  description: string | null;
  created_by: string;
  is_active: boolean;
  /** Maximale Anzahl an Teilnehmern/Stimmen (null = kein Limit). Kann in der DB fehlen und wird dann aus Meta gelesen. */
  max_votes?: number | null;
  /** Ablaufdatum/Zeitpunkt, ab dem nicht mehr abgestimmt werden kann. Kann in der DB fehlen und wird dann aus Meta gelesen. */
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Question {
  id: string;
  survey_id: string;
  question_text: string;
  /** 'text' wird client-seitig genutzt und beim Speichern als Meta abgebildet. */
  question_type: 'single' | 'multiple' | 'rating' | 'text';
  order_index: number;
  created_at: string;
}

export interface Option {
  id: string;
  question_id: string;
  option_text: string;
  order_index: number;
  created_at: string;
}

export interface Response {
  id: string;
  question_id: string;
  option_id: string;
  participant_id: string;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: 'user' | 'admin' | 'super_admin';
  created_at: string;
}