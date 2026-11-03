import { Language } from '../services/language';

/** A page of question-bank items with the total match count. */
export interface ContentList<T> {
  total: number;
  items: T[];
}

/** Reading item summary for the bank browser. */
export interface ReadingSummary {
  id: string;
  level: number;
  topic: string;
  passage: string;
  question: string;
  source: string;
  language: Language;
}

/** Listening item summary for the bank browser. */
export interface ListeningSummary {
  id: string;
  level: number;
  topic: string;
  conversationType: string;
  setting?: string | null;
  audioPath?: string | null;
  questionCount: number;
  source: string;
  language: Language;
}

/** Writing task summary for the bank browser. */
export interface WritingSummary {
  id: string;
  taskType: string;
  stanagLevel: number;
  title: string;
  instructions: string;
  wordCountMin: number;
  wordCountMax: number;
  source: string;
  language: Language;
}
