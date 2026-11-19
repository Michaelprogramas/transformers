# Copyright 2025 The HuggingFace Team. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""List the model architectures this checkout of Transformers can load, and find free checkpoints for them.

The script has three jobs:

1. ``--list`` prints every architecture documented in ``docs/source/en/_toctree.yml``, grouped by
   modality (text, vision, audio, video, multimodal, reinforcement learning).
2. ``--tasks`` prints which architectures are wired to each ``AutoModelFor*`` class -- i.e. what you
   can actually do with them out of the box (text generation, ASR, object detection, ...).
3. ``--hub`` queries the Hugging Face Hub for checkpoints of those architectures and tags each one
   as *free* (no gate, permissive license), *check* (no gate, read the license) or *gated*.

Only the standard library is used, so this runs without installing ``transformers`` itself::

    python utils/list_models.py --list
    python utils/list_models.py --list --modality multimodal --csv catalog.csv
    python utils/list_models.py --tasks --tasks-filter generation
    python utils/list_models.py --hub --modality multimodal --license apache-2.0 --csv free_models.csv
    python utils/list_models.py --hub --architectures llama qwen3 gemma3 --sort downloads

Because the Hub API is rate limited and the network is not always available, ``--hub`` is opt-in and
always degrades gracefully: it prints a clear message instead of failing.
"""

import argparse
import csv
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
TOCTREE_PATH = REPO_ROOT / "docs/source/en/_toctree.yml"
AUTO_MODELING_PATH = REPO_ROOT / "src/transformers/models/auto/modeling_auto.py"
HUB_API = "https://huggingface.co/api"

MODALITIES = {
    "Text models": "text",
    "Vision models": "vision",
    "Audio models": "audio",
    "Video models": "video",
    "Multimodal models": "multimodal",
    "Reinforcement learning models": "reinforcement-learning",
}

# (AutoModel class, human readable task, human readable mapping name)
TASK_MAPPINGS = [
    ("AutoModel", "Feature extraction / backbone", "MODEL_MAPPING_NAMES"),
    ("AutoModelForCausalLM", "Text generation", "MODEL_FOR_CAUSAL_LM_MAPPING_NAMES"),
    (
        "AutoModelForSeq2SeqLM",
        "Seq2seq generation (translation, summarization)",
        "MODEL_FOR_SEQ_TO_SEQ_CAUSAL_LM_MAPPING_NAMES",
    ),
    ("AutoModelForMaskedLM", "Masked language modeling", "MODEL_FOR_MASKED_LM_MAPPING_NAMES"),
    ("AutoModelForSequenceClassification", "Text classification", "MODEL_FOR_SEQUENCE_CLASSIFICATION_MAPPING_NAMES"),
    ("AutoModelForTokenClassification", "Token classification / NER", "MODEL_FOR_TOKEN_CLASSIFICATION_MAPPING_NAMES"),
    ("AutoModelForQuestionAnswering", "Extractive question answering", "MODEL_FOR_QUESTION_ANSWERING_MAPPING_NAMES"),
    (
        "AutoModelForImageTextToText",
        "Image/video + text -> text (VLM chat)",
        "MODEL_FOR_IMAGE_TEXT_TO_TEXT_MAPPING_NAMES",
    ),
    ("AutoModelForMultimodalLM", "Any-to-any / omni", "MODEL_FOR_MULTIMODAL_LM_MAPPING_NAMES"),
    ("AutoModelForImageClassification", "Image classification", "MODEL_FOR_IMAGE_CLASSIFICATION_MAPPING_NAMES"),
    ("AutoModelForObjectDetection", "Object detection", "MODEL_FOR_OBJECT_DETECTION_MAPPING_NAMES"),
    (
        "AutoModelForZeroShotObjectDetection",
        "Zero-shot object detection",
        "MODEL_FOR_ZERO_SHOT_OBJECT_DETECTION_MAPPING_NAMES",
    ),
    (
        "AutoModelForUniversalSegmentation",
        "Segmentation (panoptic/instance/semantic)",
        "MODEL_FOR_UNIVERSAL_SEGMENTATION_MAPPING_NAMES",
    ),
    ("AutoModelForDepthEstimation", "Depth estimation", "MODEL_FOR_DEPTH_ESTIMATION_MAPPING_NAMES"),
    (
        "AutoModelForSpeechSeq2Seq",
        "Speech recognition (seq2seq, Whisper-style)",
        "MODEL_FOR_SPEECH_SEQ_2_SEQ_MAPPING_NAMES",
    ),
    ("AutoModelForCTC", "Speech recognition (CTC)", "MODEL_FOR_CTC_MAPPING_NAMES"),
    ("AutoModelForTextToWaveform", "Text-to-speech / audio", "MODEL_FOR_TEXT_TO_WAVEFORM_MAPPING_NAMES"),
    ("AutoModelForTextToSpectrogram", "Text-to-spectrogram", "MODEL_FOR_TEXT_TO_SPECTROGRAM_MAPPING_NAMES"),
]

# Licenses that let a checkpoint be downloaded and used without asking anyone for access. Model
# licenses such as ``gemma``/``llama3``/``qwen`` are not gated on the Hub, but they add usage terms,
# so they are classified as "check" instead.
FREE_LICENSES = {
    "apache-2.0",
    "mit",
    "bsd-3-clause",
    "bsd-2-clause",
    "bsd",
    "cc0-1.0",
    "cc-by-4.0",
    "cc-by-sa-4.0",
    "openrail",
    "openrail++",
    "bigscience-openrail-m",
    "creativeml-openrail-m",
    "bigcode-openrail-m",
    "afl-3.0",
    "artistic-2.0",
    "ecl-2.0",
    "epl-2.0",
    "isc",
    "lgpl-2.1",
    "lgpl-3.0",
    "mpl-2.0",
    "unlicense",
    "wtfpl",
    "zlib",
    "other",
}

STATUS_EMOJI = {"free": "FREE", "check": "CHECK", "restricted": "GATED"}


@dataclass
class Architecture:
    slug: str  # config name in Transformers, e.g. "qwen3"
    title: str  # doc title, e.g. "Qwen3"
    modality: str
    doc: str  # e.g. "model_doc/qwen3"
    tasks: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------------------------
# YAML subset parser: the toctree file only uses mappings, lists and plain scalars, so this keeps
# the script dependency-free instead of importing PyYAML.
# ---------------------------------------------------------------------------------------------
def _strip_comment(line: str) -> str:
    out, quote = [], None
    for char in line:
        if quote:
            if char == quote:
                quote = None
        elif char in "\"'":
            quote = char
        elif char == "#" and (not out or out[-1] == " "):
            break
        out.append(char)
    return "".join(out).rstrip()


def _parse_scalar(text: str):
    text = text.strip()
    if not text:
        return {}
    return text.strip("\"'")


def parse_yaml_subset(text: str):
    """Parse the block-style YAML used by the docs toctree (mappings + lists of mappings)."""
    raw_lines = [(_strip_comment(raw), len(raw) - len(raw.lstrip(" "))) for raw in text.splitlines()]
    lines = [(content.strip(), indent) for content, indent in raw_lines if content.strip()]
    total = len(lines)

    def is_dash(index: int) -> bool:
        return index < total and lines[index][0].startswith("- ")

    def parse_node(index: int, indent: int):
        if is_dash(index):
            return parse_list(index, indent)
        return parse_mapping(index, indent)

    def parse_mapping(index: int, indent: int):
        mapping = {}
        while index < total and lines[index][1] == indent and not is_dash(index):
            content, _ = lines[index]
            key, _, rest = content.partition(":")
            key, rest = key.strip(), rest.strip()
            index += 1
            if rest:
                mapping[key] = _parse_scalar(rest)
                continue
            # A block sequence may sit at the same indentation as its parent key, so accept either
            # (deeper than the key) or (same indent and starting with "- ").
            if index < total and (lines[index][1] > indent or (lines[index][1] == indent and is_dash(index))):
                mapping[key], index = parse_node(index, lines[index][1])
            else:
                mapping[key] = {}
        return mapping, index

    def parse_list(index: int, indent: int):
        items = []
        while index < total and lines[index][1] == indent and is_dash(index):
            content, _ = lines[index]
            item_text = content[2:].strip()
            index += 1
            if ":" not in item_text:
                items.append(_parse_scalar(item_text))
                continue
            key, _, rest = item_text.partition(":")
            key, rest = key.strip(), rest.strip()
            item = {}
            if rest:
                item[key] = _parse_scalar(rest)
            elif index < total and (
                lines[index][1] > indent + 2 or (lines[index][1] == indent + 2 and is_dash(index))
            ):
                item[key], index = parse_node(index, lines[index][1])
            else:
                item[key] = {}
            # Remaining sibling keys of this list item are aligned two columns to the right of the dash.
            if index < total and lines[index][1] == indent + 2 and not is_dash(index):
                extra, index = parse_mapping(index, indent + 2)
                item.update(extra)
            items.append(item)
        return items, index

    node, _ = parse_node(0, lines[0][1] if lines else 0)
    return node


def walk_toctree(nodes, trail=()):
    if isinstance(nodes, dict):
        nodes = [nodes]
    for node in nodes:
        if not isinstance(node, dict):
            continue
        title = str(node.get("title", ""))
        sections = node.get("sections")
        if isinstance(sections, list) and sections:
            yield from walk_toctree(sections, trail + ((title,) if title else ()))
        elif node.get("local"):
            yield trail, title, str(node.get("local"))


def load_catalog() -> list[Architecture]:
    tree = parse_yaml_subset(TOCTREE_PATH.read_text(encoding="utf-8"))
    catalog, seen = [], set()
    for trail, title, local in walk_toctree(tree):
        hit = [t for t in trail if t in MODALITIES]
        if not hit or not local.startswith("model_doc/"):
            continue
        slug = local.split("/", 1)[1]
        if slug in seen:
            continue
        seen.add(slug)
        catalog.append(Architecture(slug=slug, title=title or slug, modality=MODALITIES[hit[-1]], doc=local))
    return catalog


def load_task_mappings() -> dict[str, list[str]]:
    text = AUTO_MODELING_PATH.read_text(encoding="utf-8")
    mappings = {}
    for _, _, var_name in TASK_MAPPINGS:
        match = re.search(rf"^{var_name} = OrderedDict\(\s*\[(.*?)\n\s*\]\s*\)", text, re.DOTALL | re.MULTILINE)
        if not match:
            mappings[var_name] = []
            continue
        mappings[var_name] = re.findall(r'\(\s*"([^"]+)"\s*,\s*"[^"]+"\s*\)', match.group(1))
    return mappings


def build_catalog() -> list[Architecture]:
    catalog = load_catalog()
    mappings = load_task_mappings()
    by_slug = {a.slug: a for a in catalog}
    for auto_class, task, var_name in TASK_MAPPINGS:
        for key in mappings.get(var_name, []):
            arch = by_slug.get(key)
            if arch is not None and task not in arch.tasks:
                arch.tasks.append(task)
    return catalog


# ---------------------------------------------------------------------------------------------
# Hub lookup
# ---------------------------------------------------------------------------------------------
def _hub_get(path: str, params: dict, retries: int = 3):
    url = f"{HUB_API}{path}?{urllib.parse.urlencode(params)}"
    last_error = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "transformers-list-models"})
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            if error.code == 429:
                last_error = error
                time.sleep(2**attempt)
                continue
            raise
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            last_error = error
            time.sleep(1 + attempt)
    raise RuntimeError(f"could not reach {HUB_API}: {last_error}")


def _model_license(model: dict) -> str:
    for tag in model.get("tags", []):
        if isinstance(tag, str) and tag.startswith("license:"):
            return tag.split(":", 1)[1].lower()
    return ""


def classify(model: dict) -> str:
    """A checkpoint is 'free' when it needs no click-through and has a permissive license."""
    if model.get("gated") not in (None, False):
        return "restricted"
    license_id = _model_license(model)
    if not license_id:
        return "free" if model.get("downloads", 0) else "check"
    if license_id in FREE_LICENSES:
        return "free"
    return "check"


def hub_search(architectures: list[Architecture], args) -> list[dict]:
    results = []
    unreachable = False
    for arch in architectures:
        if unreachable:
            break
        slug = arch.slug
        params = {
            "filter": slug,
            "limit": args.limit,
            "sort": args.sort,
            "direction": "-1",
            "full": "true",
        }
        if args.pipeline_tag:
            params["pipeline_tag"] = args.pipeline_tag
        print(f"  · querying Hub for '{slug}' ...", file=sys.stderr, flush=True)
        try:
            models = _hub_get("/models", params)
        except RuntimeError as error:
            print(f"    ! {error}", file=sys.stderr)
            print("    ! Are you offline? Run without --hub to use the offline catalog.", file=sys.stderr)
            unreachable = True
            continue
        for model in models:
            status = classify(model)
            license_id = _model_license(model)
            if args.license and license_id != args.license.lower():
                continue
            if status == "restricted" and not args.include_gated:
                continue
            results.append(
                {
                    "architecture": slug,
                    "architecture_title": arch.title,
                    "modality": arch.modality,
                    "model_id": model.get("modelId") or model.get("id", ""),
                    "pipeline_tag": model.get("pipeline_tag", ""),
                    "license": license_id or "(none declared)",
                    "access": STATUS_EMOJI[status],
                    "downloads": model.get("downloads", 0),
                    "likes": model.get("likes", 0),
                    "gated": model.get("gated", False),
                    "last_modified": (model.get("lastModified") or "")[:10],
                }
            )
        if args.sleep:
            time.sleep(args.sleep)
    return results


def _sort_results(results: list[dict], sort_by: str) -> list[dict]:
    if sort_by == "downloads":
        return sorted(results, key=lambda r: r["downloads"], reverse=True)
    if sort_by == "likes":
        return sorted(results, key=lambda r: r["likes"], reverse=True)
    if sort_by == "lastModified":
        return sorted(results, key=lambda r: r["last_modified"], reverse=True)
    return sorted(results, key=lambda r: (r["architecture"], -r["downloads"]))


def write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"\nWrote {len(rows)} rows to {path}", file=sys.stderr)


# ---------------------------------------------------------------------------------------------
# Output modes
# ---------------------------------------------------------------------------------------------
def cmd_list(args) -> None:
    catalog = build_catalog()
    modalities = [m for m in MODALITIES.values() if not args.modality or m in args.modality]
    selected = [a for a in catalog if a.modality in modalities]
    if args.tasks_filter:
        selected = [a for a in selected if any(args.tasks_filter in t for t in a.tasks)]

    if args.csv:
        write_csv(
            Path(args.csv),
            [
                {
                    "architecture": a.slug,
                    "title": a.title,
                    "modality": a.modality,
                    "tasks": "; ".join(a.tasks),
                    "doc": a.doc,
                }
                for a in selected
            ],
            ["architecture", "title", "modality", "tasks", "doc"],
        )
        return
    if args.json:
        print(json.dumps([a.__dict__ for a in selected], ensure_ascii=False, indent=2))
        return

    print(f"Model architectures supported by this checkout ({len(selected)} of {len(catalog)})\n")
    for modality in modalities:
        group = [a for a in selected if a.modality == modality]
        if not group:
            continue
        print(f"== {modality.replace('-', ' ').title()} ({len(group)}) ==")
        for arch in group:
            tasks = f"   [{', '.join(arch.tasks)}]" if arch.tasks and args.show_tasks else ""
            print(f"  - {arch.title:<38} {arch.slug:<32} {tasks}")
        print()
    print("Tip: `--tasks` shows which AutoModelFor* class each architecture is wired to.")


def cmd_tasks(args) -> None:
    tasks = [t for t in TASK_MAPPINGS if not args.tasks_filter or args.tasks_filter.lower() in t[1].lower()]
    tasks_by_var = load_task_mappings()
    if args.csv:
        rows = [
            {"auto_class": auto_class, "task": task, "architectures": "; ".join(tasks_by_var.get(var_name, []))}
            for auto_class, task, var_name in tasks
        ]
        write_csv(Path(args.csv), rows, ["auto_class", "task", "architectures"])
        return
    for auto_class, task, var_name in tasks:
        arches = tasks_by_var.get(var_name, [])
        print(f"== {task}  ({auto_class}) -- {len(arches)} architectures ==")
        print("   " + ", ".join(arches) + "\n")


def cmd_hub(args) -> None:
    catalog = build_catalog()
    catalog_by_slug = {a.slug: a for a in catalog}

    if args.architectures:
        unknown = [slug for slug in args.architectures if slug not in catalog_by_slug]
        if unknown:
            print(f"! unknown architectures (not in this checkout's docs): {', '.join(unknown)}", file=sys.stderr)
        architectures = [catalog_by_slug[slug] for slug in args.architectures if slug in catalog_by_slug]
    else:
        modalities = [m for m in MODALITIES.values() if not args.modality or m in args.modality]
        architectures = [a for a in catalog if a.modality in modalities]
        if args.tasks_filter:
            architectures = [a for a in architectures if any(args.tasks_filter in t for t in a.tasks)]
    if not architectures:
        print("Nothing to query: adjust --modality / --tasks-filter.", file=sys.stderr)
        return

    print(f"Querying the Hub for {len(architectures)} architectures (limit {args.limit} each)...\n", file=sys.stderr)
    results = hub_search(architectures, args)
    results = _sort_results(results, args.sort)

    if args.csv:
        write_csv(
            Path(args.csv),
            results,
            [
                "architecture",
                "architecture_title",
                "modality",
                "model_id",
                "pipeline_tag",
                "license",
                "access",
                "downloads",
                "likes",
                "gated",
                "last_modified",
            ],
        )
        return
    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
        return

    if not results:
        print("No checkpoints returned. The Hub may be unreachable from here.")
        return
    print(f"{'ACCESS':<7} {'MODEL':<52} {'ARCH':<16} {'LICENSE':<14} {'DL':>9} {'LIKES':>6}  UPDATED")
    for row in results:
        print(
            f"{row['access']:<7} {row['model_id'][:52]:<52} {row['architecture']:<16} {row['license'][:14]:<14} "
            f"{row['downloads']:>9} {row['likes']:>6}  {row['last_modified']}"
        )
    print(
        "\nFREE = no gate + permissive license (or no license declared), CHECK = read the license, GATED = needs approval."
    )
    print("Add --csv out.csv to export, or --include-gated to also list gated repos.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="List model architectures supported by this Transformers checkout and find free checkpoints on the Hub.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--list", action="store_true", help="list documented architectures (default)")
    mode.add_argument("--tasks", action="store_true", help="list task -> architecture mappings from modeling_auto.py")
    mode.add_argument("--hub", action="store_true", help="query the Hub for checkpoints of those architectures")
    parser.add_argument("--modality", nargs="+", choices=list(MODALITIES.values()), help="filter by modality")
    parser.add_argument("--tasks-filter", default="", help="keep only architectures/tasks matching this substring")
    parser.add_argument("--architectures", nargs="+", help="hub mode: architecture slugs to query (default: all)")
    parser.add_argument("--limit", type=int, default=5, help="hub mode: checkpoints per architecture (default 5)")
    parser.add_argument(
        "--sort", choices=["downloads", "likes", "lastModified"], default="downloads", help="hub mode sort"
    )
    parser.add_argument("--license", help="hub mode: keep only this exact license id, e.g. apache-2.0")
    parser.add_argument("--pipeline-tag", default="", help="hub mode: filter by pipeline tag, e.g. text-generation")
    parser.add_argument("--include-gated", action="store_true", help="hub mode: also list gated repos")
    parser.add_argument("--sleep", type=float, default=0.3, help="hub mode: seconds between API calls")
    parser.add_argument("--csv", help="write results to this CSV path instead of printing a table")
    parser.add_argument("--json", action="store_true", help="print results as JSON")
    parser.add_argument("--show-tasks", action="store_true", help="--list: show tasks next to each architecture")
    args = parser.parse_args()

    if not TOCTREE_PATH.exists() or not AUTO_MODELING_PATH.exists():
        raise SystemExit(f"Run this from a Transformers checkout (looked in {REPO_ROOT}).")
    args.architectures = [a for group in args.architectures for a in group.split(",")] if args.architectures else None

    if args.hub:
        cmd_hub(args)
    elif args.tasks:
        cmd_tasks(args)
    else:
        cmd_list(args)


if __name__ == "__main__":
    main()
