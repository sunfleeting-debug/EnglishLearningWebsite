import unittest

from build_paper_notes import clean_translation, parse_explanations, extract_translations, parse_scanned_explanations, format_translation, parse_reference_cloze


class PaperNotesTest(unittest.TestCase):
    def test_extracts_four_translations_at_section_boundaries(self):
        text = ('全文翻译·\n这是第一段译文。\nSectionB\n'
                '全文翻译·\n[A]这是第二段译文。\nSectionC\n'
                '全文翻译·\n这是第三段译文。\nPassageTwo\n'
                '全文翻译·\n这是第四段译文。\nPartIV\n')
        self.assertEqual(extract_translations(text), ['这是第一段译文。', '[A]这是第二段译文。', '这是第三段译文。', '这是第四段译文。'])

    def test_keeps_matching_explanation_only_for_the_verified_answer(self):
        text = '36. statement\n[答案][G][精解]定位至[G]段，这一段指出明确证据。\n37. statement\n[答案][B][精解]其他原因。'
        result = parse_explanations(text, {36: 'G', 37: 'A'}, 'match')
        self.assertEqual(result, {36: '定位至[G]段，这一段指出明确证据。'})

    def test_extracts_only_answer_rationale(self):
        text = '46. question\n[锁定答案]原文指出重要原因。故B正确。\n[排除干扰]A错误。\n47. next'
        self.assertEqual(parse_explanations(text, {46: 'B'}, 'reading'), {46: '原文指出重要原因。故B正确。'})

    def test_removes_pdf_page_noise(self):
        self.assertEqual(clean_translation('·\n第一行\n第二行。\n\U00100a8b\n12\n'), '第一行第二行。')

    def test_recognizes_answer_books_with_chinese_brackets(self):
        text = '36. 题目\n【答案】 H\n【精解】原文 H 段给出了理由。\n37. 题目\n【答案】B\n【精解】不应选入。'
        self.assertEqual(parse_scanned_explanations(text, {36: 'H', 37: 'A'}, 'match'), {36: '原文 H 段给出了理由。'})
        text = '46. 题目\n【锁定答案】B。文章给出了理由。\n【排除干扰】A 不对。\n47. 题目'
        self.assertEqual(parse_scanned_explanations(text, {46: 'B'}, 'reading'), {46: '文章给出了理由。'})

    def test_matching_translation_retains_paragraph_labels(self):
        self.assertEqual(format_translation('文章标题[A]第一段。[B]第二段。', True), '文章标题\n[A]第一段。\n[B]第二段。')

    def test_cloze_shared_explanation_matches_both_verified_answers(self):
        text = ('26.A)apple 27.B)book。[确定词性]两空应填名词。'
                '[锁定答案]第一空说苹果，第二空说书，因此分别应选apple和book。'
                '28.C)cat。[确定词性]名词。[锁定答案]上下文说猫。')
        result = parse_reference_cloze(text, {26: 'A', 27: 'B', 28: 'D'})
        self.assertIn('苹果', result[26])
        self.assertIn('苹果', result[27])
        self.assertNotIn(28, result)


if __name__ == '__main__':
    unittest.main()
