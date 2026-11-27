"""Exercise a fresh server executable or the public port of a running local stack."""
import argparse
import http.client
import itertools
import json
import subprocess
import sys
import unittest
from urllib.parse import urlsplit


def plane(sign, lat=0, lon=0, altitude=10000):
    return dict(callSign=sign, latitudeDegrees=lat, longitudeDegrees=lon, altitudeFeet=altitude)


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if target.port is not None:
            cls.port = target.port
            return
        cls.server = subprocess.Popen([target.server_exe, "0"], stdout=subprocess.PIPE, text=True)
        cls.addClassCleanup(cls.stop_server)
        line = cls.server.stdout.readline().strip()
        if not line.startswith("Listening on "):
            raise RuntimeError("server did not announce a listening port: " + line)
        cls.port = urlsplit(line.split()[-1]).port

    @classmethod
    def stop_server(cls):
        cls.server.terminate()
        try:
            cls.server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            cls.server.kill()
            cls.server.wait()
        cls.server.stdout.close()

    def request(self, path, body=None, *, raw=None, expected=200):
        payload = raw if raw is not None else json.dumps(body) if body is not None else None
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        try:
            connection.request("GET" if payload is None else "POST", path, payload,
                               {"Content-Type": "application/json"})
            response = connection.getresponse()
            data = response.read()
            self.assertEqual(response.status, expected, data)
            self.assertEqual(response.getheader("Content-Type").split(";")[0], "application/json")
            result = json.loads(data)
            if expected == 400:
                self.assertTrue(result["error"])
            return result
        finally:
            connection.close()

    def test_health_and_config(self):
        self.assertEqual(self.request("/health"), {"status": "ok"})
        self.assertEqual(self.request("/api/config"), {
            "defaults": {"horizontalNm": 5, "verticalFeet": 1000},
            "limits": {"horizontalNm": {"min": 0.5, "max": 20},
                       "verticalFeet": {"min": 100, "max": 5000}, "aircraft": {"min": 2, "max": 50}}})

    def test_pair_and_reversed_order(self):
        aircraft = [plane("a123", lon=179.99), plane("b2", lon=-179.99, altitude=10400)]
        for order in (aircraft, aircraft[::-1]):
            result = self.request("/api/separation", {"aircraft": order})
            self.assertEqual(result["warningCount"], 1)
            pair, = result["pairs"]
            self.assertEqual([pair["callSignA"], pair["callSignB"]], [p["callSign"].upper() for p in order])
            self.assertAlmostEqual(pair["horizontalNm"], 1.200809, places=5)
            self.assertEqual((pair["verticalFeet"], pair["status"]), (400, "WARNING"))

    def test_counts_and_request_local_thresholds(self):
        body = {"aircraft": [plane("A"), plane("B", altitude=10100), plane("C", altitude=11000)]}
        for overrides, count in [({}, 2), ({"verticalFeet": 100}, 0),
                                 ({"horizontalNm": 20, "verticalFeet": 5000}, 3), ({}, 2)]:
            body["thresholds"] = overrides
            result = self.request("/api/conflicts", body)
            pairs = result["pairs"]
            self.assertEqual([(p["callSignA"], p["callSignB"]) for p in pairs], [("A","B"), ("A","C"), ("B","C")])
            self.assertEqual(result["warningCount"], count)
            self.assertTrue(all(p["status"] in {"WARNING", "NO_WARNING"} for p in pairs))
            self.assertEqual(sum(p["status"] == "WARNING" for p in pairs), count)

    def test_horizontal_override_and_equality(self):
        body = {"aircraft": [plane("A"), plane("B", lon=0.05)]}
        distance = self.request("/api/separation", body)["pairs"][0]["horizontalNm"]
        for threshold, expected in [(0.5, "NO_WARNING"), (distance, "NO_WARNING"), (5, "WARNING")]:
            body["thresholds"] = {"horizontalNm": threshold}
            self.assertEqual(self.request("/api/separation", body)["pairs"][0]["status"], expected)

    def test_inclusive_limits(self):
        result = self.request("/api/separation", {"aircraft": [
            plane("  a\t", -90, -180, -2000), plane(" Abc1234 ", 90, 180, 60000)]})
        pair, = result["pairs"]
        self.assertEqual((pair["callSignA"], pair["callSignB"]), ("A", "ABC1234"))
        self.assertEqual(pair["verticalFeet"], 62000)
        self.assertAlmostEqual(pair["horizontalNm"], 10807.2829, places=3)
        aircraft = [plane(f"P{i}") for i in range(20)]
        result = self.request("/api/conflicts", {"aircraft": aircraft})
        expected = list(itertools.combinations([p["callSign"] for p in aircraft], 2))
        self.assertEqual([(p["callSignA"], p["callSignB"]) for p in result["pairs"]], expected)
        self.assertEqual(result["warningCount"], 190)
        aircraft = [plane(f"P{i}") for i in range(50)]
        result = self.request("/api/conflicts", {"aircraft": aircraft})
        self.assertEqual(len(result["pairs"]), 1225)
        self.assertEqual(result["warningCount"], 1225)

    def test_invalid_aircraft(self):
        for field, values in {
            "callSign": ["", "  ", "1212", "12345678", "ABC12345", "A-B", "A B", "Å", "alpha", " alpha ", 42],
            "latitudeDegrees": [-90.01, 90.01, "0"],
            "longitudeDegrees": [-180.01, 180.01, None],
            "altitudeFeet": [-2000.1, 60000.1, True, float("nan"), float("inf")],
        }.items():
            for value in values:
                with self.subTest(field=field, value=value):
                    other = plane("B")
                    other[field] = value
                    self.request("/api/separation", {"aircraft": [plane("ALPHA"), other]}, expected=400)
        for field in plane("B"):
            other = plane("B")
            del other[field]
            self.request("/api/conflicts", {"aircraft": [plane("A"), other]}, expected=400)

    def test_invalid_requests(self):
        aircraft = [plane("A"), plane("B")]
        for thresholds in [None, [], {"horizontalNm": 0.49}, {"horizontalNm": 20.01},
                           {"verticalFeet": 99}, {"verticalFeet": 5001}, {"verticalFeet": "1000"},
                           {"horizontalNM": 5}]:
            self.request("/api/conflicts", {"aircraft": aircraft, "thresholds": thresholds}, expected=400)
        for body in [[], {}, {"aircraft": {}}, {"aircraft": [None, plane("A")]},
                     {"aircraft": []}, {"aircraft": [plane("A")]},
                     {"aircraft": [plane(f"P{i}") for i in range(51)]}]:
            self.request("/api/conflicts", body, expected=400)
        self.request("/api/separation", {"aircraft": aircraft + [plane("C")]}, expected=400)
        for raw in ["{", '{"aircraft":', '1e999', 'null']:
            self.request("/api/separation", raw=raw, expected=400)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    destination = parser.add_mutually_exclusive_group(required=True)
    destination.add_argument("server_exe", nargs="?", help="start this executable on a temporary port")
    destination.add_argument("--port", type=int, help="test an already running service on 127.0.0.1")
    target, test_args = parser.parse_known_args()
    unittest.main(argv=[sys.argv[0], *test_args], verbosity=2)
