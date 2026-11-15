"""Guards on the tests themselves."""

import re
import unittest
from pathlib import Path


class TestFileTests(unittest.TestCase):
    def test_no_test_hides_after_unittest_main(self):
        # A test added below `if __name__ == "__main__":` lands inside that block, is never collected and
        # never fails: nine such tests went unnoticed until an audit found them.
        hidden = []
        for path in sorted(Path(__file__).parent.glob("test_*.py")):
            text = path.read_text(encoding="utf-8")
            main = text.find('if __name__ == "__main__"')
            if main != -1 and re.search(r"^\s+def test_", text[main:], re.MULTILINE):
                hidden.append(path.name)
        self.assertEqual(hidden, [])


if __name__ == "__main__":
    unittest.main()
