import unittest
from app import greeting


class GreetingTest(unittest.TestCase):
    def test_default_name(self):
        self.assertEqual(greeting()["message"], "Hello, community")

    def test_custom_name(self):
        self.assertEqual(greeting("researchers")["message"], "Hello, researchers")


if __name__ == "__main__":
    unittest.main()
