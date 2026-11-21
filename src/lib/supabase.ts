import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Routine = {
  id: string;
  name: string;
  time_of_day: string | null;
  sort_order: number;
  created_at: string;
};

export type RoutineLog = {
  id: string;
  routine_id: string;
  log_date: string;
  done: boolean;
  created_at: string;
};

export type Todo = {
  id: string;
  title: string;
  done: boolean;
  due_date: string | null;
  created_at: string;
};

export type Expense = {
  id: string;
  title: string;
  amount: number;
  category: string | null;
  spent_date: string;
  created_at: string;
};
