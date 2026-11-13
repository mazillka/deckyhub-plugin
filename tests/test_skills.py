"""The repository's agent skills (.agents/skills/<name>/SKILL.md): well-formed, and not pointing at files that are gone."""

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILLS = sorted((ROOT / ".agents" / "skills").glob("*/SKILL.md"))
# A repository file a skill names in backticks, such as `devtools/deck/cdp.mjs`.
PATH = re.compile(r"`((?:devtools|src|py_modules|docs|tests|promo|installer|\.github)/[\w./-]+\.\w+)`")
# Pictures and files the scripts write: not in a fresh checkout.
GENERATED = ("devtools/deck/screenshots/",)


def front_matter(text: str) -> dict[str, str]:
    head = text.split("\n---\n", 1)[0].removeprefix("---\n")
    return dict(line.split(": ", 1) for line in head.splitlines() if ": " in line)


class SkillTests(unittest.TestCase):
    def test_there_are_skills(self):
        self.assertGreaterEqual(len(SKILLS), 10)

    def test_each_skill_has_a_name_that_is_its_folder_and_a_description(self):
        for path in SKILLS:
            with self.subTest(skill=path.parent.name):
                text = path.read_text(encoding="utf-8").replace("\r\n", "\n")
                self.assertTrue(text.startswith("---\n"), "front matter missing")
                meta = front_matter(text)
                self.assertEqual(meta.get("name"), path.parent.name)
                description = meta.get("description", "")
                self.assertGreater(len(description), 40, "say what it does and when to use it")
                self.assertLessEqual(len(description), 1024)
                self.assertRegex(description, r"\b(when|before)\b", "say when to use it")

    def test_files_a_skill_names_exist(self):
        for path in SKILLS:
            text = path.read_text(encoding="utf-8")
            for name in sorted(set(PATH.findall(text))):
                if name.startswith(GENERATED) or "*" in name or "<" in name:
                    continue
                with self.subTest(skill=path.parent.name, file=name):
                    self.assertTrue((ROOT / name).exists(), f"{name} is named in {path.parent.name} but is not there")


if __name__ == "__main__":
    unittest.main()
