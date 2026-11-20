"""Job contract v2: the same fixture as packages/shared/src/processing.test.ts."""

import copy
import json
import unittest
from pathlib import Path

from nookscanner_reconstruction.contract import (
    ContractError,
    failed_event,
    is_safe_output_path,
    parse_job_request,
    progress_event,
    succeeded_event,
    upload_urls_event,
)
from nookscanner_reconstruction.providers import get_provider

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[3] / "packages/shared/src/fixtures/job-request-v2.json").read_text(encoding="utf-8")
)
VALID = FIXTURE["valid"]


def mutate(path, value):
    data = copy.deepcopy(VALID)
    node = data
    for key in path[:-1]:
        node = node[key]
    node[path[-1]] = value
    return data


class ContractTest(unittest.TestCase):
    def test_valid(self):
        job = parse_job_request(VALID)
        self.assertEqual(job.provider, "self_hosted_gsplat")
        self.assertEqual([p.part_number for p in job.inputs[0].parts], [1, 2])
        self.assertEqual(job.capture_tier, "T1")

    def test_invalid_fixture_cases(self):
        for name, case in FIXTURE["invalid"].items():
            with self.subTest(name), self.assertRaises(ContractError):
                parse_job_request(mutate(case["path"], case["value"]))

    def test_rejects_unknown_fields(self):
        with self.assertRaises(ContractError):
            parse_job_request({**VALID, "extra": 1})

    def test_output_paths(self):
        for p in FIXTURE["outputPaths"]["safe"]:
            self.assertTrue(is_safe_output_path(p), p)
        for p in FIXTURE["outputPaths"]["unsafe"]:
            self.assertFalse(is_safe_output_path(p), p)

    def test_events(self):
        job = parse_job_request(VALID)
        self.assertEqual(progress_event(job, "training", 140)["progress"], 100.0)
        with self.assertRaises(ContractError):
            progress_event(job, "mining", 1)
        self.assertEqual(upload_urls_event(job, [{"path": "scene.sog", "sizeBytes": 10, "sha256": "x"}])["files"],
                         [{"path": "scene.sog", "sizeBytes": 10}])
        with self.assertRaises(ContractError):
            upload_urls_event(job, [{"path": "../x.sog", "sizeBytes": 1}])
        with self.assertRaises(ContractError):
            succeeded_event(job, [{"path": "scene.sog", "sizeBytes": 10}], {})
        f = failed_event(job, "bad code!", "x" * 900, True)
        self.assertEqual((f["code"], len(f["message"]), f["transient"]), ("INTERNAL_ERROR", 500, True))

    def test_provider_stubs_are_not_silently_implemented(self):
        with self.assertRaises(NotImplementedError):
            get_provider("varjo_teleport").run(parse_job_request(VALID), lambda s, p: None)
        with self.assertRaises(KeyError):
            get_provider("inria_original")


if __name__ == "__main__":
    unittest.main()
