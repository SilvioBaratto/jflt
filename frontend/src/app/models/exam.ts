/** One reading option as shown to the candidate (no key/rationale). */
export interface ReadingOption {
  label: string;
  text: string;
}

/** A reading MCQ item presented in a session. */
export interface ReadingItem {
  id: string;
  level: number;
  topic: string;
  passage: string;
  question: string;
  options: ReadingOption[];
}

/** A listening comprehension question (options only, no key). */
export interface ListeningQuestion {
  question: string;
  options: Record<string, string>;
}

/** A listening item: conversation transcript, audio, and questions. */
export interface ListeningItem {
  id: string;
  level: number;
  topic: string;
  conversationType: string;
  setting?: string | null;
  audioPath?: string | null;
  voices?: Record<string, string>;
  speakers?: { id: string; role: string; voice: string }[];
  lines: { speaker: string; text: string }[];
  questions: ListeningQuestion[];
}

/** One writing prompt option (model answer hidden until after submission). */
export interface WritingOption {
  key: string;
  label: string;
  prompt: string;
}

/** A writing task with its rubric and prompt option(s). */
export interface WritingTask {
  id: string;
  taskType: string;
  stanagLevel: number;
  title: string;
  instructions: string;
  wordCountMin: number;
  wordCountMax: number;
  rubric: { dimension: string; descriptor: string }[];
  options: WritingOption[];
}

/** The items assembled for a session, grouped by skill. */
export interface SessionItems {
  reading: ReadingItem[];
  listening: ListeningItem[];
  writing: WritingTask[];
}

/** A stored answer within a session. */
export interface SessionAnswer {
  id: string;
  itemType: string;
  itemId: string;
  questionIndex: number;
  chosenLabel?: string | null;
  responseText?: string | null;
  isCorrect?: boolean | null;
  score?: number | null;
}

/** A practice set or mock exam with its items and submitted answers. */
export interface Session {
  id: string;
  mode: string;
  skill?: string | null;
  status: string;
  result?: SessionResult | null;
  startedAt: string;
  completedAt?: string | null;
  items: SessionItems;
  answers: SessionAnswer[];
}

/** Request body to create a session. */
export interface CreateSessionBody {
  mode: 'practice' | 'exam';
  skill?: 'reading' | 'listening' | 'writing';
  levels?: number[];
  counts?: { reading?: number; listening?: number; writing?: number };
  adaptive?: boolean;
}

/** Request body to submit one answer. */
export interface SubmitAnswerBody {
  itemType: 'reading' | 'listening' | 'writing';
  itemId: string;
  questionIndex?: number;
  optionKey?: string;
  chosenLabel?: string;
  responseText?: string;
}

/** Feedback for a submitted MCQ answer. */
export interface McqResult {
  itemType: string;
  correct?: boolean | null;
  correctLabel?: string;
  keyRationale?: string | null;
  chosenRationale?: string | null;
  ungraded?: boolean;
}

/** A rubric-based grade for a writing response. */
export interface WritingGrade {
  dimensions: { dimension: string; score: number; comment: string }[];
  overallScore: number;
  estimatedLevel: string;
  strengths: string[];
  improvements: string[];
}

/** Feedback for a submitted writing answer. */
export interface WritingResult {
  itemType: 'writing';
  grade: WritingGrade;
  modelAnswer: string | null;
}

/** Per-skill breakdown returned when a session is completed. */
export interface SessionResult {
  reading: { correct: number; total: number; pct: number; estimatedLevel: number } | null;
  listening: { correct: number; total: number; pct: number; estimatedLevel: number } | null;
  writing: { avgScore: number; estimatedLevel: string; count: number } | null;
}
