import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "devtools" / "sync-registry.py"
spec = importlib.util.spec_from_file_location("sync_registry", SCRIPT)
sync_registry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync_registry)


def app(id, name=None, **extra):
    return {"id": id, "name": name or id.title(), "repo": f"owner/{id}", **extra}


class SyncRegistryTests(unittest.TestCase):
    def test_next_prerelease(self):
        self.assertEqual(sync_registry.next_prerelease("2.1.1-rc.3"), "2.1.1-rc.4")
        self.assertEqual(sync_registry.next_prerelease("2.1.1-rc.9"), "2.1.1-rc.10")
        self.assertEqual(sync_registry.next_prerelease("2.1.0"), "2.1.1-rc.1")
        with self.assertRaises(SystemExit):
            sync_registry.next_prerelease("2.1.1-beta.1")

    def test_describe_changes(self):
        before = [app("a"), app("b"), app("c")]
        after = [app("a", category="New"), app("c"), app("d")]
        self.assertEqual(sync_registry.describe_changes(before, after), ["Added D (owner/d)", "Removed B (owner/b)", "Updated A (owner/a)"])
        self.assertEqual(sync_registry.describe_changes(before, [app("b"), app("a"), app("c")]), ["Reordered entries"])
        self.assertEqual(sync_registry.describe_changes(before, before), [])


if __name__ == "__main__":
    unittest.main()
