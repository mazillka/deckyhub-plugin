import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent.parent
REQUIRED = ("main.py", "plugin.json", "LICENSE.md", "dist/index.js", "py_modules/deckyhub/registry.py")


class ReleasePackageTests(unittest.TestCase):
    def verify(self, extra):
        with tempfile.TemporaryDirectory() as home:
            path = Path(home) / "release.zip"
            with ZipFile(path, "w") as archive:
                for name in (*REQUIRED, extra):
                    archive.writestr(f"DeckyHub/{name}", "x")
                archive.writestr("DeckyHub/package.json", (ROOT / "package.json").read_text(encoding="utf-8"))
            command = [sys.executable, str(ROOT / "devtools" / "verify-release.py"), str(path)]
            return subprocess.run(command, cwd=ROOT, capture_output=True).returncode

    def test_only_the_vendored_certificate_bundle_may_be_a_pem(self):
        self.assertEqual(self.verify("py_modules/deckyhub_vendor/cp311/certifi/cacert.pem"), 0)
        for name in ("cacert.pem", "py_modules/deckyhub_vendor/cp311/certifi/key.pem", "certifi/cacert.pem"):
            with self.subTest(name=name):
                self.assertNotEqual(self.verify(name), 0)


if __name__ == "__main__":
    unittest.main()
