import sys
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "py_modules"))
from deckyhub.remote_install_queue import (
    INSTALLING_SECONDS,
    InvalidTransitionError,
    QueueFullError,
    RemoteInstallQueue,
    RequestConflictError,
)


class QueueTests(unittest.TestCase):
    def setUp(self):
        self.now = 100.0
        self.queue = RemoteInstallQueue(capacity=2, ttl=10, retention=20, clock=lambda: self.now)

    def create(self, owner="device-a", key="key-a", plugin="plugin-a", tag=None):
        return self.queue.create(owner, key, plugin, tag)

    def test_idempotency_is_owner_scoped_and_conflicts_are_rejected(self):
        original = self.create(tag="v1.2.3")
        self.assertEqual(original, self.create(tag="v1.2.3"))
        self.assertNotEqual(original.id, self.create(owner="device-b", tag="v1.2.3").id)
        with self.assertRaises(RequestConflictError):
            self.create(plugin="plugin-b", tag="v1.2.3")

    def test_owner_scoped_read_and_cancellation(self):
        request = self.create()
        self.assertIsNone(self.queue.get("device-b", request.id))
        self.assertIsNone(self.queue.cancel("device-b", request.id))
        self.assertEqual(self.queue.get("device-a", request.id).status, "pending_confirmation")
        self.assertEqual(self.queue.cancel("device-a", request.id).status, "cancelled")
        with self.assertRaises(InvalidTransitionError):
            self.queue.transition_local(request.id, "approved")

    def test_expiry_blocks_approval_and_allows_terminal_reaping(self):
        request = self.create()
        self.now += 10
        self.assertEqual(self.queue.get("device-a", request.id).status, "expired")
        self.assertEqual(self.queue.pending(), ())
        with self.assertRaises(InvalidTransitionError):
            self.queue.transition_local(request.id, "approved")
        self.now += 20
        self.assertIsNone(self.queue.get("device-a", request.id))
        self.assertNotEqual(request.id, self.create().id)

    def test_approval_and_single_worker(self):
        first = self.create()
        second = self.create(key="key-b", plugin="plugin-b")
        with self.assertRaises(InvalidTransitionError):
            self.queue.transition_local(first.id, "installing")
        for request in (first, second):
            self.queue.transition_local(request.id, "approved")
        self.queue.transition_local(first.id, "installing")
        with self.assertRaises(InvalidTransitionError):
            self.queue.transition_local(second.id, "installing")
        self.queue.transition_local(first.id, "installed")
        self.queue.transition_local(second.id, "installing")
        self.queue.transition_local(second.id, "failed")
        with self.assertRaises(InvalidTransitionError):
            self.queue.transition_local(second.id, "installed")

    def test_reject_and_failed_approval_do_not_install(self):
        first = self.create()
        second = self.create(key="key-b")
        self.queue.transition_local(first.id, "rejected")
        self.queue.transition_local(second.id, "approved")
        self.queue.transition_local(second.id, "failed")
        for request in (first, second):
            with self.assertRaises(InvalidTransitionError):
                self.queue.transition_local(request.id, "installing")

    def test_bounds_and_inputs(self):
        for plugin in ("../other", "https://bad", "", "A", "a/b"):
            with self.subTest(plugin=plugin), self.assertRaises(ValueError):
                self.create(plugin=plugin)
        for tag in ("../x", "https://bad", "", "v1//x"):
            with self.subTest(tag=tag), self.assertRaises(ValueError):
                self.create(tag=tag)
        self.assertEqual(self.create(tag="release/v1").release_tag, "release/v1")
        self.create(key="key-b")
        with self.assertRaises(QueueFullError):
            self.create(key="key-c")

    def test_concurrent_idempotent_creates_have_one_request(self):
        with ThreadPoolExecutor(max_workers=12) as pool:
            requests = list(pool.map(lambda _: self.create(), range(100)))
        self.assertEqual(len({request.id for request in requests}), 1)
        self.assertEqual(len(self.queue.pending()), 1)

    def test_concurrent_worker_claims_are_atomic(self):
        first = self.create()
        second = self.create(key="key-b")
        for request in (first, second):
            self.queue.transition_local(request.id, "approved")

        def claim(request):
            try:
                return self.queue.transition_local(request.id, "installing").status
            except InvalidTransitionError:
                return "busy"

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(claim, (first, second)))
        self.assertCountEqual(results, ["installing", "busy"])

    def test_restart_has_no_persisted_requests(self):
        request = self.create()
        other = RemoteInstallQueue()
        self.assertIsNone(other.get("device-a", request.id))

    def test_a_claim_nobody_finishes_becomes_unknown_and_frees_the_queue(self):
        first, second = self.create(), self.create(key="key-b", plugin="plugin-b")
        for request in (first, second):
            self.queue.transition_local(request.id, "approved")
        self.queue.transition_local(first.id, "installing")
        with self.assertRaises(InvalidTransitionError):
            self.queue.transition_local(second.id, "installing")
        self.now += INSTALLING_SECONDS - 1
        self.assertEqual(self.queue.get("device-a", first.id).status, "installing")
        self.now += 1
        self.assertEqual(self.queue.get("device-a", first.id).status, "unknown")

    def test_an_unknown_request_id_is_an_invalid_transition(self):
        for request_id in ("missing", None):
            with self.assertRaises(InvalidTransitionError):
                self.queue.transition_local(request_id, "approved")
            with self.assertRaises(InvalidTransitionError):
                self.queue.get_local(request_id)


if __name__ == "__main__":
    unittest.main()
