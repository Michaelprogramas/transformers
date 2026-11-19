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
"""Tests for `utils/list_models.py`, the offline model catalog + Hub free-checkpoint finder."""

import importlib.util
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent.parent

spec = importlib.util.spec_from_file_location("list_models", REPO_ROOT / "utils" / "list_models.py")
list_models = importlib.util.module_from_spec(spec)
spec.loader.exec_module(list_models)


class TestListModels(unittest.TestCase):
    def test_yaml_subset_parser_handles_nested_lists_and_same_indent_sections(self):
        text = """
- isExpanded: true
  sections:
  - isExpanded: false
    sections:
    - local: models
      title: Models
    title: Base
  title: API
- sections:
  - local: index
    title: Transformers
  title: Get started
"""
        tree = list_models.parse_yaml_subset(text)
        self.assertEqual(len(tree), 2)
        api = tree[0]
        self.assertEqual(api["title"], "API")
        self.assertEqual(api["sections"][0]["title"], "Base")
        self.assertEqual(api["sections"][0]["sections"][0], {"local": "models", "title": "Models"})
        self.assertEqual(tree[1]["sections"][0]["title"], "Transformers")

    def test_catalog_matches_documented_arches(self):
        catalog = list_models.build_catalog()
        self.assertGreater(len(catalog), 500)
        slugs = {arch.slug for arch in catalog}
        # One architecture per modality, as a smoke test of the doc tree walk.
        for slug in ("bert", "vit", "whisper", "videomae", "llava"):
            self.assertIn(slug, slugs)
        modalities = {arch.modality for arch in catalog}
        self.assertEqual(
            modalities,
            {"text", "vision", "audio", "video", "multimodal", "reinforcement-learning"},
        )

    def test_catalog_tasks_come_from_modeling_auto(self):
        catalog = {arch.slug: arch for arch in list_models.build_catalog()}
        self.assertIn("Text generation", catalog["qwen3"].tasks)
        self.assertIn("Speech recognition (seq2seq, Whisper-style)", catalog["whisper"].tasks)
        self.assertIn("Image/video + text -> text (VLM chat)", catalog["llava"].tasks)

    def test_classify_hub_models(self):
        classify = list_models.classify
        self.assertEqual(classify({"gated": False, "tags": ["license:apache-2.0"], "downloads": 10}), "free")
        self.assertEqual(classify({"gated": "manual", "tags": ["license:apache-2.0"], "downloads": 10}), "restricted")
        self.assertEqual(classify({"gated": False, "tags": ["license:cc-by-nc-4.0"], "downloads": 10}), "check")
        self.assertEqual(classify({"gated": False, "tags": [], "downloads": 1000}), "free")
        self.assertEqual(classify({"gated": False, "tags": [], "downloads": 0}), "check")


if __name__ == "__main__":
    unittest.main()
