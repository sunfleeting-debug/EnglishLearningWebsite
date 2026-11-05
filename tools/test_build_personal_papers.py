import unittest
from build_personal_papers import parse_questions

class Questions(unittest.TestCase):
    def test_reads_wrapped_stems_and_options(self):
        q = parse_questions("46. Why is this\nimportant?\nA) one\nB) two\nC) three\nD) four\n", 46, 46, {46: ("B", "Explanation")})
        self.assertEqual(q[0]["stem"], "Why is this important?")
        self.assertEqual(q[0]["answer"], "B")
        self.assertEqual(q[0]["options"][1]["t"], "two")

    def test_rejects_missing_option(self):
        with self.assertRaises(ValueError):
            parse_questions("46. Why?\nA) one\nB) two\nD) four", 46, 46, {46: ("B", "")})

    def test_rejects_missing_verified_answer(self):
        with self.assertRaises(ValueError):
            parse_questions("46. Why?\nA) one\nB) two\nC) three\nD) four", 46, 46, {})

if __name__ == "__main__":
    unittest.main()
