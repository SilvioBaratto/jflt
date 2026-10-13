import { Injectable, Logger } from '@nestjs/common';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Renders multi-voice conversation audio via the OpenAI TTS API (one call per line, byte-concatenated). */
@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly model = process.env.TTS_MODEL || 'tts-1';
  private readonly url = 'https://api.openai.com/v1/audio/speech';

  /** True when an OpenAI key is configured (otherwise generated listening has no audio). */
  get available(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  /**
   * Render a conversation to an MP3 under api/static/listening and return its served path.
   *
   * @param id - A unique id used for the output filename.
   * @param lines - The ordered conversation turns.
   * @param voiceBySpeaker - Map of speaker id to an OpenAI voice name.
   * @returns The served static path (e.g. /static/listening/gen-xx.mp3).
   */
  async renderConversation(
    id: string,
    lines: { speaker: string; text: string }[],
    voiceBySpeaker: Record<string, string>,
  ): Promise<string> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not set');
    const segments: Buffer[] = [];
    for (const line of lines) {
      const voice = voiceBySpeaker[line.speaker] || 'alloy';
      segments.push(await this.synthesize(line.text, voice, key));
    }
    const dir = join(process.cwd(), 'static', 'listening');
    await mkdir(dir, { recursive: true });
    const name = `gen-${id}.mp3`;
    await writeFile(join(dir, name), Buffer.concat(segments));
    return `/static/listening/${name}`;
  }

  private async synthesize(text: string, voice: string, key: string): Promise<Buffer> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, voice, input: text, response_format: 'mp3' }),
    });
    if (!res.ok) throw new Error(`TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return Buffer.from(await res.arrayBuffer());
  }
}
