"""Build the Prisma seed-data.json from the in-repo generated content.

Reads the exam markdown and listening JSON under api/seed-src/ plus the bilingual
vocabulary guide under api/references/, normalises them into the shapes the Prisma
seed expects, and copies the listening MP3s into the API static dir. Pure parsing —
no DB access.
"""

import json
import re
import shutil
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "api" / "seed-src"
REF = REPO / "api" / "references"
AUDIO_DEST = REPO / "api" / "static" / "listening"
SEED_PATH = REPO / "api" / "prisma" / "seed-data.json"

# The app serves only STANAG L3-L4 reading/writing; lower-level items are parsed but dropped.
MIN_LEVEL = 3

DASH = r"[\u2013\u2014-]"  # en-dash / em-dash / hyphen


def level_of(n: int) -> int:
    """Map a 1-based reading item number (1-60) to its STANAG level: L3 for 1-30, L4 for 31-60."""
    return 3 if n <= 30 else 4


def parse_reading() -> list[dict]:
    """Parse the reading exam + answer-key markdown into reading-item dicts.

    Returns:
        One dict per item with level, topic, passage, question, options
        (each {label, text, rationale}), correctLabel, and source.
    """
    exam = (OUT / "reading" / "reading-exam.md").read_text(encoding="utf-8")
    key = (OUT / "reading" / "reading-answer-key.md").read_text(encoding="utf-8")

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
            "correctLabel": ki["correct"], "source": "seed",
        })
    return items


def parse_writing() -> list[dict]:
    """Parse the writing exam + model-answer markdown into writing-task dicts.

    Each task declares its type and level inline (`*Level N \u00b7 type \u00b7 min\u2013max words*`),
    so tasks can be added or reordered without the parser inferring type from position.

    Returns:
        One dict per task with taskType, stanagLevel, title, instructions, word band,
        rubric, and a single `main` option carrying the model answer.
    """
    exam = (OUT / "writing" / "writing-exam.md").read_text(encoding="utf-8")
    model = (OUT / "writing" / "writing-model-answers.md").read_text(encoding="utf-8")

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
            "source": "seed",
        })
    return tasks


def parse_listening() -> list[dict]:
    """Load the listening JSON files and copy their MP3s into the API static dir.

    Each question's key comes from its `answer`, `rationale` and `option_rationales`
    fields; a question without an `answer` stays unkeyed and is left ungraded by the API.

    Returns:
        One dict per conversation with level, topic, voices/speakers/lines, questions
        (each {question, options, correctLabel, rationale, optionRationales}), audioPath,
        hasKey (true only when every question is keyed), and source.
    """
    AUDIO_DEST.mkdir(parents=True, exist_ok=True)
    items = []
    for jp in sorted((OUT / "listening").glob("listening-*.json")):
        d = json.loads(jp.read_text(encoding="utf-8"))
        mp3 = jp.with_suffix(".mp3")
        audio_path = None
        if mp3.exists():
            shutil.copy2(mp3, AUDIO_DEST / mp3.name)
            audio_path = f"/static/listening/{mp3.name}"
        qs = [{"question": q.get("question", ""), "options": q.get("options", {}),
               "correctLabel": q.get("answer"), "rationale": q.get("rationale"),
               "optionRationales": q.get("option_rationales")} for q in d.get("questions", [])]
        items.append({
            "level": d.get("stanag_level", 3), "topic": d.get("topic", ""),
            "conversationType": d.get("conversation_type", ""), "setting": d.get("setting"),
            "voices": d.get("voices", {}), "speakers": d.get("speakers", []),
            "lines": d.get("lines", []), "questions": qs, "audioPath": audio_path,
            "hasKey": bool(qs) and all(q["correctLabel"] for q in qs), "source": "seed",
        })
    return items


def parse_vocab() -> list[dict]:
    """Parse the bilingual vocab/grammar guide's markdown tables into vocab entries.

    Returns:
        One dict per table row with part, section, termEn, translationIt, and an
        optional note (the middle column of three-column acronym tables).
    """
    text = (REF / "english-vocabulary-guide.md").read_text(encoding="utf-8")
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
                                    "translationIt": it, "note": note})
                j += 1
            i = j; continue
        i += 1
    return entries


def main() -> None:
    """Build seed-data.json from the jflt sources and report the parsed counts."""
    reading = [r for r in parse_reading() if r["level"] >= MIN_LEVEL]
    writing = [w for w in parse_writing() if w["stanagLevel"] >= MIN_LEVEL]
    listening = parse_listening()
    vocab = parse_vocab()
    data = {"readingItems": reading, "writingTasks": writing,
            "listeningItems": listening, "vocabEntries": vocab}
    SEED_PATH.parent.mkdir(parents=True, exist_ok=True)
    SEED_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"readingItems:   {len(reading)}")
    print(f"writingTasks:   {len(writing)}  types={[t['taskType'] for t in writing]}")
    print(f"listeningItems: {len(listening)}  audio_copied={sum(1 for x in listening if x['audioPath'])} "
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
    print(f"written: {SEED_PATH}")


if __name__ == "__main__":
    main()
