"""Build the Prisma seed-data.json from the in-repo generated content.

For each content language, reads the exam markdown and listening JSON under its seed-src
folder plus its bilingual vocabulary guide, normalises them into the shapes the Prisma seed
expects (every record tagged with its `language`), and copies the listening MP3s into the
API static dir. Pure parsing — no DB access.

Usage: python scripts/build-seed-data.py [--lang en|es|all] [--out PATH] [--no-audio]
"""

import argparse
import json
import re
import shutil
from dataclasses import dataclass, replace
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "api" / "seed-src"
REF = REPO / "api" / "references"
AUDIO_DEST = REPO / "api" / "static" / "listening"
SEED_PATH = REPO / "api" / "prisma" / "seed-data.json"

# The app serves only STANAG L3-L4 reading/writing; lower-level items are parsed but dropped.
MIN_LEVEL = 3

DASH = r"[\u2013\u2014-]"  # en-dash / em-dash / hyphen

SEED_GROUPS = ("readingItems", "writingTasks", "listeningItems", "vocabEntries")


@dataclass(frozen=True)
class LanguageSources:
    """Where one content language's seed sources live and where its audio is served from.

    Attributes:
        language: Code stored on every record built from these sources.
        src: Folder holding `reading/`, `writing/` and `listening/`.
        ref: Folder holding the vocabulary guide.
        vocab: File name of the vocabulary guide inside `ref`.
        audio_dest: Folder the listening MP3s are copied into.
        audio_url: URL prefix the API serves `audio_dest` under.
    """

    language: str
    src: Path
    ref: Path
    vocab: str
    audio_dest: Path
    audio_url: str


LANGUAGES = {
    "en": LanguageSources("en", OUT, REF, "english-vocabulary-guide.md",
                          AUDIO_DEST, "/static/listening/"),
    "es": LanguageSources("es", OUT / "es", REF / "es", "spanish-vocabulary-guide.md",
                          AUDIO_DEST / "es", "/static/listening/es/"),
}


def _resolve(sources: LanguageSources | None) -> LanguageSources:
    """Return `sources`, or English sources read from the module-level paths when omitted.

    api/seed-src/es/tools/builder.py loads this file, reassigns OUT, REF and AUDIO_DEST and
    calls the parsers without arguments, so the fallback reads those names at call time.
    """
    if sources is not None:
        return sources
    return replace(LANGUAGES["en"], src=OUT, ref=REF, audio_dest=AUDIO_DEST)


def level_of(n: int) -> int:
    """Map a 1-based reading item number (1-60) to its STANAG level: L3 for 1-30, L4 for 31-60."""
    return 3 if n <= 30 else 4


def parse_reading(sources: LanguageSources | None = None) -> list[dict]:
    """Parse the reading exam + answer-key markdown into reading-item dicts.

    Args:
        sources: Language to parse; omitted means English at the module-level paths.

    Returns:
        One dict per item with level, topic, passage, question, options
        (each {label, text, rationale}), correctLabel, source, and language.
    """
    sources = _resolve(sources)
    exam = (sources.src / "reading" / "reading-exam.md").read_text(encoding="utf-8")
    key = (sources.src / "reading" / "reading-answer-key.md").read_text(encoding="utf-8")

    exam_items: dict[int, dict] = {}
    for m in re.finditer(r"^### (\d+)\. \((.*?)\)\s*$\n(.*?)(?=^### \d+\.|^## |\Z)",
                         exam, flags=re.M | re.S):
        num = int(m.group(1)); topic = m.group(2); block = m.group(3)
        opts = re.findall(r"^- \*\*([A-D])\)\*\* (.*)$", block, flags=re.M)
        qm = re.search(r"^\*\*(.*?\?)\*\*\s*$", block, flags=re.M)
        lines = []
        for ln in block.splitlines():
            if re.match(r"^- \*\*[A-D]\)\*\*", ln):
                break
            if qm and ln.strip() == f"**{qm.group(1)}**":
                break
            lines.append(ln)
        exam_items[num] = {
            "topic": topic.strip(),
            "passage": "\n".join(lines).strip(),
            "question": qm.group(1).strip() if qm else "",
            "options": [{"label": l, "text": t.strip()} for l, t in opts],
        }

    key_items: dict[int, dict] = {}
    for m in re.finditer(r"^### (\d+)\. Key: ([A-D]).*?$\n(.*?)(?=^### \d+\. Key:|^## |\Z)",
                         key, flags=re.M | re.S):
        num = int(m.group(1)); correct = m.group(2); block = m.group(3)
        rats: dict[str, str] = {}
        for om in re.finditer(r"^- \[[ x]\] \*\*([A-D])\)\*\* .*$\n\s+- (.*)$", block, flags=re.M):
            rats[om.group(1)] = om.group(2).strip()
        key_items[num] = {"correct": correct, "rationales": rats}

    items = []
    for n in sorted(exam_items):
        ei = exam_items[n]; ki = key_items.get(n, {"correct": "", "rationales": {}})
        for o in ei["options"]:
            o["rationale"] = ki["rationales"].get(o["label"], "")
        items.append({
            "level": level_of(n), "topic": ei["topic"], "passage": ei["passage"],
            "question": ei["question"], "options": ei["options"],
            "correctLabel": ki["correct"], "source": "seed", "language": sources.language,
        })
    return items


def parse_writing(sources: LanguageSources | None = None) -> list[dict]:
    """Parse the writing exam + model-answer markdown into writing-task dicts.

    Each task declares its type and level inline (`*Level N \u00b7 type \u00b7 min\u2013max words*`),
    so tasks can be added or reordered without the parser inferring type from position.

    Args:
        sources: Language to parse; omitted means English at the module-level paths.

    Returns:
        One dict per task with taskType, stanagLevel, title, instructions, word band,
        rubric, a single `main` option carrying the model answer, source, and language.
    """
    sources = _resolve(sources)
    exam = (sources.src / "writing" / "writing-exam.md").read_text(encoding="utf-8")
    model = (sources.src / "writing" / "writing-model-answers.md").read_text(encoding="utf-8")

    def split_tasks(text: str) -> list[tuple[str, str]]:
        """Split a writing markdown doc into (task-title, task-body) pairs."""
        return [(m.group(1).strip(), m.group(2))
                for m in re.finditer(r"^## (Task \d+[^\n]*)\n(.*?)(?=^## Task |\Z)",
                                     text, flags=re.M | re.S)]

    model_by_idx = {i: body for i, (_, body) in enumerate(split_tasks(model))}

    tasks = []
    for idx, (title, body) in enumerate(split_tasks(exam)):
        meta = re.search(rf"^\*Level\s+(\d+)\D+?(\w+)\D+?(\d+)\s*{DASH}\s*(\d+)\s*words\*",
                         body, flags=re.M)
        if meta is None:
            raise ValueError(f"writing task missing a '*Level N · type · min-max words*' line: {title}")
        level = int(meta.group(1)); ttype = meta.group(2)
        wmin = int(meta.group(3)); wmax = int(meta.group(4))
        instructions = re.sub(r"^\*Level.*?words\*\s*", "", body.strip(), flags=re.S).strip()

        mbody = model_by_idx.get(idx, "")
        rubric = [{"dimension": d.strip(), "descriptor": desc.strip()}
                  for d, desc in re.findall(r"^- \*\*(.+?):\*\* (.*)$", mbody, flags=re.M)]
        ma = re.search(r"\*\*Model answer\*\*\s*(.*)\Z", mbody, flags=re.S)
        model_answer = ma.group(1).strip() if ma else ""

        tasks.append({
            "taskType": ttype, "stanagLevel": level, "title": title,
            "instructions": instructions, "wordCountMin": wmin, "wordCountMax": wmax,
            "rubric": rubric,
            "options": [{"key": "main", "label": "", "prompt": "", "modelAnswer": model_answer}],
            "source": "seed", "language": sources.language,
        })
    return tasks


def parse_listening(sources: LanguageSources | None = None, copy_audio: bool = True) -> list[dict]:
    """Load the listening JSON files and copy their MP3s into the API static dir.

    Each question's key comes from its `answer`, `rationale` and `option_rationales`
    fields; a question without an `answer` stays unkeyed and is left ungraded by the API.

    Args:
        sources: Language to parse; omitted means English at the module-level paths.
        copy_audio: Copy each MP3 into `sources.audio_dest` (created if missing). When
            false nothing is written, yet `audioPath` still names where the file is served.

    Returns:
        One dict per conversation with level, topic, voices/speakers/lines, questions
        (each {question, options, correctLabel, rationale, optionRationales}), audioPath
        (None when the conversation has no MP3), hasKey (true only when every question
        is keyed), source, and language.
    """
    sources = _resolve(sources)
    if copy_audio:
        sources.audio_dest.mkdir(parents=True, exist_ok=True)
    items = []
    for jp in sorted((sources.src / "listening").glob("listening-*.json")):
        d = json.loads(jp.read_text(encoding="utf-8"))
        mp3 = jp.with_suffix(".mp3")
        audio_path = None
        if mp3.exists():
            if copy_audio:
                shutil.copy2(mp3, sources.audio_dest / mp3.name)
            audio_path = f"{sources.audio_url}{mp3.name}"
        qs = [{"question": q.get("question", ""), "options": q.get("options", {}),
               "correctLabel": q.get("answer"), "rationale": q.get("rationale"),
               "optionRationales": q.get("option_rationales")} for q in d.get("questions", [])]
        items.append({
            "level": d.get("stanag_level", 3), "topic": d.get("topic", ""),
            "conversationType": d.get("conversation_type", ""), "setting": d.get("setting"),
            "voices": d.get("voices", {}), "speakers": d.get("speakers", []),
            "lines": d.get("lines", []), "questions": qs, "audioPath": audio_path,
            "hasKey": bool(qs) and all(q["correctLabel"] for q in qs), "source": "seed",
            "language": sources.language,
        })
    return items


def parse_vocab(sources: LanguageSources | None = None) -> list[dict]:
    """Parse the bilingual vocab/grammar guide's markdown tables into vocab entries.

    Args:
        sources: Language to parse; omitted means English at the module-level paths.

    Returns:
        One dict per table row with part, section, termEn (the term in the exam
        language, whichever it is), translationIt, an optional note (the middle column
        of three-column acronym tables), and language.
    """
    sources = _resolve(sources)
    text = (sources.ref / sources.vocab).read_text(encoding="utf-8")
    entries = []
    part = "I"
    section = ""
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        ln = lines[i]
        pm = re.match(r"^# Parte ([IVX]+)", ln)
        if pm:
            part = pm.group(1); i += 1; continue
        hm = re.match(r"^#{2,3} (.+)", ln)
        if hm:
            section = re.sub(r"^\d+\.\s*", "", hm.group(1)).strip(); i += 1; continue
        if ln.lstrip().startswith("|") and i + 1 < len(lines) \
                and re.match(r"^\s*\|[\s:|-]+\|\s*$", lines[i + 1]):
            j = i + 2
            while j < len(lines) and lines[j].lstrip().startswith("|"):
                cells = [c.strip() for c in lines[j].strip().strip("|").split("|")]
                if len(cells) >= 2 and cells[0] and cells[1]:
                    if len(cells) >= 3 and cells[2]:
                        term, it, note = cells[0], cells[2], cells[1]
                    else:
                        term, it, note = cells[0], cells[1], None
                    entries.append({"part": part, "section": section or "General",
                                    "termEn": re.sub(r"[*_`]", "", term),
                                    "translationIt": it, "note": note,
                                    "language": sources.language})
                j += 1
            i = j; continue
        i += 1
    return entries


def build_language(sources: LanguageSources, copy_audio: bool) -> dict[str, list[dict]]:
    """Parse one language's sources into the seed groups, keeping only STANAG L3+ reading/writing.

    Args:
        sources: Language to build.
        copy_audio: Whether to copy the listening MP3s into `sources.audio_dest`.

    Returns:
        The records of that language, keyed by the names in `SEED_GROUPS`.
    """
    return {
        "readingItems": [r for r in parse_reading(sources) if r["level"] >= MIN_LEVEL],
        "writingTasks": [w for w in parse_writing(sources) if w["stanagLevel"] >= MIN_LEVEL],
        "listeningItems": parse_listening(sources, copy_audio=copy_audio),
        "vocabEntries": parse_vocab(sources),
    }


def print_summary(language: str, data: dict[str, list[dict]]) -> None:
    """Print the parsed counts of one language so a short or broken source shows up at once."""
    reading, writing = data["readingItems"], data["writingTasks"]
    listening, vocab = data["listeningItems"], data["vocabEntries"]
    print(f"[{language}]")
    print(f"readingItems:   {len(reading)}")
    print(f"writingTasks:   {len(writing)}  types={[t['taskType'] for t in writing]}")
    print(f"listeningItems: {len(listening)}  with_audio={sum(1 for x in listening if x['audioPath'])} "
          f"keyed={sum(1 for x in listening if x['hasKey'])}")
    print(f"vocabEntries:   {len(vocab)}")
    if reading:
        r = reading[0]
        print(f"  reading[0]: L{r['level']} key={r['correctLabel']} "
              f"opts={len(r['options'])} rats={sum(1 for o in r['options'] if o['rationale'])}")
    for t in writing:
        print(f"  {t['taskType']}: L{t['stanagLevel']} {t['wordCountMin']}-{t['wordCountMax']}w "
              f"rubric={len(t['rubric'])} opts={len(t['options'])} "
              f"model_words={[len(o['modelAnswer'].split()) for o in t['options']]}")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse the command line.

    Args:
        argv: Arguments without the program name; None reads `sys.argv`.

    Returns:
        The namespace with `lang` (a language code or "all"), `out` and `no_audio`.
    """
    parser = argparse.ArgumentParser(description="Build the Prisma seed data from the in-repo content.")
    parser.add_argument("--lang", choices=[*LANGUAGES, "all"], default="all",
                        help="content language to build (default: all)")
    parser.add_argument("--out", type=Path, default=SEED_PATH,
                        help=f"output file (default: {SEED_PATH.relative_to(REPO)})")
    parser.add_argument("--no-audio", action="store_true",
                        help="do not copy listening MP3s into the API static dir")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    """Build seed-data.json for the selected languages and report the parsed counts.

    Args:
        argv: Arguments without the program name; None reads `sys.argv`.
    """
    args = parse_args(argv)
    languages = list(LANGUAGES) if args.lang == "all" else [args.lang]
    data: dict[str, list[dict]] = {group: [] for group in SEED_GROUPS}
    for language in languages:
        part = build_language(LANGUAGES[language], copy_audio=not args.no_audio)
        print_summary(language, part)
        for group in SEED_GROUPS:
            data[group].extend(part[group])
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"written: {args.out}")


if __name__ == "__main__":
    main()
