export interface Survey {
  id: string;
  title: string;
  description: string | null;
  created_by: string;
  is_active: boolean;
  status: 'draft' | 'published';
  max_votes: number | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  published_at?: string | null;
  visibility: 'private' | 'public';
  allow_copy: boolean;
  allow_edit: boolean;
}

export interface Question {
  id: string;
  survey_id: string;
  question_text: string;
  question_type: 'single' | 'multiple' | 'rating' | 'text' | 'longtext';
  order_index: number;
  expected_responses?: number;
  max_text_answers?: number | null;
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
  option_id: string | null;
  participant_id: string;
  text_response?: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  role: 'user' | 'admin' | 'super_admin';
  approved: boolean;
  created_at: string;
  last_login_at: string | null;
}
