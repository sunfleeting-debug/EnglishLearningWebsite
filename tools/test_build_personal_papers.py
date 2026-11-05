import unittest
from build_personal_papers import parse_questions, parse_listening, extract_writing_sections, parse_docx_reading, parse_exam_cloze

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

    def test_listening_options_are_reordered_and_unrelated_paragraphs_excluded(self):
        items = parse_listening(['1. A) one C) three', 'B) two D) four', 'Section B', 'Directions: ignore', '2. A) x B) y C) z D) w'], 'AB')
        self.assertEqual([x['t'] for x in items[0]['options']], ['one', 'two', 'three', 'four'])
        self.assertEqual(items[1]['answer'], 'B')

    def test_listening_rejects_incomplete_options(self):
        with self.assertRaises(ValueError):
            parse_listening(['1. A) one C) three D) four'], 'A')

    def test_subjective_sections_and_missing_graph(self):
        rows = [('Part I Writing', False), ('Directions: write an essay.', False), ('A chart', True),
                ('Part II Listening', False), ('Part IV Translation', False), ('Directions: translate.', False),
                ('这是完整的中文翻译题。', False)]
        essay, translation = extract_writing_sections(rows)
        self.assertIsNone(essay)
        self.assertEqual(translation, '这是完整的中文翻译题。')

    def test_docx_reading_preserves_wrapped_questions(self):
        rows = ['Passage One', 'Questions 46 to 50 are based on the following passage.', 'A passage.',
                '46. What does', 'it mean?', 'A) first', 'B) second', 'C) third', 'D) fourth', 'Passage Two']
        body, questions = parse_docx_reading(rows, 46, 'B')
        self.assertEqual(body, 'A passage.')
        self.assertEqual(questions[0]['stem'], 'What does it mean?')
        self.assertEqual(questions[0]['answer'], 'B')

    def test_cloze_preserves_percentages_and_checks_bank(self):
        words = '\n'.join(chr(65+i) + ') word' + str(i) for i in range(15))
        source = 'more than once.\n' + ' '.join(str(n) for n in range(26, 36)) + ' 32% and 35%\n' + words + '\nSection B'
        body, bank, questions = parse_exam_cloze(source, 'ABCDEFGHIJ')
        self.assertIn('32% and 35%', body)
        self.assertIn('【32】', body)
        self.assertEqual(len(bank), 15)
        self.assertEqual(questions[-1]['answer'], 'J')

if __name__ == "__main__":
    unittest.main()
